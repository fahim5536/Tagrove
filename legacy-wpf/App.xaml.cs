using System.Windows;
using System.Windows.Threading;
using Wpf.Ui.Appearance;

namespace StockMeta;

public partial class App : Application
{
    protected override void OnStartup(StartupEventArgs e)
    {
        base.OnStartup(e);
        ApplicationThemeManager.Apply(ApplicationTheme.Dark);

        DispatcherUnhandledException += (_, args) =>
        {
            MessageBox.Show(
                "Unexpected error: " + args.Exception.Message,
                "StockMeta",
                MessageBoxButton.OK,
                MessageBoxImage.Error);
            args.Handled = true;
        };

        var window = new Views.MainWindow();
        MainWindow = window;
        window.Show();
    }
}
