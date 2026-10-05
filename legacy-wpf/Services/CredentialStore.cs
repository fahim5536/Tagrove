using Meziantou.Framework.Win32;

namespace StockMeta.Services;

internal static class CredentialStore
{
    private const string Target = "StockMeta/GeminiApiKey";
    private const int ErrorCodeNotFound = 1168;
    private const int HResultNotFound = unchecked((int)0x80070490);

    public static string? ReadKey(out string? error)
    {
        error = null;
        try
        {
            var pwd = CredentialManager.ReadCredential(Target)?.Password;
            return string.IsNullOrEmpty(pwd) ? null : pwd;
        }
        catch (Exception ex) when (ex.HResult == ErrorCodeNotFound || ex.HResult == HResultNotFound)
        {
            return null;
        }
        catch (Exception ex)
        {
            error = $"Saved API key could not be read from Windows Credential Manager ({ex.Message}). Re-enter it in Settings.";
            return null;
        }
    }

    public static void WriteKey(string apiKey)
    {
        CredentialManager.WriteCredential(Target, "StockMeta", apiKey, CredentialPersistence.LocalMachine);
    }
}
