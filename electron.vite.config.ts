import { resolve } from 'node:path'
import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig, externalizeDepsPlugin } from 'electron-vite'
import type { Plugin } from 'vite'
import { CSP } from './src/shared/constants'

/**
 * index.html ships with the production CSP meta tag. While serving, Vite and
 * the React HMR runtime need inline scripts/styles and a websocket, so this
 * plugin swaps the strict policy for the relaxed development one. Both
 * policies live in src/shared/constants.ts and must stay in sync with the
 * meta tag in src/renderer/index.html.
 */
function developmentContentSecurityPolicy(): Plugin {
  return {
    name: 'tagrove:development-csp',
    apply: 'serve',
    transformIndexHtml(html) {
      if (!html.includes(CSP.PRODUCTION)) {
        throw new Error(
          'index.html does not contain the production CSP. Keep the meta tag in sync with src/shared/constants.ts.',
        )
      }
      return html.replace(CSP.PRODUCTION, CSP.DEVELOPMENT)
    },
  }
}

export default defineConfig({
  main: {
    plugins: [externalizeDepsPlugin()],
    resolve: {
      alias: {
        '@shared': resolve('src/shared'),
        '@main': resolve('src/main'),
      },
    },
  },
  preload: {
    // zod must be bundled into the preload: sandboxed preload scripts can only
    // require('electron') at runtime, so every other dependency is inlined.
    plugins: [externalizeDepsPlugin({ exclude: ['zod'] })],
    resolve: {
      alias: {
        '@shared': resolve('src/shared'),
      },
    },
  },
  renderer: {
    plugins: [react(), tailwindcss(), developmentContentSecurityPolicy()],
    resolve: {
      alias: {
        '@renderer': resolve('src/renderer/src'),
        '@shared': resolve('src/shared'),
      },
    },
  },
})
