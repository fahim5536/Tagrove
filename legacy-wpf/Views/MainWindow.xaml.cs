using System.Windows;
using StockMeta.ViewModels;
using Wpf.Ui.Controls;

namespace StockMeta.Views;

public partial class MainWindow : FluentWindow
{
    private readonly MainViewModel _vm = new();

    public MainWindow()
    {
        InitializeComponent();
        DataContext = _vm;
    }

    private void OnDragOver(object sender, DragEventArgs e)
    {
        e.Effects = e.Data.GetDataPresent(DataFormats.FileDrop)
            ? DragDropEffects.Copy
            : DragDropEffects.None;
        e.Handled = true;
        if (!_vm.IsDragging) _vm.IsDragging = true;
    }

    private void OnDragLeave(object sender, DragEventArgs e) => _vm.IsDragging = false;

    private void OnDrop(object sender, DragEventArgs e)
    {
        _vm.IsDragging = false;
        if (e.Data.GetData(DataFormats.FileDrop) is string[] files && files.Length > 0)
            _vm.AddPaths(files);
        e.Handled = true;
    }
}
