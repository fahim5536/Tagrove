# Changelog

All notable changes to Tagrove are documented here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/); versioning follows
[Semantic Versioning](https://semver.org/).

> **Note:** the app was renamed from StockMeta to **Tagrove** in 0.3.1. Entries
> below 0.3.1 intentionally keep the former name — they describe releases that
> shipped under it.

## [1.0.0] — 2026-10-05

Phase 3: production readiness, distribution, and updates. First stable release.

### Added

- **Auto-update** (electron-updater + GitHub Releases): installed builds check
  silently ~10 s after launch and on demand ("Check for updates"); a non-intrusive
  banner offers **Restart and update / Later** (the app never restarts itself);
  downloads are differential via the published blockmap; the **stable/beta
  channel** setting controls whether GitHub pre-releases are offered. Progress
  flows to the UI as typed `updater:event` payloads (zod-validated in the
  renderer; manual checks are single-flight and never run in dev builds).
- **User-data safety on update**: before any database migration runs, the SQLite
  file is backed up via better-sqlite3's online backup into
  `%APPDATA%/Tagrove/backups/` (WAL included; the newest few are kept, older
  ones pruned). Migrations remain transactional and forward-only, so a failed
  update leaves a restore point, and the updater only replaces program files —
  the user data folder is untouched.
- **Splash screen**: a static HTML splash (wordmark + spinner) paints before the
  renderer bundle loads, so the window never flashes white; React replaces it on
  mount. The production CSP meta tag is unchanged.
- **Lazy-loaded pages**: History, Settings, and About load on first navigation
  (React.lazy + Suspense), shrinking the initial renderer payload.
- **Opt-in crash reporting** (Sentry): off by default; when the user enables it
  _and_ the distributor configured a DSN at build time (environment variable,
  never committed), error reports are scrubbed before leaving the machine —
  user paths become `[user path]`/`[data folder]`, `server_name`/`user` are
  dropped, and no images, API keys, or file names are ever included.
- **Diagnostics** (About → "Copy diagnostics"): a clipboard-ready report with
  app/Electron/Node versions, OS, locale, update channel, crash-report setting,
  uptime, heap usage, and a scrubbed tail of the log file — paths and
  secret-shaped values redacted.
- **CI/CD**: GitHub Actions `CI` workflow (push/PR → typecheck, lint, tests,
  build, format check on windows-latest) and `Release` workflow (tag `v*.*.*` →
  verify → build → sign with repository secrets → publish the installer,
  blockmap, and `latest.yml` to a GitHub Release, with the matching CHANGELOG
  section attached as release notes; dashed tags like `v1.1.0-beta.1` publish as
  pre-releases). A guard fails the release early if the tag and `package.json`
  version disagree.
- **Branding tooling**: `scripts/generate-icons.mjs` builds the multi-size
  `resources/icon.ico` (16–128 BMP + 256 PNG entry) from the 1024-px
  `icon.png` master with no image tooling required; regenerated icon now covers
  shortcut, taskbar, installer, and window.
- **Performance tooling**: `scripts/generate-samples.mjs --count N` (up to 5000)
  produces content-unique perf images for scale testing; 1000-image runs stay
  responsive (virtualized table, LRU thumbnails, streamed hashing).
- Documentation: **RELEASING.md** (step-by-step release process, signing options
  and costs, update-path testing, pre-release checklist) and **PRIVACY.md**
  (what data is stored, what leaves the machine, and what never does).

### Changed

- **Installer** (electron-builder): assisted NSIS installer with an
  install-mode page — per-user by default (no elevation), per-machine optional —
  plus a customizable installation directory, desktop and Start Menu shortcuts,
  and an uninstaller that deliberately keeps `%APPDATA%/Tagrove` so user data
  survives reinstalls.
- **Build config** is now `electron-builder.cjs` and environment-driven: code
  signing uses either a classic PFX (`CSC_LINK`/`CSC_KEY_PASSWORD`) or Azure
  Trusted Signing (seven `AZURE_*` variables) — all or nothing per method, with
  a clear failure on partial configuration, and no signing secrets in the
  repository. With nothing configured, builds are simply unsigned (dev keeps
  working). The `.cjs` extension is deliberate: on Windows, a root
  `electron-builder.js` shadows the CLI through PATHEXT and silently does
  nothing.
- **Versioning**: 0.3.1 → 1.0.0; README and ARCHITECTURE updated for the 1.0
  state (updater, signing, CI, release process).

## [0.3.1] — 2026-10-03

### Changed

- **Renamed the app to Tagrove** everywhere: package name/productName, Electron
  appId (`com.tagrove.app`), installer artifact and NSIS shortcut names, window
  title, in-app strings and both i18n locales, logger and export defaults, and the
  documentation. Version bumped to 0.3.1 with no functional changes beyond the
  migration below.
- Because Electron derives the user data folder from the app name, existing data
  would have appeared lost; a one-time migration now handles it (see Added).

### Added

- One-time user data migration (`src/main/lib/userDataMove.ts`): on first launch,
  if the former `%APPDATA%/StockMeta` folder exists and Tagrove's folder has no app
  data yet, its contents (SQLite database, secrets, settings, logs, caches) are
  copied to `%APPDATA%/Tagrove`, verified file-by-file (name + byte size), and the
  database is renamed `stockmeta.db` → `tagrove.db`. The old folder is left
  untouched as a backup, and a marker file prevents the migration from re-running.
- After the migration, the stored Gemini API key is decrypt-checked; if the OS-level
  encryption key does not carry over, a clear dialog asks the user to re-enter the
  key in Settings.
- Unit tests for the migration (copy/verify/rename, idempotency, skip, and error
  paths).

## [0.3.0] — 2026-10-03

### Added

- **Local database** (Phase 2): SQLite via `better-sqlite3` in the main process
  (Node-API prebuilds load in both Electron and Node — no rebuild step needed),
  WAL mode, and a versioned migration system (`PRAGMA user_version`, transactional,
  forward-only). Tables: `projects`, `images` (path + SHA-256 hash + missing flag),
  `metadata` (title/keywords/category, edited flag, model + preset used, timestamps),
  `presets`, and a `settings` key-value table.
- **Projects & history**: every batch is a project; the active project is restored on
  launch (crash/restart recovery). History page lists projects with date, image count,
  done/failed counts, and last export path, with open, rename, duplicate, delete, and
  re-export actions; new projects are created from History.
- **Autosave**: every inline edit persists to the database (debounced 600 ms); pending
  edits are flushed before a generation run starts so they cannot be overwritten.
- **Duplicate detection**: imported files are hashed (streamed SHA-256) and content
  duplicates already in the project are skipped with a warning toast.
- **Missing-file handling**: files that disappeared show a "missing" state (grayscale
  row + relink button); a generation failure caused by a deleted file marks the row
  missing automatically; relinking opens a file picker and re-hashes.
- **Presets**: reusable prompt setups (extra AI instructions, keyword count range,
  tone, always-include and never-use keyword lists). Four built-ins ship (Photo,
  Vector / Illustration, Isolated on white, Business concept); a preset is selected
  before generating and flows into the Gemini prompt and post-processing.
- **AI-generated content flag** per project; exports write the marker into the
  Releases column.
- **Settings page, organized in sections**: API (key, model selector with known-model
  suggestions, "Test connection" with latency result), Generation (parallel requests
  1–8, image size sent to the AI, retry count), Export (default folder with picker,
  CSV encoding with/without BOM, filename pattern with {project}/{date}/{time}
  tokens), Appearance (dark/light/system), Language, and Data (open data folder,
  clear thumbnail cache, export/import settings+presets as validated JSON — the API
  key is never exported).
- **i18n**: all UI strings extracted into locale files (`react-i18next`); English is
  complete, a Bengali starter set ships, and the language switch applies instantly.
- **Light theme**: full light palette via CSS token overrides; appearance follows
  settings including the OS-native "system" mode (nativeTheme + window background).
- **Productivity**: row selection with bulk actions (regenerate, add keyword to all,
  remove keyword from all, find & replace in titles with match count), search across
  file names/titles/keywords, filters (failed / edited / invalid), and keyboard
  shortcuts (Ctrl+Enter generate, Ctrl+E export, Ctrl+F search, Ctrl+Z undo, ? help)
  documented in an in-app dialog.
- Unit tests for migrations (incl. rollback), project save/load/duplicate/delete,
  preset seeding and application (prompt + post-processing), filename pattern
  rendering, bulk edit helpers, CSV encoding options, and queue retry/context —
  118 tests total.

### Changed

- Settings moved from `settings.json` into the SQLite `settings` table (one-time
  import of the legacy file; the key stays in its encrypted safeStorage file).
- `npm run verify` now covers the expanded suite; electron-builder unpacks
  `**/*.node` so the SQLite native library loads from the asar package.

## [0.2.0] — 2026-10-03

### Added

- Image import (Phase 1 core workflow): drag-and-drop anywhere on the Generate page
  plus a multi-select file picker for JPG/PNG/WEBP; unsupported, unreadable, oversized,
  and duplicate files are rejected with a toast and a per-file reason.
- Virtualized results table that stays responsive with 500+ images: thumbnail, file
  name, editable title, editable comma-separated keywords, category dropdown, keyword
  count, per-row validation badges, status chip, and a per-row Regenerate button.
- Thumbnails are generated in the main process via Electron `nativeImage`, LRU-cached
  (path + mtime keyed), and fetched lazily for visible rows so large imports never
  flood the IPC channel or the UI.
- Gemini integration in `services/ai` using the official `@google/genai` SDK: images
  are downscaled (≤1024 px long edge, JPEG) before upload; Title/Keywords/Category are
  generated in English with a JSON response schema, zod-validated, and retried once on
  invalid output; the model name is configurable in Settings (default
  `gemini-2.5-flash`).
- Post-processing pipeline: trim/collapse whitespace, case-insensitive keyword
  dedupe, keyword cap (49), title cap (200), and an editable banned-words list
  (`src/shared/bannedWords.json`) stripped from titles (whole word) and keywords
  (whole-word match drops the keyword).
- Editable category list (`src/shared/categories.json`) with placeholder Adobe Stock
  category IDs and a TODO note; loaded from disk at startup (packaged via
  `resources/shared-config`) with bundled fallback, so IDs can be corrected without
  touching code.
- Batch generation: Generate All / Regenerate / Retry failed with a main-process queue
  (configurable parallel requests, default 3), per-row status
  (idle/pending/running/done/failed), overall progress bar, Cancel, and exponential
  backoff (1s/2s/4s) on 429 and network errors with friendly per-row error messages.
- Inline editing with single-level undo (Ctrl+Z) for title, keywords, and category.
- CSV export in the exact Adobe Stock column order — Filename, Title, Keywords,
  Category, Releases — with proper quoting, CRLF line endings, UTF-8 BOM, and a
  native save dialog; a confirmation modal warns when rows have validation issues.
- New IPC channels: `config:get-categories`, `settings:set-model`,
  `settings:set-concurrency`, `images:pick-files`, `images:inspect`,
  `images:get-thumbnail`, `generation:start`, `generation:cancel`, `export:csv`, plus
  the `generation:event` main→renderer push channel (zod-validated in the renderer).
- Unit tests for metadata validation, CSV quoting (commas, quotes, newlines, BOM),
  output cleaning, and queue/retry/cancel logic.
- `scripts/generate-samples.mjs` producing five sample images for end-to-end testing.

### Changed

- Settings state gained `model` and parallel-request configuration; the Settings page
  gained a Generation card.

## [0.1.0] — 2026-10-03

### Added

- Electron + electron-vite + React 18 + TypeScript (strict) project scaffold with
  electron-builder NSIS packaging for Windows x64.
- Hardened main process: single-instance lock, `contextIsolation`/`sandbox` enabled,
  strict CSP (dev/prod policies in one place), blocked navigation, `window.open`, and
  `<webview>`; minimum window size and branded window icon.
- Typed IPC framework: all channels declared in `src/shared/ipc.ts` with zod-validated
  requests and an `IpcResult` envelope; preload exposes a typed `window.api` bridge.
- Services skeleton: logger (electron-log + secret redaction), storage (settings +
  safeStorage-encrypted secrets), and stubs for ai (Gemini), export (CSV), updater.
- Renderer foundation: dark Linear/Vercel-style theme with Tailwind v4 design tokens,
  sidebar shell (Generate / History / Settings / About), UI kit (Button, Input, Table,
  Modal, Toast, ProgressBar, DetailList), Zustand stores, global error handling with a
  friendly error screen.
- Settings page stores/removes the Gemini API key (encrypted in main; renderer only
  ever sees whether a key exists). About page shows runtime info and the roadmap.
- Tooling and conventions: ESLint (flat) + Prettier, Vitest unit tests, `.editorconfig`,
  `.gitignore`, `.nvmrc`, README, this changelog, and ARCHITECTURE.md as the standing
  contract for future phases.
- Brand icon carried over from the archived WPF implementation (`resources/`).
