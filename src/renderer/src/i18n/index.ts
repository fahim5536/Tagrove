import i18next from 'i18next'
import { initReactI18next } from 'react-i18next'
import bn from './locales/bn.json'
import en from './locales/en.json'

/**
 * App UI translations. English is complete; Bengali ships as a starter set
 * and falls back to English for missing keys. Add a locale file and register
 * it here (plus LANGUAGES in src/shared/constants.ts) to add a language.
 */
export const I18N_RESOURCES = {
  en: { translation: en },
  bn: { translation: bn },
} as const

void i18next.use(initReactI18next).init({
  resources: I18N_RESOURCES,
  lng: 'en',
  fallbackLng: 'en',
  interpolation: {
    // React already escapes content.
    escapeValue: false,
  },
  returnNull: false,
})

export default i18next
