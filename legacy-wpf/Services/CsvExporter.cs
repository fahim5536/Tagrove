using System.Globalization;
using System.IO;
using System.Text;
using CsvHelper;

namespace StockMeta.Services;

public sealed record CsvRow(string Filename, string Title, string Keywords, string Category, string Releases);

internal static class CsvExporter
{
    public static void Export(string path, IReadOnlyList<CsvRow> rows)
    {
        using var writer = new StreamWriter(path, false, new UTF8Encoding(encoderShouldEmitUTF8Identifier: true));
        using var csv = new CsvWriter(writer, CultureInfo.InvariantCulture);
        csv.WriteRecords(rows);
    }
}
