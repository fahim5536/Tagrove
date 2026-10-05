using System.IO;
using System.Text.Json;

namespace StockMeta.Services;

public sealed record SettingsPatch(string? Model = null, bool? AiContent = null, string? ApiKey = null);

public sealed record AppSettings(string Model, bool AiContent, string? ApiKey, string? KeyError);

public static class SettingsService
{
    private static readonly string SettingsPath = Path.Combine(
        Environment.GetFolderPath(Environment.SpecialFolder.ApplicationData),
        "StockMeta",
        "settings.json");

    public static string NormalizeModel(string model)
    {
        var m = (model ?? "").Trim();
        return m.StartsWith("models/", StringComparison.OrdinalIgnoreCase) ? m["models/".Length..] : m;
    }

    public static AppSettings Load()
    {
        var model = "gemini-2.5-flash";
        var aiContent = false;
        try
        {
            if (File.Exists(SettingsPath))
            {
                using var doc = JsonDocument.Parse(File.ReadAllText(SettingsPath));
                var root = doc.RootElement;
                if (root.TryGetProperty("model", out var modelEl) && modelEl.ValueKind == JsonValueKind.String)
                {
                    var s = modelEl.GetString();
                    if (!string.IsNullOrWhiteSpace(s)) model = NormalizeModel(s);
                }
                if (root.TryGetProperty("aiContent", out var aiEl))
                    aiContent = aiEl.ValueKind == JsonValueKind.True;
            }
        }
        catch
        {
            // corrupted settings file -> fall back to defaults
        }

        var key = CredentialStore.ReadKey(out var keyError);
        return new AppSettings(model, aiContent, key, keyError);
    }

    public static AppSettings Save(SettingsPatch? patch)
    {
        var current = Load();
        var model = current.Model;
        var aiContent = current.AiContent;
        var apiKey = current.ApiKey;
        if (patch is not null)
        {
            if (!string.IsNullOrWhiteSpace(patch.Model)) model = NormalizeModel(patch.Model);
            if (patch.AiContent.HasValue) aiContent = patch.AiContent.Value;
            if (!string.IsNullOrWhiteSpace(patch.ApiKey)) apiKey = patch.ApiKey.Trim();
        }

        if (!string.IsNullOrEmpty(apiKey))
            CredentialStore.WriteKey(apiKey);

        Directory.CreateDirectory(Path.GetDirectoryName(SettingsPath)!);
        File.WriteAllText(SettingsPath, JsonSerializer.Serialize(new { model, aiContent }));
        return new AppSettings(model, aiContent, apiKey, null);
    }

    public static string MaskKey(string key) =>
        key.Length > 8 ? "\u2022\u2022\u2022\u2022\u2022\u2022" + key[^4..] : "\u2022\u2022\u2022\u2022\u2022\u2022";
}
