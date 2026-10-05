using System.IO;
using System.Text.RegularExpressions;
using System.Windows.Media;
using System.Windows.Media.Imaging;
using SkiaSharp;

namespace StockMeta.Services;

public sealed record ProcessedImage(string GemB64, ImageSource Thumb);

public static class ImageProcessor
{
    private const int GemMaxEdge = 1024;
    private const int GemQuality = 85;
    private const int ThumbEdge = 140;
    private const int ThumbQuality = 72;

    private static readonly Regex SupportedRegex =
        new(@"\.(jpe?g|png|webp)$", RegexOptions.IgnoreCase | RegexOptions.CultureInvariant);

    public static bool IsSupportedFile(string path) => SupportedRegex.IsMatch(path);

    public static string MimeFromName(string name)
    {
        var ext = Path.GetExtension(name).ToLowerInvariant();
        return ext switch
        {
            ".jpg" or ".jpeg" => "image/jpeg",
            ".png" => "image/png",
            ".webp" => "image/webp",
            _ => ""
        };
    }

    public static ProcessedImage Process(byte[] bytes)
    {
        using var stream = new SKManagedStream(new MemoryStream(bytes));
        using var codec = SKCodec.Create(stream) ?? throw new InvalidDataException("Unsupported or corrupted image.");
        using var decoded = SKBitmap.Decode(codec, new SKImageInfo(codec.Info.Width, codec.Info.Height))
            ?? throw new InvalidDataException("Unsupported or corrupted image.");
        using var upright = ApplyOrigin(decoded, codec.EncodedOrigin);

        var gemBytes = EncodeJpeg(upright, GemMaxEdge, GemQuality);
        var thumbBytes = EncodeJpeg(upright, ThumbEdge, ThumbQuality);
        return new ProcessedImage(Convert.ToBase64String(gemBytes), CreateThumb(thumbBytes));
    }

    private static byte[] EncodeJpeg(SKBitmap source, int maxEdge, int quality)
    {
        var maxSide = Math.Max(source.Width, source.Height);
        var scale = Math.Min(1.0, (double)maxEdge / maxSide);
        var width = Math.Max(1, (int)Math.Round(source.Width * scale));
        var height = Math.Max(1, (int)Math.Round(source.Height * scale));

        using var scaled = new SKBitmap(width, height);
        using (var canvas = new SKCanvas(scaled))
        {
            canvas.Clear(SKColors.White);
            using var image = SKImage.FromBitmap(source);
            canvas.DrawImage(image, new SKRect(0, 0, width, height), new SKSamplingOptions(SKFilterMode.Linear));
        }
        using var encoded = SKImage.FromBitmap(scaled).Encode(SKEncodedImageFormat.Jpeg, quality);
        return encoded.ToArray();
    }

    private static ImageSource CreateThumb(byte[] jpegBytes)
    {
        var thumb = new BitmapImage();
        using var ms = new MemoryStream(jpegBytes);
        thumb.BeginInit();
        thumb.CacheOption = BitmapCacheOption.OnLoad;
        thumb.CreateOptions = BitmapCreateOptions.IgnoreImageCache;
        thumb.StreamSource = ms;
        thumb.EndInit();
        thumb.Freeze();
        return thumb;
    }

    private static SKBitmap ApplyOrigin(SKBitmap src, SKEncodedOrigin origin)
    {
        var w = src.Width;
        var h = src.Height;
        return origin switch
        {
            SKEncodedOrigin.TopLeft => src,
            SKEncodedOrigin.TopRight => DrawTransformed(src, w, h, c => { c.Translate(w, 0); c.Scale(-1, 1); }),
            SKEncodedOrigin.BottomRight => DrawTransformed(src, w, h, c => { c.Translate(w, h); c.RotateDegrees(180); }),
            SKEncodedOrigin.BottomLeft => DrawTransformed(src, w, h, c => { c.Translate(0, h); c.Scale(1, -1); }),
            SKEncodedOrigin.LeftTop => DrawTransformed(src, h, w, c => { c.Scale(-1, 1); c.RotateDegrees(90); }),
            SKEncodedOrigin.RightTop => DrawTransformed(src, h, w, c => { c.Translate(h, 0); c.RotateDegrees(90); }),
            SKEncodedOrigin.RightBottom => DrawTransformed(src, h, w, c => { c.Translate(0, w); c.Scale(1, -1); c.RotateDegrees(90); }),
            SKEncodedOrigin.LeftBottom => DrawTransformed(src, h, w, c => { c.Translate(0, w); c.RotateDegrees(-90); }),
            _ => src
        };
    }

    private static SKBitmap DrawTransformed(SKBitmap src, int width, int height, Action<SKCanvas> setup)
    {
        var dst = new SKBitmap(width, height);
        using (var canvas = new SKCanvas(dst))
        {
            canvas.Clear(SKColors.White);
            setup(canvas);
            using var image = SKImage.FromBitmap(src);
            canvas.DrawImage(image, 0f, 0f, new SKSamplingOptions(SKFilterMode.Linear));
        }
        return dst;
    }
}
