// services/content — selección de universo en el cliente (S4/D-806: un solo concepto de selección entre build y run).
// El build con `--universe=<id>` escribe la salida del cliente bajo apps/web/public/content/<id>/; el loader del
// cliente la pide de ahí. unset / U-CAMPESINO ⇒ la raíz legacy (content/), verbatim (sin regresión de la campesino).
// M5 SEAM: el boot de dev (main.tsx) lee el universo del query param `?universe=<id>` (el servidor, de LG_UNIVERSE).

/** Universo por defecto cuando no se eligió ninguno (D-806: el fallback curado). */
export const UNIVERSO_DEFECTO = "U-CAMPESINO";

/**
 * Base de la que el cliente pide el contenido compilado de un universo.
 * unset / U-CAMPESINO → `${baseUrl}content/` (legacy, verbatim); otro id → `${baseUrl}content/<id>/`.
 */
export const universeContentBase = (baseUrl: string, universeId?: string): string => {
  const id = universeId ?? UNIVERSO_DEFECTO;
  return id === UNIVERSO_DEFECTO ? `${baseUrl}content/` : `${baseUrl}content/${id}/`;
};

/** El universo pedido por la url (`?universe=<id>`, S4/D-806); sin el param, undefined (la campesino). */
export const universeFromSearch = (search: string): string | undefined => new URLSearchParams(search).get("universe") ?? undefined;
