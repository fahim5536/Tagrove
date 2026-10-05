# Releasing Tagrove

This is the step-by-step guide for cutting a release, from version bump to a
published, signed, auto-updatable installer on GitHub Releases. `ARCHITECTURE.md`
describes how the pieces are built; this document describes how to operate them.

## Overview: what a release consists of

1. A version bump in `package.json` + a matching `CHANGELOG.md` entry.
2. A git tag `v<version>` pushed to GitHub.
3. The **Release workflow** (`.github/workflows/release.yml`) builds the installer
   on GitHub's Windows runner, signs it with the method configured in repository
   secrets, and publishes:
   - `Tagrove-<version>-x64-Setup.exe` — the NSIS installer
   - `Tagrove-<version>-x64-Setup.exe.blockmap` — enables differential updates
     (only changed blocks of the installer are downloaded)
   - `latest.yml` — the update feed electron-updater reads (contains the version,
     file name, SHA-512 hash, and size)
   - Release notes taken from the matching `CHANGELOG.md` section
4. Installed apps pick the release up through the in-app updater (Settings →
   Update channel: **stable** or **beta**).

## Step-by-step: cutting a release

1. **Decide the version.** Semver: `1.x.0` for features, `1.0.x` for fixes.
   Beta builds use a dash, e.g. `1.1.0-beta.1` — the workflow automatically
   publishes dashed tags as GitHub _pre-releases_, which the stable channel
   ignores and the beta channel installs.
2. **Bump `package.json`:**
   ```powershell
   npm version --no-git-tag-version <version>
   ```
3. **Add the `CHANGELOG.md` entry.** New `## [<version>] — YYYY-MM-DD` section at
   the top, Keep a Changelog format. The release notes attached to the GitHub
   Release are extracted from exactly this section
   (`scripts/extract-release-notes.mjs`) — an entry with no matching heading
   fails the workflow, which is intentional.
4. **Run the full gate locally:**
   ```powershell
   npm run verify        # typecheck + lint + test + build
   npm run format:check  # prettier
   npm run audit --omit=dev
   ```
5. **Optional but recommended: build the installer locally** and smoke-test it
   (see "Testing the update path" below for what to check):
   ```powershell
   npm run dist
   ```
   Signing is skipped automatically when no certificate is configured — a local
   build works unsigned.
6. **Commit, tag, push:**
   ```powershell
   git add package.json CHANGELOG.md
   git commit -m "release: v<version>"
   git tag v<version>
   git push origin main --tags
   ```
   The workflow fails fast if the tag does not match `package.json`.
7. **Watch the run.** GitHub → Actions → **Release**. It runs verify first, then
   electron-builder with `--publish always`, then overwrites the release notes
   with the CHANGELOG section.
8. **Check the published release.** GitHub → Releases → `v<version>`:
   three files (Setup.exe, blockmap, latest.yml) and the notes. **Do not edit
   latest.yml by hand** — its SHA-512 must match the installer byte-for-byte or
   every client will report a checksum error.
9. **Test the release** on a clean machine or VM before announcing it
   (checklist at the bottom).

## One-time setup

### GitHub repository

The app id and repo are read by `electron-builder.cjs` from `package.json`'s
`repository` field (or `GH_OWNER`/`GH_REPO` env vars). The updater's feed URL comes
from the same place, so this must match where the releases actually live:

```json
"repository": {
  "type": "git",
  "url": "https://github.com/fahim5536/Tagrove.git"
}
```

If the repository is ever renamed or moved, update this field **before** cutting the
next release — installed clients follow the feed baked into the previous build.

The Release workflow needs no extra setup for publishing — it uses the
automatically-provided `GITHUB_TOKEN` with `contents: write`.

### Code signing (repository secrets)

Nothing about signing lives in the repository; everything is env-var driven and
injected as GitHub secrets. Two supported methods — pick **one**:

| Method                      | Repository secrets                                                                                                                                                         | When                                           |
| --------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------- |
| **Classic PFX certificate** | `CSC_LINK` (base64 of the .pfx), `CSC_KEY_PASSWORD`                                                                                                                        | You bought an OV/EV cert from a CA             |
| **Azure Trusted Signing**   | `AZURE_TENANT_ID`, `AZURE_CLIENT_ID`, `AZURE_CLIENT_SECRET`, `AZURE_ENDPOINT`, `AZURE_CODE_SIGNING_ACCOUNT_NAME`, `AZURE_CERTIFICATE_PROFILE_NAME`, `AZURE_PUBLISHER_NAME` | You onboarded to Trusted Signing (recommended) |

Rules enforced by `electron-builder.cjs`:

- Set **all** secrets of a method or **none** — a partially configured method
  fails the build with a clear message instead of silently mis-signing.
- With no secrets at all, signing is skipped and the build succeeds — that is
  how local/dev builds stay unsigned.

#### Choosing a signing method

- **Azure Trusted Signing** (Microsoft, `https://trustedsigning.eastus.cloudapp.azure.com`
  or `westeurope` endpoints): a cloud HSM-backed signing service — your private
  key never exists on your disk, certs rotate automatically, and Microsoft
  manages SmartScreen reputation. Costs about **$9.99/month** (basic tier,
  includes 5,000 signatures/month). Identity validation is required: an
  individual identity needs a 3+ year verifiable history; organizations go
  through a business validation process. Currently the cheapest sane option for
  a solo/small project.
- **OV (Organization Validation) certificate** from a CA (Sectigo, SSL.com,
  GlobalSign, Certum "Open Source" for individuals): roughly **$100–400/year**
  depending on vendor and validity period. Historically shipped as a file, but
  since 2023 the CA/Browser Forum requires private keys on hardware (USB token
  or HSM) — so you receive a USB token or use the CA's cloud HSM, export a PFX,
  and base64 it into `CSC_LINK`. SmartScreen reputation builds up over
  downloads (days to weeks), not instantly.
- **EV (Extended Validation) certificate**: roughly **$250–700/year**, stricter
  organization vetting, hardware-key requirement as well. The traditional
  advantage was immediate SmartScreen reputation; Microsoft's own guidance and
  field reports now say Trusted Signing (and even OV with enough downloads)
  achieve similar results, so EV is mostly worth it for enterprise
  procurement requirements.
- **Unsigned** (current state): everything works, but Windows SmartScreen shows
  "Windows protected your PC" on first install and users must click
  _More info → Run anyway_. Reputation accrues slowly per-download without a
  cert.

## The updater contract (what must never break)

- **Update feed**: `latest.yml` on the GitHub release. The updater checks ~10 s
  after launch and on demand from Settings/About ("Check for updates").
- **Channels**: `stable` maps to `channel: stable, allowPrerelease: false`;
  `beta` to `channel: beta, allowPrerelease: true`. Pre-releases are invisible
  to stable users.
- **Differential updates**: keep publishing the `.blockmap` — with it, a
  135 MB installer typically downloads as a 20–40 MB delta.
- **User data safety on update** (non-negotiable):
  1. The updater only replaces program files; the database and settings live in
     `%APPDATA%\Tagrove`, which NSIS never touches
     (`deleteAppDataOnUninstall: false`, and that only applies to uninstall).
  2. On first launch of a new version, migrations run inside a transaction
     guarded by `PRAGMA user_version` — forward-only, rollback-safe.
  3. **Before any migration runs, the database is backed up** via
     better-sqlite3's online backup into `<userData>\backups\tagrove-<oldver>.db`
     (WAL content included; the newest few are kept, older ones pruned). If a
     migration ever fails, the backup is the recovery path — copy it back over
     `tagrove.db` and run the previous app version.
  4. `quitAndInstall` only ever runs after the user clicked "Restart and update"
     (or the app quits normally after `autoInstallOnAppQuit`), so no work is
     lost mid-run: generation results are persisted by the main process as they
     arrive, not on exit.

## App icon

`resources/icon.ico` (7 embedded sizes: 16/24/32/48/64/128 as BMP + 256 as
compressed PNG) is **generated**, not hand-made. To change branding:

1. Replace `resources/icon.png` with a 1024×1024 RGBA master.
2. Run:
   ```powershell
   node scripts/generate-icons.mjs
   ```
   The script decodes the PNG, box-filter-downscales each size (premultiplied
   alpha), and writes a valid multi-size ICO — no native/image tooling needed.
3. The next `npm run dist` picks it up: NSIS uses it for the installer, the
   shortcuts, and the window/taskbar icon (Electron reads the ico embedded in
   the exe).

## Performance samples

`scripts/generate-samples.mjs` creates end-to-end test images:

- `node scripts/generate-samples.mjs` — 5 detailed images into `samples/`
- `node scripts/generate-samples.mjs --count 1000` — 1000 perf images into
  `samples/perf/` (unique hashes by construction; used to verify the virtualized
  table, thumbnail LRU, and import hashing stay responsive at scale)

## Testing the update path (before every release)

1. Install the **previous** published version on a clean Windows VM/user
   profile (or keep a dedicated profile for it).
2. Import a few images, generate metadata, note a couple of rows — user data
   that must survive.
3. Publish/serve the new version (for a real test: the actual GitHub release;
   locally you can point `dev-app-update.yml` at a file:// feed instead).
4. In the old app: no banner → "Check for updates" → banner appears with the
   new version → download completes → "Restart and update" → app relaunches on
   the new version.
5. Verify after the update: projects and edits intact; if a migration ran,
   `%APPDATA%\Tagrove\backups\` contains the pre-migration copy; the About page
   shows the new version.
6. Also test the **stable/beta split**: a `1.1.0-beta.1` tag must be invisible
   to a stable-channel install and offered to a beta-channel install.

## Pre-release checklist

- [ ] `npm run verify` and `npm run format:check` pass locally
- [ ] `package.json` version == tag; CHANGELOG has the matching `## [x.y.z]` heading
- [ ] `repository.url` in `package.json` points at the real GitHub repo
- [ ] Signing secrets all present (or intentionally none → unsigned release)
- [ ] Installed and ran the built Setup.exe on a clean Windows profile
- [ ] Golden path: import → generate → edit → export CSV opens in Excel with
      correct columns and no mojibake (BOM present)
- [ ] Update test from the previous version passed (data intact, backup created)
- [ ] Uninstall test: app removed, `%APPDATA%\Tagrove` retained by design
- [ ] Release page shows Setup.exe + blockmap + latest.yml + CHANGELOG notes
- [ ] SmartScreen behavior noted for the release announcement (signed vs not)
