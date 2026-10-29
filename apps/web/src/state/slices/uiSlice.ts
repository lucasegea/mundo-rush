// Slice `ui` (03 §3.3): paneles abiertos, modal, toasts, foco accesible, modo de puntero; más el anuncio
// aria-live vigente y el lugar elegido en solo-diálogo.
import { THIRD_PERSON, type Panel } from "@lg/core";

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
  /** Cámara del mapa en tercera persona (open-world-3d T4/T5, D-820, PD-5). No se persiste. */
  camera: CameraState;
}

/**
 * Estado de la cámara del mapa (D-820): yaw e inclinación del jugador, y el zoom continuo como distancia pedida (m). El t
 * de PD-5 sale de la distancia y del `fitDistance` (el mapa entero), que world/camera calcula con el aspecto y el yaw y
 * avisa por state/bridge.ts. Guardar la distancia y no t hace que girar no acerque ni aleje la cámara.
 */
export interface CameraState {
  /** [0, 360). Con yaw 0 la cámara mira hacia -z (arriba en pantalla es -z). */
  yawDeg: number;
  /** Inclinación del jugador, [6, 55]. */
  pitchDeg: number;
  /** Distancia pedida (m), de 2,5 al mapa entero. */
  zoomDistance: number;
  /** La distancia a la que vuelve V desde el mapa entero. */
  prevZoomDistance: number;
  /** Mapa entero (V): la distancia sigue a `fitDistance` aunque cambien el yaw o el aspecto. */
  overview: boolean;
  /** Distancia del mapa entero (m) que avisó world/camera; 150 hasta el primer aviso. */
  fitDistance: number;
  /** Segundos de simulación (caminando) desde la última mirada: el recentrado espera 1,5 s. */
  sinceLookS: number;
}

/** Cámara al entrar a un mapa: 6 m detrás, inclinación 17°, yaw 0; `overview` abre con el mapa entero (perspective3D). */
export const initialCamera = (overview = false): CameraState => ({
  yawDeg: 0,
  pitchDeg: THIRD_PERSON.defaultPitchDeg,
  zoomDistance: THIRD_PERSON.defaultDistance,
  prevZoomDistance: THIRD_PERSON.defaultDistance,
  overview,
  fitDistance: 150,
  sinceLookS: 0,
});

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
  camera: initialCamera(),
});
