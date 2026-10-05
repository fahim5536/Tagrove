using System.Collections.ObjectModel;
using System.IO;
using System.Windows;
using System.Windows.Media;
using CommunityToolkit.Mvvm.ComponentModel;
using CommunityToolkit.Mvvm.Input;
using Microsoft.Win32;
using StockMeta.Models;
using StockMeta.Services;

namespace StockMeta.ViewModels;

public partial class MainViewModel : ObservableObject
{
    private static readonly SolidColorBrush ErrorTextBrush = Frozen(Color.FromRgb(0xF8, 0x71, 0x71));

    private static SolidColorBrush Frozen(Color color)
    {
        var brush = new SolidColorBrush(color);
        brush.Freeze();
        return brush;
    }

    private readonly GeminiService _gemini = new();
    private readonly HashSet<string> _seenPaths = new(StringComparer.OrdinalIgnoreCase);

    public ObservableCollection<ImageItem> Items { get; } = new();

    [ObservableProperty] private bool running;

    [ObservableProperty] private bool isDragging;

    [ObservableProperty] private int doneCount;

    [ObservableProperty] private int totalCount;

    [ObservableProperty] private string statusMessage = "Drag & drop images here, or click Add images.";

    [ObservableProperty] private bool isError;

    [ObservableProperty] private AppSettings settings = new("gemini-2.5-flash", false, null, null);

    public bool NotRunning => !Running;
    public bool IsEmpty => Items.Count == 0;
    public bool ShowBanner => string.IsNullOrEmpty(Settings.ApiKey);
    public string BannerText => Settings.KeyError ?? "No Gemini API key configured.";
    public double Percent => TotalCount == 0 ? 0 : Math.Round(DoneCount * 100.0 / TotalCount);
    public Brush? StatusBrush => IsError ? ErrorTextBrush : null;

    partial void OnRunningChanged(bool value) => OnPropertyChanged(nameof(NotRunning));
    partial void OnDoneCountChanged(int value) => OnPropertyChanged(nameof(Percent));
    partial void OnTotalCountChanged(int value) => OnPropertyChanged(nameof(Percent));
    partial void OnIsErrorChanged(bool value) => OnPropertyChanged(nameof(StatusBrush));

    partial void OnSettingsChanged(AppSettings value)
    {
        OnPropertyChanged(nameof(ShowBanner));
        OnPropertyChanged(nameof(BannerText));
    }

    public MainViewModel()
    {
        Items.CollectionChanged += (_, _) => OnPropertyChanged(nameof(IsEmpty));
        Settings = SettingsService.Load();
    }

    private static void OnUi(Action action)
    {
        var dispatcher = Application.Current?.Dispatcher;
        if (dispatcher is null || dispatcher.CheckAccess()) action();
        else dispatcher.Invoke(action);
    }

    private void SetStatus(string message, bool error) =>
        OnUi(() => { StatusMessage = message; IsError = error; });

    [RelayCommand]
    private void AddImages()
    {
        var dlg = new OpenFileDialog
        {
            Title = "Add images",
            Multiselect = true,
            Filter = "Images|*.jpg;*.jpeg;*.png;*.webp|All files|*.*"
        };
        if (dlg.ShowDialog(FindOwner()) != true) return;
        AddPaths(dlg.FileNames);
    }

    public void AddPaths(IEnumerable<string> paths)
    {
        var skipped = 0;
        var added = new List<string>();
        foreach (var raw in paths)
        {
            if (string.IsNullOrWhiteSpace(raw)) continue;
            if (!ImageProcessor.IsSupportedFile(raw))
            {
                skipped++;
                continue;
            }
            var full = Path.GetFullPath(raw);
            if (!_seenPaths.Add(full)) continue;
            added.Add(full);
        }

        if (skipped > 0)
            SetStatus($"{skipped} file(s) skipped \u2014 only JPG, PNG and WEBP are supported.", error: false);

        foreach (var path in added)
        {
            var item = new ImageItem(path);
            Items.Add(item);
            _ = Task.Run(() => ReadFileAsync(item));
        }
    }

    private async Task ReadFileAsync(ImageItem item)
    {
        try
        {
            var bytes = await File.ReadAllBytesAsync(item.FullPath);
            if (bytes.Length == 0)
            {
                FailRead(item, $"{item.FileName}: file is empty.");
                return;
            }
            var processed = await Task.Run(() => ImageProcessor.Process(bytes));
            OnUi(() =>
            {
                item.GemB64 = processed.GemB64;
                item.Thumb = processed.Thumb;
                item.Status = ItemStatus.New;
            });
        }
        catch (Exception ex)
        {
            _seenPaths.Remove(item.FullPath);
            FailRead(item, $"{item.FileName}: could not read file ({ex.Message}).");
        }
    }

    private void FailRead(ImageItem item, string message) =>
        OnUi(() => { item.Error = message; item.Status = ItemStatus.Error; });

    [RelayCommand]
    private Task GenerateAll() => RunGeneration(
        Items.Where(i => i.GemB64 is not null && i.Status != ItemStatus.Done).ToList());

    [RelayCommand]
    private Task Regenerate(ImageItem? item) =>
        item is null || Running || item.GemB64 is null || item.Status == ItemStatus.Done
            ? Task.CompletedTask
            : RunGeneration([item]);

    private async Task RunGeneration(IReadOnlyList<ImageItem> targets)
    {
        if (Running) return;
        var apiKey = Settings.ApiKey;
        if (string.IsNullOrEmpty(apiKey))
        {
            SetStatus("No Gemini API key set. Open Settings and paste your key.", error: true);
            return;
        }
        if (targets.Count == 0)
        {
            SetStatus("All rows are already generated.", error: false);
            return;
        }

        Running = true;
        IsError = false;
        DoneCount = 0;
        TotalCount = targets.Count;
        OnUi(() =>
        {
            foreach (var t in targets) t.Status = ItemStatus.Queued;
        });

        var results = await Task.WhenAll(targets.Select(t => GenerateOneAsync(t, apiKey)));
        var ok = results.Count(r => r);
        var failed = results.Length - ok;

        SetStatus($"Finished: {ok} succeeded, {failed} failed.", error: failed > 0);
        await Task.Delay(900);
        Running = false;
    }

    private async Task<bool> GenerateOneAsync(ImageItem item, string apiKey)
    {
        OnUi(() => { item.Error = null; item.Status = ItemStatus.Running; });
        try
        {
            var meta = await _gemini.GenerateAsync(apiKey, Settings.Model, item.GemB64!);
            OnUi(() =>
            {
                item.Title = meta.Title;
                item.KeywordsText = string.Join(",", meta.Keywords);
                if (meta.Category.Length > 0) item.Category = meta.Category;
                item.Status = ItemStatus.Done;
                DoneCount++;
            });
            return true;
        }
        catch (Exception ex)
        {
            var message = ex is GeminiError ? ex.Message : $"Unexpected error: {ex.Message}";
            OnUi(() =>
            {
                item.Error = message;
                item.Status = ItemStatus.Error;
                DoneCount++;
            });
            return false;
        }
    }

    [RelayCommand]
    private void ExportCsv()
    {
        if (Items.Count == 0)
        {
            SetStatus("Nothing to export yet \u2014 add images and generate metadata first.", error: true);
            return;
        }
        var dlg = new SaveFileDialog
        {
            Title = "Export CSV",
            Filter = "CSV files (*.csv)|*.csv",
            FileName = "adobe-stock-metadata.csv"
        };
        if (dlg.ShowDialog(FindOwner()) != true) return;

        try
        {
            var rows = Items.Select(i => new CsvRow(
                i.FileName,
                i.Title.Trim(),
                string.Join(",", GeminiService.NormalizeKeywords(i.KeywordsText.Split(','))),
                i.Category,
                "")).ToList();
            CsvExporter.Export(dlg.FileName, rows);

            var withIssues = Items.Count(i => i.HasIssue);
            var msg = $"Exported {rows.Count} row(s) to {Path.GetFileName(dlg.FileName)}.";
            if (withIssues > 0)
                msg += $" {withIssues} row(s) still have warnings \u2014 check the table before uploading.";
            SetStatus(msg, error: withIssues > 0);
        }
        catch (Exception ex)
        {
            SetStatus($"Could not write the CSV file ({ex.Message}).", error: true);
        }
    }

    [RelayCommand]
    private void OpenSettings()
    {
        var dlg = new Views.SettingsWindow(Settings) { Owner = FindOwner() };
        dlg.ShowDialog();
        if (dlg.DialogResult == true)
        {
            Settings = SettingsService.Load();
            SetStatus("Settings saved. The API key is stored in Windows Credential Manager.", error: false);
        }
    }

    [RelayCommand]
    private void RemoveItem(ImageItem? item)
    {
        if (item is null) return;
        if (item.HasMeta)
        {
            var answer = MessageBox.Show(
                FindOwner(),
                $"Remove \"{item.FileName}\" and its metadata?",
                "StockMeta",
                MessageBoxButton.YesNo,
                MessageBoxImage.Question);
            if (answer != MessageBoxResult.Yes) return;
        }
        Items.Remove(item);
        _seenPaths.Remove(item.FullPath);
    }

    private static Window? FindOwner() =>
        Application.Current?.Windows.OfType<Window>().FirstOrDefault(w => w.IsActive)
        ?? Application.Current?.MainWindow;
}
