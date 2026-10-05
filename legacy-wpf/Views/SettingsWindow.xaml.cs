using System.Windows;
using StockMeta.Services;
using Wpf.Ui.Controls;

namespace StockMeta.Views;

public partial class SettingsWindow : FluentWindow
{
    private static readonly string[] ModelSuggestions =
    {
        "gemini-2.5-flash",
        "gemini-2.5-flash-lite",
        "gemini-2.5-pro",
        "gemini-2.0-flash"
    };

    private readonly AppSettings _current;

    public SettingsWindow(AppSettings current)
    {
        InitializeComponent();
        _current = current;

        ModelBox.ItemsSource = ModelSuggestions;
        ModelBox.Text = current.Model;
        AiCheck.IsChecked = current.AiContent;

        if (!string.IsNullOrEmpty(current.KeyError))
        {
            KeyError.Text = current.KeyError;
            KeyError.Visibility = Visibility.Visible;
        }
        KeyHint.Text = string.IsNullOrEmpty(current.ApiKey)
            ? "Get a free key at aistudio.google.com/apikey"
            : $"Saved key {SettingsService.MaskKey(current.ApiKey)} \u2014 type a new key to replace it. Leave blank to keep the saved key.";
    }

    private void OnSave(object sender, RoutedEventArgs e)
    {
        var key = KeyBox.Password;
        var patch = new SettingsPatch(
            Model: ModelBox.Text,
            AiContent: AiCheck.IsChecked == true,
            ApiKey: string.IsNullOrWhiteSpace(key) ? null : key.Trim());
        try
        {
            SettingsService.Save(patch);
            DialogResult = true;
        }
        catch (Exception ex)
        {
            KeyError.Text = ex.Message;
            KeyError.Visibility = Visibility.Visible;
        }
    }
}
