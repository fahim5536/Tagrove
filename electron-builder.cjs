// electron-builder configuration.
//
// This file replaces the former electron-builder.yml. It exists as code (not
// YAML) so signing and publishing can be driven by environment variables —
// no secrets and no account-specific values live in the repository.
//
// IMPORTANT: this file must be named electron-builder.cjs, NOT .js. Windows
// includes .JS in PATHEXT, so a root-level electron-builder.js shadows the
// electron-builder CLI itself (npm runs the config file instead of the
// builder; it exits 0 silently and packages nothing). The .cjs extension is
// still auto-detected by electron-builder and is never executable.
//
// Local development: set none of the variables below and `npm run dist`
// produces an unsigned installer without publishing anything.
//
// Code signing — pick ONE method (Azure takes precedence if both are set):
//
//   Classic PFX certificate (OV/EV):
//     WIN_CSC_LINK          base64-encoded .pfx certificate
//     WIN_CSC_KEY_PASSWORD  the certificate's password
//     (read natively by electron-builder — no config needed here)
//
//   Azure Trusted Signing (the private key never leaves Microsoft):
//     AZURE_TENANT_ID                 service principal tenant
//     AZURE_CLIENT_ID                 service principal client id
//     AZURE_CLIENT_SECRET             service principal secret
//     AZURE_ENDPOINT                  e.g. https://wus.codesigning.azure.net
//     AZURE_CODE_SIGNING_ACCOUNT_NAME Trusted Signing account name
//     AZURE_CERTIFICATE_PROFILE_NAME  certificate profile name
//     AZURE_PUBLISHER_NAME            e.g. CN=Tagrove Team (must match profile)
//
// Publishing (GitHub Releases, driven by the release workflow):
//     GH_TOKEN   token with repo write access (GH_TOKEN/GITHUB_TOKEN work)
//     GH_OWNER   GitHub user/org (defaults to package.json repository URL)
//     GH_REPO    repository name   (defaults to package.json repository URL)
const { readFileSync } = require('node:fs')

function azureSigning() {
  const required = [
    'AZURE_TENANT_ID',
    'AZURE_CLIENT_ID',
    'AZURE_CLIENT_SECRET',
    'AZURE_ENDPOINT',
    'AZURE_CODE_SIGNING_ACCOUNT_NAME',
    'AZURE_CERTIFICATE_PROFILE_NAME',
    'AZURE_PUBLISHER_NAME',
  ]
  const missing = required.filter((name) => !process.env[name])
  if (missing.length === 0) {
    return {
      azureSignOptions: {
        publisherName: process.env.AZURE_PUBLISHER_NAME,
        endpoint: process.env.AZURE_ENDPOINT,
        codeSigningAccountName: process.env.AZURE_CODE_SIGNING_ACCOUNT_NAME,
        certificateProfileName: process.env.AZURE_CERTIFICATE_PROFILE_NAME,
      },
    }
  }
  if (missing.length === required.length) {
    return null // Azure signing not configured — fall back to PFX/no signing.
  }
  throw new Error(
    `Azure Trusted Signing is only partially configured. Missing env vars: ${missing.join(', ')}`,
  )
}

function githubRepository() {
  if (process.env.GH_OWNER && process.env.GH_REPO) {
    return { owner: process.env.GH_OWNER, repo: process.env.GH_REPO }
  }
  const pkg = JSON.parse(readFileSync('package.json', 'utf8'))
  const url = pkg.repository && pkg.repository.url
  const match = /^https:\/\/github\.com\/([^/]+)\/([^/.#]+)/.exec(url || '')
  return match ? { owner: match[1], repo: match[2] } : null
}

const github = githubRepository()

module.exports = {
  appId: 'com.tagrove.app',
  productName: 'Tagrove',
  copyright: 'Copyright © 2026 Tagrove Team',
  directories: {
    output: 'release',
    buildResources: 'resources',
  },
  files: ['out/**', 'package.json'],
  asar: true,
  // better-sqlite3 ships Node-API prebuilds that load in Electron as-is, so
  // the default Electron-ABI rebuild (node-gyp) is unnecessary — skip it.
  npmRebuild: false,
  // Unpack the native library so it can be dlopened from inside the asar package.
  asarUnpack: ['**/*.node'],
  extraResources: [
    {
      from: 'resources',
      to: 'resources',
      filter: ['icon.png'],
    },
    {
      from: 'src/shared',
      to: 'shared-config',
      filter: ['categories.json', 'bannedWords.json'],
    },
  ],
  win: {
    icon: 'resources/icon.ico',
    artifactName: '${productName}-${version}-${arch}-Setup.${ext}',
    ...azureSigning(),
    target: [
      {
        target: 'nsis',
        arch: ['x64'],
      },
    ],
  },
  nsis: {
    oneClick: false,
    // oneClick:false + perMachine:false shows the install-mode page with
    // per-user selected by default and a per-machine option (elevation prompt).
    perMachine: false,
    allowToChangeInstallationDirectory: true,
    createDesktopShortcut: true,
    createStartMenuShortcut: true,
    shortcutName: 'Tagrove',
    // Keep projects/database on uninstall; users remove %APPDATA%/Tagrove
    // manually if they really want a clean slate.
    deleteAppDataOnUninstall: false,
  },
  ...(github
    ? {
        publish: {
          provider: 'github',
          owner: github.owner,
          repo: github.repo,
          // Published immediately (not a draft) so installed apps can
          // auto-update right away. The release workflow sets EP_PRE_RELEASE
          // for tags like v1.1.0-beta.1 to mark beta releases.
          releaseType: 'release',
        },
      }
    : {}),
}
