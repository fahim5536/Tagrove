import js from '@eslint/js'
import prettier from 'eslint-config-prettier'
import reactHooks from 'eslint-plugin-react-hooks'
import reactRefresh from 'eslint-plugin-react-refresh'
import globals from 'globals'
import tseslint from 'typescript-eslint'

export default tseslint.config(
  { ignores: ['out/**', 'release/**', 'node_modules/**', 'resources/**', 'legacy-wpf/**'] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  prettier,
  {
    files: ['src/**/*.{ts,tsx}'],
    languageOptions: {
      globals: { ...globals.browser, ...globals.node },
    },
    rules: {
      '@typescript-eslint/consistent-type-imports': ['error', { prefer: 'type-imports' }],
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
      ],
      'no-console': 'error',
    },
  },
  {
    // The renderer runs sandboxed with nodeIntegration off — make misuse a
    // lint error, not a runtime discovery.
    files: ['src/renderer/**/*.{ts,tsx}'],
    plugins: { 'react-hooks': reactHooks, 'react-refresh': reactRefresh },
    rules: {
      'react-hooks/rules-of-hooks': 'error',
      'react-hooks/exhaustive-deps': 'warn',
      'react-refresh/only-export-components': ['warn', { allowConstantExport: true }],
      'no-restricted-globals': [
        'error',
        {
          name: 'process',
          message: 'Node is not available in the renderer. Use the preload API (window.api).',
        },
        { name: 'Buffer', message: 'Node is not available in the renderer.' },
        { name: 'require', message: 'Node is not available in the renderer.' },
        { name: 'global', message: 'Node is not available in the renderer.' },
        { name: '__dirname', message: 'Node is not available in the renderer.' },
        { name: '__filename', message: 'Node is not available in the renderer.' },
      ],
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: ['electron', 'electron/*', '@main/*'],
              message:
                'Renderer code must not import Electron or main-process modules. Use window.api.',
            },
          ],
        },
      ],
    },
  },
  {
    files: ['src/main/**/*.ts', 'src/preload/**/*.ts'],
    rules: {
      'no-restricted-globals': [
        'error',
        { name: 'window', message: 'The DOM is not available in the main/preload side.' },
        { name: 'document', message: 'The DOM is not available in the main/preload side.' },
        { name: 'navigator', message: 'The DOM is not available in the main/preload side.' },
        { name: 'localStorage', message: 'The DOM is not available in the main/preload side.' },
        { name: 'sessionStorage', message: 'The DOM is not available in the main/preload side.' },
      ],
    },
  },
  {
    files: ['scripts/**/*.mjs'],
    languageOptions: {
      globals: { ...globals.node },
    },
    rules: {
      'no-console': 'off',
    },
  },
  {
    // CommonJS build config executed by electron-builder, not by the app.
    files: ['electron-builder.cjs'],
    languageOptions: {
      globals: { ...globals.node },
      sourceType: 'commonjs',
    },
    rules: {
      'no-console': 'off',
      '@typescript-eslint/no-require-imports': 'off',
    },
  },
)
