# Privacy

Tagrove is an offline-first desktop app. This note explains, in plain terms,
what leaves your machine and what does not.

## The short version

- Your **images never leave your machine except** when you run generation —
  then only the ones you selected are sent to Google's Gemini API, downscaled
  to ≤1024 px, using **your own API key**. See Google's terms for how they
  handle request data.
- Your **Gemini API key** is stored encrypted with Windows DPAPI and is **never**
  visible to the app's UI (only "a key exists"), **never** written to logs, and
  **never** included in exports, diagnostics, or crash reports.
- **No telemetry is collected by default.** Crash reporting is **off** until you
  turn it on in Settings.
- Update checks contact GitHub Releases (only when the app is installed and
  packaged; dev builds never check).

## What is stored locally

All under `%APPDATA%\Tagrove`:

| Data                                                 | Where                                               | Notes                                                     |
| ---------------------------------------------------- | --------------------------------------------------- | --------------------------------------------------------- |
| Projects, image records, metadata, presets, settings | `tagrove.db` (SQLite)                               | Editable list configs live in the install folder          |
| Gemini API key                                       | an encrypted file (Windows DPAPI via `safeStorage`) | Tied to your Windows user account                         |
| Thumbnails cache                                     | `cache/`                                            | Clearable from Settings → Data                            |
| Log file                                             | `logs/tagrove.log`                                  | 5 MB rotating; secrets redacted at write time             |
| Pre-migration database backups                       | `backups/`                                          | Auto-created before any schema migration; newest few kept |

Uninstalling the app (per-user NSIS) removes program files but deliberately
keeps this folder, so your work survives reinstalls. Delete the folder manually
if you want everything gone.

## Crash reports (opt-in)

Settings → Privacy → "Send crash reports" is **off** by default. If you turn it
on:

- Only error/crash reports are sent (stack traces, app version, OS info).
- Before anything is sent, the report is scrubbed: your user data folder path
  and any user/home directory paths are replaced with `[data folder]` /
  `[user path]`, and `server_name`/`user` fields are removed.
- **No images, no API keys, no file names of your photos, no absolute paths.**
- The reports go to a Sentry project operated by the Tagrove developers. A DSN
  must be configured by the distributor (via environment variable at build
  time); if none is, the setting does nothing.

## "Copy diagnostics" (About page)

The diagnostics report you can copy to the clipboard is for pasting into a bug
report. It contains: app/Electron/Node versions, OS version and architecture,
locale, update channel, crash-report setting, uptime, heap usage, and the last
lines of the log file. Paths are scrubbed to `[data folder]`/`[user path]` and
secret-shaped values are replaced with `[REDACTED]`. It is **only** placed on
your clipboard — you choose where to paste it; nothing is sent anywhere.

## Network calls, exhaustively

| Call                                             | When                                                                | Payload                                                       |
| ------------------------------------------------ | ------------------------------------------------------------------- | ------------------------------------------------------------- |
| Gemini API (`generativelanguage.googleapis.com`) | you start a generation                                              | downscaled images + your prompt/preset settings, your API key |
| GitHub Releases                                  | installed app: ~10 s after launch and on manual "Check for updates" | standard HTTPS request; no account info, no identifiers       |
| Sentry                                           | only if crash reports are on, and only on an error                  | scrubbed crash report (see above)                             |

Nothing else — no analytics, no ads, no "phone home" of any other kind. The app
loads no remote web content (strict CSP, no webviews); the renderer cannot make
network requests at all.

## Exports

CSV exports contain exactly what you see in the table (file names, titles,
keywords, category) and go wherever you save them. The AI-generated marker, if
enabled for a project, is written into the Releases column per Adobe Stock's
requirements.
