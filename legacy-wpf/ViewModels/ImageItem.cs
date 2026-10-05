using System.IO;
using System.Windows.Media;
using CommunityToolkit.Mvvm.ComponentModel;
using StockMeta.Models;

namespace StockMeta.ViewModels;

public enum ItemStatus
{
    Reading,
    New,
    Queued,
    Running,
    Done,
    Error
}

public sealed record CategoryOption(string Label, string Value);

public partial class ImageItem : ObservableObject
{
    public static readonly IReadOnlyList<CategoryOption> CategoryOptions =
        new[] { new CategoryOption("\u2014 select \u2014", "") }
            .Concat(AdobeCategories.All.Select(c => new CategoryOption(c, c)))
            .ToList();

    private static readonly SolidColorBrush NeutralBrush = Frozen(Color.FromRgb(0x9C, 0xA3, 0xAF));
    private static readonly SolidColorBrush InfoBrush = Frozen(Color.FromRgb(0x60, 0xA5, 0xFA));
    private static readonly SolidColorBrush RunningBrush = Frozen(Color.FromRgb(0xFB, 0xBF, 0x24));
    private static readonly SolidColorBrush OkBrush = Frozen(Color.FromRgb(0x34, 0xD3, 0x99));
    private static readonly SolidColorBrush ErrorBrush = Frozen(Color.FromRgb(0xF8, 0x71, 0x71));
    private static readonly SolidColorBrush WarnBrush = Frozen(Color.FromRgb(0xFB, 0xBF, 0x24));

    private static SolidColorBrush Frozen(Color color)
    {
        var brush = new SolidColorBrush(color);
        brush.Freeze();
        return brush;
    }

    public string FileName { get; }
    public string FullPath { get; }

    public string? GemB64 { get; set; }

    [ObservableProperty]
    [NotifyPropertyChangedFor(nameof(StatusText))]
    [NotifyPropertyChangedFor(nameof(StatusBrush))]
    private ItemStatus status = ItemStatus.Reading;

    [ObservableProperty] private string title = "";

    [ObservableProperty] private string keywordsText = "";

    [ObservableProperty] private string category = "";

    [ObservableProperty] private string? error;

    [ObservableProperty] private ImageSource? thumb;

    public ImageItem(string fullPath)
    {
        FullPath = fullPath;
        FileName = Path.GetFileName(fullPath);
    }

    partial void OnTitleChanged(string value) => NotifyIssue();
    partial void OnKeywordsTextChanged(string value) => NotifyIssue();
    partial void OnErrorChanged(string? value) => OnPropertyChanged(nameof(HasError));

    public bool HasError => !string.IsNullOrEmpty(Error);

    public int KeywordCount =>
        KeywordsText.Split(',', StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries).Length;

    public bool HasMeta => Title.Trim().Length > 0 || KeywordCount > 0;

    public bool HasIssue => IssueText.Length > 0;

    public string IssueText
    {
        get
        {
            if (Title.Length > 200)
                return "Title is over 200 characters.";
            var n = KeywordCount;
            if (n > 49)
                return $"{n} keywords is over the 49 limit.";
            if (n > 0 && n < 30)
                return $"Only {n} keywords \u2014 Adobe Stock wants at least 30.";
            return "";
        }
    }

    public Brush IssueBrush =>
        Title.Length > 200 || KeywordCount > 49 ? ErrorBrush : WarnBrush;

    public string StatusText => Status switch
    {
        ItemStatus.Reading => "Reading\u2026",
        ItemStatus.New => "Ready",
        ItemStatus.Queued => "Queued",
        ItemStatus.Running => "Generating\u2026",
        ItemStatus.Done => "Done",
        ItemStatus.Error => "Failed",
        _ => ""
    };

    public Brush StatusBrush => Status switch
    {
        ItemStatus.Reading => InfoBrush,
        ItemStatus.New => NeutralBrush,
        ItemStatus.Queued => InfoBrush,
        ItemStatus.Running => RunningBrush,
        ItemStatus.Done => OkBrush,
        ItemStatus.Error => ErrorBrush,
        _ => NeutralBrush
    };

    private void NotifyIssue()
    {
        OnPropertyChanged(nameof(KeywordCount));
        OnPropertyChanged(nameof(HasIssue));
        OnPropertyChanged(nameof(IssueText));
        OnPropertyChanged(nameof(IssueBrush));
        OnPropertyChanged(nameof(HasMeta));
    }
}
