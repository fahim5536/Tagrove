using System.Net.Http;
using System.Net.Http.Headers;
using System.Text;
using System.Text.Json;
using System.Text.Json.Serialization;
using System.Text.RegularExpressions;
using StockMeta.Models;

namespace StockMeta.Services;

public sealed class GeminiError : Exception
{
    public bool Retryable { get; }
    public int RetryAfterMs { get; }

    public GeminiError(string message, bool retryable = false, int retryAfterMs = 0)
        : base(message)
    {
        Retryable = retryable;
        RetryAfterMs = retryAfterMs;
    }
}

public sealed class GeminiService
{
    private const int MaxRetries = 3;
    private const int MaxKeywords = 49;

    private static readonly HttpClient Http = new() { Timeout = Timeout.InfiniteTimeSpan };
    private readonly SemaphoreSlim _gate = new(3, 3);

    private static readonly string PromptText = BuildPrompt();

    public event Action<int, int, Exception>? RetryScheduled;

    private static string BuildPrompt()
    {
        const string body =
            """
            You are an expert Adobe Stock metadata writer for commercial stock photography.

            Look at the image and write metadata that complies with Adobe Stock rules.

            Return ONLY a JSON object with this exact shape:
            {
              "title": string,
              "keywords": string[],
              "category": string
            }

            Rules for "title":
            - English, descriptive, natural sentence-style phrase describing the main subject, setting and mood.
            - Between 70 and 180 characters.
            - No brand names, trademarks, artist names or celebrity names; do not mention visible logos or watermarks.
            - No surrounding quotes, no trailing period.

            Rules for "keywords":
            - Between 35 and 45 keywords (never more than 49, never fewer than 30).
            - Single words or short 2-3 word phrases, all lowercase.
            - Ordered from most relevant to least relevant; the first 10 are the most important.
            - No duplicates, no artist or brand names, no single letters, no numbers.
            - Cover: main subject, attributes, actions, setting, background elements, colors, composition, mood, concepts and likely search terms.

            Rules for "category":
            - Choose exactly one category from this list:
            """;
        return body + string.Join("\n", AdobeCategories.All.Select(c => "- " + c));
    }

    public async Task<GeneratedMeta> GenerateAsync(string apiKey, string model, string imageB64, CancellationToken ct = default)
    {
        var name = SettingsService.NormalizeModel(model);
        var attempt = 0;
        while (true)
        {
            try
            {
                await _gate.WaitAsync(ct);
                try
                {
                    return await RequestOnce(apiKey, name, imageB64, ct);
                }
                finally
                {
                    _gate.Release();
                }
            }
            catch (GeminiError err) when (err.Retryable && attempt < MaxRetries && !ct.IsCancellationRequested)
            {
                var wait = Math.Max(err.RetryAfterMs, Math.Min(12000, 2000 * (1 << attempt))) + Random.Shared.Next(750);
                RetryScheduled?.Invoke(attempt + 1, wait, err);
                attempt++;
                await Task.Delay(wait, ct);
            }
        }
    }

    private static async Task<GeneratedMeta> RequestOnce(string apiKey, string model, string imageB64, CancellationToken ct)
    {
        var url = $"https://generativelanguage.googleapis.com/v1beta/models/{Uri.EscapeDataString(model)}:generateContent";
        var payload = new
        {
            contents = new object[]
            {
                new
                {
                    role = "user",
                    parts = new object[]
                    {
                        new { text = PromptText },
                        new { inline_data = new { mime_type = "image/jpeg", data = imageB64 } }
                    }
                }
            },
            generationConfig = new { temperature = 0.4, responseMimeType = "application/json" }
        };
        var json = JsonSerializer.Serialize(payload);

        using var timeoutCts = CancellationTokenSource.CreateLinkedTokenSource(ct);
        timeoutCts.CancelAfter(TimeSpan.FromSeconds(120));

        HttpResponseMessage res;
        try
        {
            using var req = new HttpRequestMessage(HttpMethod.Post, url);
            req.Content = new StringContent(json, Encoding.UTF8, "application/json");
            req.Headers.Add("x-goog-api-key", apiKey);
            res = await Http.SendAsync(req, timeoutCts.Token);
        }
        catch (OperationCanceledException) when (!ct.IsCancellationRequested)
        {
            throw new GeminiError("Gemini request timed out.", retryable: true);
        }
        catch (HttpRequestException)
        {
            throw new GeminiError("Network error. Check your internet connection.", retryable: true);
        }

        var respText = await res.Content.ReadAsStringAsync(timeoutCts.Token);

        if (!res.IsSuccessStatusCode)
        {
            var status = (int)res.StatusCode;
            throw new GeminiError(
                HttpErrorMessage(status, ExtractErrorDetail(respText), model),
                retryable: status == 429 || status >= 500,
                retryAfterMs: RetryAfterMs(res.Headers.RetryAfter));
        }

        GeminiResponseDto? data;
        try
        {
            data = JsonSerializer.Deserialize<GeminiResponseDto>(respText);
        }
        catch (JsonException)
        {
            throw new GeminiError("Could not parse the Gemini response.", retryable: true);
        }

        var blockReason = data?.PromptFeedback?.BlockReason;
        if (!string.IsNullOrEmpty(blockReason))
            throw new GeminiError($"Gemini refused this image ({blockReason}). Try another image.");

        var candidate = data?.Candidates?.FirstOrDefault();
        if (candidate is null)
            throw new GeminiError("Gemini returned an empty response.", retryable: true);

        var finish = candidate.FinishReason;
        if (!string.IsNullOrEmpty(finish) && finish != "STOP")
        {
            throw new GeminiError(
                finish == "MAX_TOKENS"
                    ? "Gemini response was cut off. Try again."
                    : $"Gemini stopped early ({finish}). Try again.",
                retryable: finish == "MAX_TOKENS");
        }

        var text = string.Concat(candidate.Content?.Parts?.Select(p => p.Text ?? "") ?? Array.Empty<string>());

        JsonElement parsed;
        try
        {
            parsed = ExtractJson(text);
        }
        catch (JsonException)
        {
            throw new GeminiError("Gemini returned unexpected output. Try again.", retryable: true);
        }
        return SanitizeMetadata(parsed);
    }

    private static string HttpErrorMessage(int status, string detail, string model)
    {
        var suffix = detail.Length > 0 ? $" ({detail})" : "";
        switch (status)
        {
            case 400:
                if (Regex.IsMatch(detail, "api key", RegexOptions.IgnoreCase))
                    return "Invalid Gemini API key. Open Settings and correct it.";
                return $"Gemini rejected the request{suffix}. If the model name is wrong, fix it in Settings.";
            case 401 or 403:
                return $"The API key was rejected{suffix}. Check the key and that the Generative Language API is enabled for it.";
            case 404:
                return $"Model \"{model}\" was not found. Check the model name in Settings.";
            case 429:
                return "Gemini rate limit reached. Wait a minute and try again, or lower the batch size.";
            case 408 or 504:
                return "Gemini took too long to respond.";
            case >= 500:
                return "Gemini service error. Try again later.";
            default:
                return $"Gemini request failed (HTTP {status}){suffix}.";
        }
    }

    private static string ExtractErrorDetail(string respText)
    {
        try
        {
            using var doc = JsonDocument.Parse(respText);
            if (doc.RootElement.TryGetProperty("error", out var err)
                && err.TryGetProperty("message", out var msg)
                && msg.ValueKind == JsonValueKind.String)
            {
                return msg.GetString() ?? "";
            }
        }
        catch
        {
            // body was not JSON; keep detail empty
        }
        return "";
    }

    private static int RetryAfterMs(RetryConditionHeaderValue? header)
    {
        if (header is null) return 0;
        if (header.Delta.HasValue)
        {
            var seconds = header.Delta.Value.TotalSeconds;
            return seconds > 0 ? (int)Math.Min(seconds * 1000, 30000) : 0;
        }
        if (header.Date.HasValue)
        {
            var seconds = (header.Date.Value - DateTimeOffset.UtcNow).TotalSeconds;
            return seconds > 0 ? (int)Math.Min(seconds * 1000, 30000) : 0;
        }
        return 0;
    }

    private static JsonElement ExtractJson(string text)
    {
        var t = (text ?? "").Trim();
        var fence = Regex.Match(t, "```(?:json)?\\s*([\\s\\S]*?)```", RegexOptions.IgnoreCase);
        if (fence.Success) t = fence.Groups[1].Value.Trim();
        var start = t.IndexOf('{');
        var end = t.LastIndexOf('}');
        if (start >= 0 && end > start) t = t[start..(end + 1)];
        using var doc = JsonDocument.Parse(t);
        return doc.RootElement.Clone();
    }

    public static List<string> NormalizeKeywords(JsonElement raw)
    {
        if (raw.ValueKind == JsonValueKind.Array)
        {
            return NormalizeKeywords(raw.EnumerateArray().Select(e =>
                e.ValueKind == JsonValueKind.String ? e.GetString() : e.ToString()));
        }
        if (raw.ValueKind == JsonValueKind.String)
            return NormalizeKeywords((raw.GetString() ?? "").Split(','));
        return [];
    }

    public static List<string> NormalizeKeywords(IEnumerable<string?> parts)
    {
        var seen = new HashSet<string>(StringComparer.Ordinal);
        var result = new List<string>();
        foreach (var part in parts)
        {
            var k = Regex.Replace(part ?? "", "\\s+", " ").Trim().ToLowerInvariant();
            if (k.Length == 0 || !seen.Add(k)) continue;
            result.Add(k);
            if (result.Count >= MaxKeywords) break;
        }
        return result;
    }

    public static string MatchCategory(string raw)
    {
        var c = (raw ?? "").Trim().ToLowerInvariant();
        if (c.Length == 0) return "";
        var exact = AdobeCategories.All.FirstOrDefault(x => x.ToLowerInvariant() == c);
        if (exact is not null) return exact;
        return AdobeCategories.All.FirstOrDefault(
            x => c.Contains(x.ToLowerInvariant()) || x.ToLowerInvariant().Contains(c)) ?? "";
    }

    private static GeneratedMeta SanitizeMetadata(JsonElement parsed)
    {
        if (parsed.ValueKind != JsonValueKind.Object)
            throw new GeminiError("Gemini returned unexpected output. Try again.", retryable: true);

        var title = parsed.TryGetProperty("title", out var titleEl) && titleEl.ValueKind == JsonValueKind.String
            ? Regex.Replace(titleEl.GetString() ?? "", "\\s+", " ").Trim()
            : "";

        var keywords = parsed.TryGetProperty("keywords", out var keywordsEl)
            ? NormalizeKeywords(keywordsEl)
            : [];

        if (title.Length == 0 && keywords.Count == 0)
            throw new GeminiError("Gemini returned empty metadata. Try again.", retryable: true);

        var category = "";
        if (parsed.TryGetProperty("category", out var categoryEl))
        {
            var raw = categoryEl.ValueKind == JsonValueKind.String ? categoryEl.GetString() : categoryEl.ToString();
            category = MatchCategory(raw ?? "");
        }
        return new GeneratedMeta(title, keywords, category);
    }

    private sealed class GeminiResponseDto
    {
        [JsonPropertyName("promptFeedback")] public PromptFeedbackDto? PromptFeedback { get; set; }
        [JsonPropertyName("candidates")] public CandidateDto[]? Candidates { get; set; }
    }

    private sealed class PromptFeedbackDto
    {
        [JsonPropertyName("blockReason")] public string? BlockReason { get; set; }
    }

    private sealed class CandidateDto
    {
        [JsonPropertyName("finishReason")] public string? FinishReason { get; set; }
        [JsonPropertyName("content")] public ContentDto? Content { get; set; }
    }

    private sealed class ContentDto
    {
        [JsonPropertyName("parts")] public PartDto[]? Parts { get; set; }
    }

    private sealed class PartDto
    {
        [JsonPropertyName("text")] public string? Text { get; set; }
    }
}
