// Slice `ui` (03 §3.3): open panels, modal, toasts, accessible focus, pointer mode; plus the current
// aria-live announcement and the place chosen in dialogue-only.
import { THIRD_PERSON, type Panel } from "@lg/core";

/**
 * An announcement for the aria-live region: i18n key + parameters. `keyParams` are parameters that are themselves
 * i18n keys (e.g. the name of a speed) and are translated before interpolating. `seq` changes on
 * every announcement, so the same text twice in a row is read again.
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
  /** Id of the element that must receive focus (when closing a panel it goes back to the one that opened it). */
  focusRequest: string | null;
  /** Id of the element that opened each panel of the stack, parallel to `panels`. */
  returnFocus: (string | null)[];
  pointerMode: "play" | "inspect";
  announcement: Announcement | null;
  /** Place chosen in dialogue-only mode. */
  dialogOnlyPlaceId: string | null;
  /** Third-person map camera (open-world-3d T4/T5, D-820, PD-5). Not persisted. */
  camera: CameraState;
}

/**
 * Map camera state (D-820): the player's yaw and pitch, and continuous zoom as a requested distance (m). The t
 * of PD-5 comes from the distance and the `fitDistance` (the whole map), which world/camera computes with aspect and yaw and
 * reports through state/bridge.ts. Storing the distance and not t means turning does not move the camera closer or farther.
 */
export interface CameraState {
  /** [0, 360). With yaw 0 the camera looks toward -z (up on screen is -z). */
  yawDeg: number;
  /** Player pitch, [6, 55]. */
  pitchDeg: number;
  /** Requested distance (m), from 2.5 to the whole map. */
  zoomDistance: number;
  /** The distance V returns to from the whole map. */
  prevZoomDistance: number;
  /** Whole map (V): the distance follows `fitDistance` even if yaw or aspect change. */
  overview: boolean;
  /** Whole-map distance (m) reported by world/camera; 150 until the first report. */
  fitDistance: number;
  /** Simulation seconds (walking) since the last look: recentering waits 1.5 s. */
  sinceLookS: number;
}

/** Camera on entering a map: 6 m behind, pitch 17°, yaw 0; `overview` opens with the whole map (perspective3D). */
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
