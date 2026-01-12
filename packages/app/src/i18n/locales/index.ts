import en from "./en"
import zhCN from "./zh-CN"

export const locales = {
  en,
  "zh-CN": zhCN,
} as const

export type Locale = keyof typeof locales
export const defaultLocale: Locale = "en"
export const supportedLocales: Locale[] = Object.keys(locales) as Locale[]

export type Translation = typeof locales[Locale]
