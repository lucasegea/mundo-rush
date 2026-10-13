// Slice `ui` (03 §3.3): paneles abiertos, modal, toasts, foco accesible, modo de puntero; más el anuncio
// aria-live vigente y el lugar elegido en solo-diálogo.
import { DEFAULT_ZOOM_STEP, type Panel, type ZoomStep } from "@lg/core";

/**
 * Un anuncio para la región aria-live: clave de i18n + parámetros. `keyParams` son parámetros que a su vez
 * son claves de i18n (p. ej. el nombre de una velocidad) y se traducen antes de interpolar. `seq` cambia en
 * cada anuncio, así el mismo texto dos veces seguidas se vuelve a leer.
 */
export interface Announcement {
  seq: number;
  key: string;
  params: Record<string, string | number>;
  keyParams: Record<string, string>;
}

export interface UiState {
  panels: Panel[];
  modal: null;
  toasts: { id: number; key: string }[];
  /** Id del elemento que tiene que recibir el foco (al cerrar un panel vuelve al que lo abrió). */
  focusRequest: string | null;
  /** Id del elemento que abrió cada panel de la pila, en paralelo a `panels`. */
  returnFocus: (string | null)[];
  pointerMode: "play" | "inspect";
  announcement: Announcement | null;
  /** Lugar elegido en el modo solo-diálogo. */
  dialogOnlyPlaceId: string | null;
  /** Paso de zoom de la cámara del mapa (D-197, D-208): índice de ZOOM_DISTANCES, 0 = más lejos. No se persiste. */
  zoomStep: ZoomStep;
}

export const UI_PERSIST = "none" as const;

export const initialUi = (): UiState => ({
  panels: [],
  modal: null,
  toasts: [],
  focusRequest: null,
  returnFocus: [],
  pointerMode: "play",
  announcement: null,
  dialogOnlyPlaceId: null,
  zoomStep: DEFAULT_ZOOM_STEP,
});
