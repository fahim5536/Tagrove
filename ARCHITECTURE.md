# Tagrove — Architecture

This document is the contract for how Tagrove is built. Every phase — current and
future — must follow these rules. When a rule needs to change, change it here first,
then in code.

Tagrove is a Windows desktop app (Electron) that generates Adobe Stock metadata
(title, description, keywords, category) for images with the Gemini API and exports
Adobe Stock–ready CSV files. It is developed in phases; the archived C#/WPF
implementation of the same product lives in `legacy-wpf/` as a behavioral reference
(its Gemini prompts and batching logic are worth carrying into Phase 2).

---

## 1. Tech stack

| Concern         | Choice                                                                |
| --------------- | --------------------------------------------------------------------- |
| Shell           | Electron (latest stable), electron-vite, electron-builder (NSIS, x64) |
| UI              | React 18, TypeScript (strict), Tailwind CSS v4, Zustand               |
| Validation      | zod (every IPC payload)                                               |
| Logging         | electron-log (file transport in the user data folder)                 |
| Testing         | Vitest (unit; colocated `*.test.ts`)                                  |
| Quality         | ESLint (flat config) + Prettier, `npm run verify` gate                |
| Package manager | npm                                                                   |

## 2. Process model

```
┌──────────────────────────────┐         ┌─────────────────────────────┐
│ Main process (Node)          │  IPC    │ Preload (sandboxed bridge)  │
│  - app lifecycle, window     │◄────────┤  - contextBridge.expose     │
│  - services: ai, storage,    │ invoke  │  - one method per channel   │
│    export, logger, updater   │         │  - no logic, no secrets     │
│  - zod validation, secrets   │         └──────────────┬──────────────┘
└──────────────────────────────┘                        │ window.api (typed)
                                                        ▼
                                         ┌─────────────────────────────┐
                                         │ Renderer (React UI only)    │
                                         │  - pages, components, stores│
                                         │  - no Node, no fetch, no fs │
                                         └─────────────────────────────┘
```

- **Main** owns everything privileged: file system, network (AI calls), secrets, dialogs.
- **Preload** only forwards typed calls. It contains zero business logic.
- **Renderer** is pure UI. It calls `window.api.*`, never `require`, `fetch`, or `fs`.

## 3. Directory layout

```
src/
  main/                 Node side
    index.ts            app lifecycle, single instance, global error handlers
    window.ts           BrowserWindow creation + webContents wiring
    security.ts         navigation/window-open/webview guards (every WebContents)
    paths.ts            userData paths (settings/secrets files)
    ipc/                one handler file per domain + validating wrapper
    services/           logger, storage, images (thumbnails), ai, export, updater,
                        db, diagnostics (opt-in crash reports + report builder)
    db/                 SQLite: migrations (with pre-migration backup), repositories
    config/             editable lists loader (categories, banned words)
    lib/                errors, hashing, dialogs, theme helpers, userDataMove
  preload/
    index.ts            the ONLY bridge; implements TagroveApi
  renderer/             Vite root (electron-vite convention)
    index.html          ships the production CSP meta tag
    src/
      main.tsx          entry, global error listeners, i18n init
      App.tsx           page switch + toast viewport + theme/language sync
      components/       ui/ (reusable kit), generate/ (table, bulk bar), layout/, icons
      pages/            GeneratePage, HistoryPage, SettingsPage, AboutPage
      store/            Zustand stores (one concern per store)
      hooks/            useAppInfo, useToast, useCategories, useThumbnailLoader, useVirtualRows
      lib/              cn, formatDate, unwrapIpc, autosave, bulk helpers
      i18n/             react-i18next setup + locales (en.json complete, bn.json starter)
      assets/main.css   Tailwind v4 entry + design tokens (@theme) + light theme overrides
      constants.ts      page meta, roadmap, toast/autosave tuning
  shared/               imported by main AND renderer AND build config
    constants.ts        app name, window, log, storage, CSP, AI limits — no magic values
    types.ts            payload shapes + IpcResult envelope + error codes
    ipc.ts              channel names, zod schemas, event schema, TagroveApi interface
    metadata.ts         shared metadata limits + validation (renderer badges = main rules)
    categories.json     editable category list (placeholder Adobe Stock IDs — see TODO)
    bannedWords.json    editable banned-words list applied during post-processing
resources/              app icon (png + ico), packaged via extraResources
scripts/                dev tooling: generate-icons.mjs (multi-size ICO),
                        generate-samples.mjs (5 sample + --count N perf images),
                        extract-release-notes.mjs (release notes from CHANGELOG)
.github/workflows/      CI (push/PR → verify) and Release (tag → publish)
legacy-wpf/             archived C#/WPF implementation (reference only)
```

Aliases: `@shared/*`, `@main/*`, `@renderer/*` — configured in `tsconfig.json`,
`electron.vite.config.ts`, and `vitest.config.ts` (keep them in sync).

## 4. Security rules (non-negotiable)

1. `contextIsolation: true`, `nodeIntegration: false`, `sandbox: true`,
   `webviewTag: false` on every BrowserWindow.
2. Strict CSP shipped as a meta tag in `index.html`. The production policy lives in
   `src/shared/constants.ts`; `electron.vite.config.ts` swaps in the dev policy while
   serving. Scripts are always `'self'` in production; `style-src 'unsafe-inline'` is
   required by React inline styles.
3. Navigation (`will-navigate`), `window.open`, and `<webview>` are denied for every
   WebContents (`src/main/security.ts`). If a future feature needs external links,
   add an explicit audited IPC channel that calls `shell.openExternal`.
4. Every IPC payload is validated in main with the channel's zod schema before the
   handler runs (`registerIpcHandler` in `src/main/ipc/wrapper.ts`).
5. Secrets (Gemini API key) are encrypted with `safeStorage` (DPAPI on Windows) in the
   main process. The renderer only ever learns `hasApiKey`. Secrets are never logged —
   the logger redacts secret-looking keys on every record (`redactSecrets`).
6. Devtools are disabled in packaged builds.

## 5. IPC contract

All renderer→main communication goes through `src/shared/ipc.ts`:

- Channel names live in `IPC_CHANNELS` (single source of truth, tested for uniqueness).
- Every request has a zod schema; every response is an `IpcResult<T>` envelope:
  `{ ok: true, data }` or `{ ok: false, error: { code, message } }`. Expected failures
  travel as data, so the renderer never depends on `invoke()` rejections.
- `TagroveApi` (in the same file) is the typed surface the renderer sees as
  `window.api`. The renderer must use `import type` when importing from `@shared/ipc`
  so no validation code is bundled into the page.

Error codes (`src/shared/types.ts`): `VALIDATION`, `INTERNAL`, `UNAVAILABLE`,
`NOT_IMPLEMENTED`, `NOT_FOUND`.

### How to add a channel (do it in this order)

1. Add the name to `IPC_CHANNELS` in `src/shared/ipc.ts`.
2. Define the zod request schema (+ inferred type) in the same file.
3. Define the response type in `src/shared/types.ts`.
4. Extend `TagroveApi`.
5. Add the `invoke()` call in `src/preload/index.ts`.
6. Create/extend a handler file in `src/main/ipc/`:
   `registerIpcHandler(IPC_CHANNELS.MY_CHANNEL, mySchema, (input) => ...)`.
   Services do the work; handlers only adapt. Throw `AppError` with a code for
   expected failures.
7. Call it from the renderer: `unwrapIpc(await window.api.domain.method(...))`.
8. Add schema tests in `src/shared/ipc.test.ts`, then `npm run verify`.

## 6. Services (main process)

Each service is a folder under `src/main/services/<name>/index.ts` exposing an
interface + implementation object. Handlers depend on interfaces, never the reverse.

| Service     | Status                  | Notes                                                                                           |
| ----------- | ----------------------- | ----------------------------------------------------------------------------------------------- |
| logger      | done                    | electron-log, file in userData, redaction hook                                                  |
| storage     | done (settings/secrets) | settings in SQLite; API key stays in its safeStorage file                                       |
| db          | done                    | openDatabase/getDb, migrations (pre-migration backup), repositories — see the Data section      |
| images      | done                    | import+hashing+dedupe, nativeImage thumbnails (LRU), downscaling                                |
| ai          | done                    | Gemini via @google/genai, presets, response schema, queue                                       |
| export      | done                    | Adobe Stock CSV (encoding/pattern/AI-marker from settings)                                      |
| updater     | done                    | electron-updater behind UpdaterLike; GitHub Releases, stable/beta channels, typed events        |
| diagnostics | done                    | opt-in Sentry (scrubbed) + clipboard diagnostics report; inert without a build-time DSN env var |

Phase rule: when you implement a stub, keep the interface shape already declared here,
wire it to a new IPC channel through the standard steps, and update this table.

## 7. Data layer (SQLite)

All persistence lives in the main process. The database file is
`<userData>/tagrove.db` (WAL mode, foreign keys on), opened by
`services/db/index.ts` during bootstrap; tests open `:memory:` databases and call the
repositories directly, which is why every repository function takes the db handle.

**Schema (migration 1):**

- `projects` — id, name, timestamps, `ai_generated`, `last_export_path`
- `images` — id, project_id (cascade), path (unique per project), file_name, size,
  mtime, `file_hash` (SHA-256, indexed), `missing`, `sort_order`
- `metadata` — image_id (cascade), title, keywords (JSON array), category_id,
  `edited` flag, model, preset_id, status (idle/pending/running/done/failed), error,
  generated_at, updated_at
- `presets` — prompt presets (instructions, keyword range, tone, always-include and
  never-use lists, is_builtin; the four built-ins are seeded on first run)
- `settings` — JSON key/value store for every preference (model, concurrency, image
  edge, retries, export options, appearance, language, activeProjectId, lastPresetId)

**Migration rules (non-negotiable):** migrations are numbered files in
`src/main/db/migrations.ts` and run inside a transaction guarded by
`PRAGMA user_version`. Never edit a migration that has shipped — always add a new one
with the next version number. Never store data outside the schema without a
migration. Before any pending migration runs, the database file is backed up via
better-sqlite3's online backup into `<userData>/backups/` (newest few kept), so a
failed migration always leaves a restore point; updates never touch user data
otherwise.

**Native module note:** better-sqlite3 v13 ships Node-API prebuilds, so the same
binary loads in Electron and in Node (Vitest) with no rebuild step; electron-builder
unpacks `**/*.node` from the asar. If a future dependency does need an Electron-ABI
rebuild, use `electron-builder install-app-deps` and keep the Vitest suite working
(N-API packages preferred).

**Renderer↔database flow:** renderer edits never write SQL. Inline edits go through
`projects:save-metadata` (debounced autosave, sets `edited=1`); generation results
are persisted by main itself when the queue emits events (so results survive
restarts even if the window is closed mid-run); the active project id lives in
`settings` and is restored at startup via `ensureActiveProject`.

**Editable config lists.** `src/shared/categories.json` and
`src/shared/bannedWords.json` are data, not code: `src/main/config/lists.ts` reads
them from disk at startup (from `resources/shared-config` in packaged builds, with a
zod-validated bundled fallback) so they can be tuned without a rebuild. Restart the
app after editing. The category IDs are placeholders until the official Adobe Stock
IDs are filled in (TODO note inside the file).

**Main → renderer events.** Long-running work (generation, updates) pushes progress
instead of being polled: main sends typed payloads over the `generation:event` and
`updater:event` channels via `webContents.send`, the preload exposes one
`onEvent(listener): unsubscribe` subscription per stream (pure plumbing, no
logic), and the renderer validates every payload against the stream's schema
(`generationEventSchema`, `updaterEventSchema`) before applying it to a store. To
add an event, extend the relevant schema union and handle the new variant in the
owning store.

## 8. Logging

- electron-log writes to `<userData>/logs/tagrove.log` (5 MB rotation).
- Level: `debug` in dev, `info` in packaged builds; console echo only in dev.
- `logger` is the root logger; services use `scopedLogger('domain')`.
- Every record passes through `redactSecrets` — keys like `apiKey`, `token`,
  `password`, `authorization`, `secret`, `credential` are replaced with `[REDACTED]`.
- The renderer reports errors through the `log:write` channel (validated + redacted);
  `log.initialize()` also captures renderer console output.

## 9. Error handling

- **Main:** `uncaughtException` / `unhandledRejection` are logged and shown in a native
  error dialog; renderer crashes (`render-process-gone`) and hangs (`unresponsive`)
  are logged.
- **Renderer:** `ErrorBoundary` wraps the whole tree and renders `ErrorScreen` with a
  reload action; global `error` / `unhandledrejection` listeners push a toast and
  forward the report to the main log.
- Expected IPC failures are values (`IpcResult`), handled with `unwrapIpc` + try/catch
  at the call site.

## 10. State & styling

- Zustand: one store per concern (`navigation.store.ts`, `ui.store.ts`,
  `generation.store.ts`), accessed via selectors. Never put server/IPC data in global
  state unless multiple pages need it.
- `generation.store.ts` owns the workflow state: rows, thumbnails, keyword drafts,
  the single-level undo slot, and run progress. Main-process events are applied
  through `applyGenerationEvent`, which is unit-tested.
- Navigation is Zustand-driven page switching (`PageId` + `PAGE_META`). Revisit only if
  deep links or routing history become necessary.
- Tailwind v4 (CSS-first): design tokens live in `src/renderer/src/assets/main.css`
  under `@theme` (colors, fonts, animations). Use tokens (`bg-surface`, `text-fg-muted`,
  `border-border`); do not hard-code hex values in components. Dark theme only.
- Components take `className` and merge with `cn()`; variant maps are plain objects so
  Tailwind can see every class literal.

## 11. Testing

- Vitest, unit level, colocated as `*.test.ts` next to the code.
- What must be tested: shared schemas/contracts and validation, pure main logic
  (redaction, output cleaning, CSV quoting), and the generation queue — its `delay`
  is injected so backoff/retry/cancel tests run without real timers — plus renderer
  stores and pure utilities. Electron API surface (services touching `electron`)
  gets integration tests in a later phase — keep those modules thin.

## 12. Versioning & release

- Semver from `0.1.0`. Bump `package.json` version per release; every user-facing
  change updates `CHANGELOG.md` (Keep a Changelog format). The full release
  procedure — tagging, publishing, testing the update path, and the pre-release
  checklist — lives in `RELEASING.md`.
- Build config is `electron-builder.cjs` (not `.js` — on Windows, PATHEXT makes a
  root `electron-builder.js` shadow the CLI and silently package nothing; `.cjs`
  is in the auto-detect list and never executable). It is environment-driven:
  code signing reads either classic PFX vars (`CSC_LINK`/`CSC_KEY_PASSWORD`) or
  Azure Trusted Signing vars (seven `AZURE_*` values) — all-or-nothing per
  method, partial configuration fails the build, and with no secrets configured
  the build is simply unsigned. **No signing secrets in the repository.**
- `npm run dist` builds `release/Tagrove-<version>-x64-Setup.exe` (assisted NSIS:
  per-user default + optional per-machine, custom install dir, desktop/Start Menu
  shortcuts; uninstall keeps `%APPDATA%/Tagrove`) plus the blockmap and
  `latest.yml` (the electron-updater feed: version, file name, SHA-512, size).
- Publishing goes through GitHub Releases (`.github/workflows/release.yml`, on tag
  `v*.*.*`): verify → build → sign with repository secrets → publish installer +
  blockmap + latest.yml → attach the matching CHANGELOG section as release notes.
  Dashed tags (`v1.1.0-beta.1`) publish as pre-releases, which only the beta
  update channel sees. `ci.yml` runs verify + format:check on every push/PR.
- Until a signing certificate is configured, the installer is unsigned — expect a
  SmartScreen warning.
- `npm run verify` (typecheck + lint + test + build) must pass before every commit that
  ships.

## 13. Conventions

- TypeScript strict plus `noUncheckedIndexedAccess`, `verbatimModuleSyntax`
  (`import type` for types), `noUnusedLocals/Parameters`.
- Config/constants in `src/shared/constants.ts`; no magic strings or numbers in feature
  code (UI copy in components is fine).
- Files: components PascalCase, stores `*.store.ts`, hooks `use*.ts`, tests
  `*.test.ts` next to the subject.
- Node/DOM boundaries are lint-enforced: renderer may not import `electron`/`@main/*`
  or use Node globals; main/preload may not touch DOM globals.

## 14. Phase roadmap

| Phase | Scope                                                                                                                                          |
| ----- | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| 1     | Foundation: hardened shell, IPC framework, services skeleton, UI kit, docs ✅                                                                  |
| 2     | Image import, Gemini generation with queue/retries, editable results table, CSV export ✅                                                      |
| 3     | History persistence and review workflow ✅ (shipped as 0.3.0)                                                                                  |
| 4     | Production readiness: auto-update, installer polish, env-var code signing, CI/CD, opt-in diagnostics, splash, lazy pages ✅ (shipped as 1.0.0) |
