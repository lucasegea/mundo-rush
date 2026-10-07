// i18n/ — helper propio mínimo (ADR-019): JSON por locale, claves tipadas, plurales con Intl.PluralRules.
// Un solo locale hoy: es-AR con voseo (D-045). Las cadenas de juego vienen del contenido (R9); acá solo
// las de interfaz.
import esAR from "./es-AR.json";

export type Locale = "es-AR";
type PluralForms = Partial<Record<Intl.LDMLPluralRule, string>> & { other: string };
type Message = string | PluralForms;

export const CATALOGS: Record<Locale, Record<string, Message>> = { "es-AR": esAR };

/** Las claves del catálogo base: un typo en `t("...")` no compila. */
export type MessageKey = keyof typeof esAR;
export type Params = Record<string, string | number>;

const LOCALE: Locale = "es-AR";
const plural = new Intl.PluralRules(LOCALE);

export const isMessageKey = (key: string): key is MessageKey => Object.hasOwn(CATALOGS[LOCALE], key);

const interpolate = (text: string, params: Params): string =>
  text.replace(/\{(\w+)\}/g, (whole, name: string) => (name in params ? String(params[name]) : whole));

/**
 * Traduce una clave. Con forma plural, elige por `params.count` (Intl.PluralRules). Una clave inexistente
 * (solo posible con claves dinámicas) se devuelve tal cual, visible: el test de claves faltantes la caza antes.
 */
export function t(key: MessageKey, params: Params = {}): string {
  const message: Message | undefined = CATALOGS[LOCALE][key];
  if (message === undefined) return key;
  if (typeof message === "string") return interpolate(message, params);
  const count = typeof params.count === "number" ? params.count : 0;
  return interpolate(message[plural.select(count)] ?? message.other, params);
}

/** Traduce una clave que llega como texto (p. ej. de un anuncio del store); `keyParams` se traducen primero. */
export function tDynamic(key: string, params: Params = {}, keyParams: Record<string, string> = {}): string {
  const resolved: Params = { ...params };
  for (const [name, k] of Object.entries(keyParams)) resolved[name] = isMessageKey(k) ? t(k) : k;
  return isMessageKey(key) ? t(key, resolved) : key;
}
