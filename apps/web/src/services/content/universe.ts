// services/content — universe selection on the client (S4/D-806: a single selection concept between build and run).
// The build with `--universe=<id>` writes the client output under apps/web/public/content/<id>/; the client
// loader requests it from there. unset / U-CAMPESINO ⇒ the legacy root (content/), verbatim (no regression for the farmer universe).
// M5 SEAM: the dev boot (main.tsx) reads the universe from the query param `?universe=<id>` (the server, from LG_UNIVERSE).

/** Default universe when none was chosen (D-806: the curated fallback). */
export const UNIVERSO_DEFECTO = "U-CAMPESINO";

/**
 * Base from which the client requests the compiled content of a universe.
 * unset / U-CAMPESINO → `${baseUrl}content/` (legacy, verbatim); other id → `${baseUrl}content/<id>/`.
 */
export const universeContentBase = (baseUrl: string, universeId?: string): string => {
  const id = universeId ?? UNIVERSO_DEFECTO;
  return id === UNIVERSO_DEFECTO ? `${baseUrl}content/` : `${baseUrl}content/${id}/`;
};

/** The universe requested by the url (`?universe=<id>`, S4/D-806); without the param, undefined (the farmer universe). */
/**
 * The universe the server runs, as `dev:play` passes it to Vite (`VITE_LG_UNIVERSE`, J-3); undefined outside dev:play.
 */
export const serverUniverse = (): string | undefined => (import.meta.env["VITE_LG_UNIVERSE"] as string | undefined) || undefined;

/**
 * The universe to play: `?universe=<id>` first; without it, the one the server was started with (J-3: a bare URL used to
 * play the farmer universe against a Galeano server, and every NPC was unknown to it); without either, undefined.
 */
export const universeFromSearch = (search: string, fallback: string | undefined = serverUniverse()): string | undefined =>
  new URLSearchParams(search).get("universe") ?? fallback;
