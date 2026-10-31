// i18n/ — own minimal helper (ADR-019): JSON per locale, typed keys, plurals with Intl.PluralRules.
// A single locale today: es-AR with voseo (D-045). Game strings come from content (R9); here only
// the interface ones.
import esAR from "./es-AR.json";

export type Locale = "es-AR";
type PluralForms = Partial<Record<Intl.LDMLPluralRule, string>> & { other: string };
type Message = string | PluralForms;

export const CATALOGS: Record<Locale, Record<string, Message>> = { "es-AR": esAR };

/** The base catalog's keys: a typo in `t("...")` does not compile. */
export type MessageKey = keyof typeof esAR;
export type Params = Record<string, string | number>;

const LOCALE: Locale = "es-AR";
const plural = new Intl.PluralRules(LOCALE);

export const isMessageKey = (key: string): key is MessageKey => Object.hasOwn(CATALOGS[LOCALE], key);

const interpolate = (text: string, params: Params): string =>
  text.replace(/\{(\w+)\}/g, (whole, name: string) => (name in params ? String(params[name]) : whole));

/**
 * Translates a key. With a plural form, it picks by `params.count` (Intl.PluralRules). A nonexistent key
 * (only possible with dynamic keys) is returned as is, visible: the missing-keys test catches it beforehand.
 */
export function t(key: MessageKey, params: Params = {}): string {
  const message: Message | undefined = CATALOGS[LOCALE][key];
  if (message === undefined) return key;
  if (typeof message === "string") return interpolate(message, params);
  const count = typeof params.count === "number" ? params.count : 0;
  return interpolate(message[plural.select(count)] ?? message.other, params);
}

/** Translates a key that arrives as text (e.g. from a store announcement); `keyParams` are translated first. */
export function tDynamic(key: string, params: Params = {}, keyParams: Record<string, string> = {}): string {
  const resolved: Params = { ...params };
  for (const [name, k] of Object.entries(keyParams)) resolved[name] = isMessageKey(k) ? t(k) : k;
  return isMessageKey(key) ? t(key, resolved) : key;
}
