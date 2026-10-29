// Ajustes del jugador (slice `settings`, 03 §3.3; GDD §2.19). Reglas puras: valores por defecto,
// saneo de lo que llega (UI, guardado local de una versión vieja) y pasos del tamaño de texto.
// Ninguna de estas funciones se desbloquea con progreso (GDD §2.19, regla inviolable 3).
import { isSelectableTier, isTierChoice, type SelectableTier, type TierChoice } from "../quality/tiers";

/** Silencio en tu turno antes del chip de pista (D-035, GDD §2.6.2: 10 s; el andamiaje lo ajusta en F6). */
export const HINT_CHIP_DELAY_MS = 10_000;

/** Tamaño de texto: 4 pasos entre 100 % y 200 % (GDD §2.19), default 125 %. */
export const TEXT_SCALES = [100, 125, 150, 175, 200] as const;
export type TextScale = (typeof TEXT_SCALES)[number];

/** Tres velocidades de NPC (GDD §2.6): Natural, Más lenta, Muy lenta. */
export const NPC_SPEEDS = ["natural", "slower", "slowest"] as const;
export type NpcSpeed = (typeof NPC_SPEEDS)[number];

/** Modos de feedback (03 §3.3, GDD §2.4.4). En F1.3 solo se guardan; el efecto llega con F6. */
export const FEEDBACK_MODES = ["accompanied", "flagOnly", "moreHelp"] as const;
export type FeedbackMode = (typeof FEEDBACK_MODES)[number];

export const FONTS = ["legible", "dyslexia"] as const;
export type FontChoice = (typeof FONTS)[number];

export const COLOR_VISION_MODES = ["none", "protanopia", "deuteranopia", "tritanopia"] as const;
export type ColorVisionMode = (typeof COLOR_VISION_MODES)[number];

/**
 * Cámara que el jugador puede elegir. Open-world-3d T5 (PD-5): `thirdPerson` es el default; `perspective3D` (D-207)
 * sigue elegible y abre la tercera persona con el mapa entero (t = 1). Un ajuste guardado viejo (uno de los presets
 * ortográficos de HD-2D, retirados de R11 en el plan estetica-c M7) no está en la lista y `oneOf` lo lleva al default.
 */
export const CAMERA_PRESETS = ["thirdPerson", "perspective3D"] as const;
export type CameraPreset = (typeof CAMERA_PRESETS)[number];

export const VOLUME_CHANNELS = ["npc", "lumi", "music", "ambient", "sfx"] as const;
export type VolumeChannel = (typeof VOLUME_CHANNELS)[number];

/** Nivel de ayuda fijado 1-5 (andamiaje, GDD §2.10) o automático. */
export type HelpLevel = "auto" | 1 | 2 | 3 | 4 | 5;

export interface Settings {
  accessibility: {
    textScale: TextScale;
    font: FontChoice;
    subtitles: boolean;
    karaoke: boolean;
    colorVision: ColorVisionMode;
    highContrast: boolean;
    reduceMotion: boolean;
    /** 0-100 por canal. */
    volumes: Record<VolumeChannel, number>;
    lumiVoice: boolean;
  };
  input: {
    pushToTalk: boolean;
    /** Umbral de fin de turno en ms (el botón "Terminé" siempre está). */
    endOfTurnMs: number;
    buttonOnly: boolean;
    /** Chip visual "¿Querés una pista?" a los 10 s de silencio en tu turno (D-035; desactivable, sin sonido). */
    hintChip: boolean;
    /** Acción semántica → tecla (R10). Vacío hasta F2. */
    keymap: Record<string, string>;
  };
  feedbackMode: FeedbackMode;
  npcSpeed: NpcSpeed;
  helpLevel: HelpLevel;
  graphics: {
    /** Elección del jugador (solo local por dispositivo, 03 §3.3). */
    tier: TierChoice;
    /** Sugerencia de la detección de capacidades; se recalcula en cada arranque. */
    suggestedTier: SelectableTier;
  };
  camera: CameraPreset;
}

export const DEFAULT_SETTINGS: Settings = {
  accessibility: {
    textScale: 125,
    font: "legible",
    subtitles: true,
    karaoke: true, // GDD §2.19: encendido en A0-A1; el prólogo es A0
    colorVision: "none",
    highContrast: false,
    reduceMotion: false,
    volumes: { npc: 100, lumi: 100, music: 70, ambient: 70, sfx: 80 },
    lumiVoice: true,
  },
  input: { pushToTalk: false, endOfTurnMs: 1500, buttonOnly: false, hintChip: true, keymap: {} },
  feedbackMode: "accompanied",
  npcSpeed: "slowest", // GDD §2.6: A0 = Muy lenta
  helpLevel: "auto",
  graphics: { tier: "auto", suggestedTier: "dialog-only" },
  camera: "thirdPerson",
};

/** Un cambio parcial de ajustes: lo que la UI o el guardado local mandan. Se sanea campo por campo. */
export interface SettingsPatch {
  accessibility?: Partial<Omit<Settings["accessibility"], "volumes">> & { volumes?: Partial<Record<VolumeChannel, number>> };
  input?: Partial<Settings["input"]>;
  feedbackMode?: FeedbackMode;
  npcSpeed?: NpcSpeed;
  helpLevel?: HelpLevel;
  graphics?: Partial<Settings["graphics"]>;
  camera?: CameraPreset;
}

const oneOf = <T>(list: readonly T[], value: unknown, fallback: T): T =>
  (list as readonly unknown[]).includes(value) ? (value as T) : fallback;
const bool = (value: unknown, fallback: boolean): boolean => (typeof value === "boolean" ? value : fallback);
const clamp = (value: unknown, min: number, max: number, fallback: number): number =>
  typeof value === "number" && Number.isFinite(value) ? Math.min(max, Math.max(min, Math.round(value))) : fallback;

/** El paso de texto más cercano a un valor cualquiera (un guardado con 130 queda en 125). */
export function nearestTextScale(value: unknown, fallback: TextScale = DEFAULT_SETTINGS.accessibility.textScale): TextScale {
  if (typeof value !== "number" || !Number.isFinite(value)) return fallback;
  return TEXT_SCALES.reduce((best, s) => (Math.abs(s - value) < Math.abs(best - value) ? s : best), TEXT_SCALES[0]);
}

/** Un paso más grande (+1) o más chico (-1), sin salir de 100-200 %. */
export function stepTextScale(current: TextScale, direction: 1 | -1): TextScale {
  const i = TEXT_SCALES.indexOf(current);
  const next = Math.min(TEXT_SCALES.length - 1, Math.max(0, (i < 0 ? 1 : i) + direction));
  return TEXT_SCALES[next] ?? current;
}

const helpLevel = (value: unknown, fallback: HelpLevel): HelpLevel =>
  value === "auto" || (typeof value === "number" && Number.isInteger(value) && value >= 1 && value <= 5) ? (value as HelpLevel) : fallback;

/**
 * Aplica un cambio parcial sin mutar la entrada. Todo valor fuera de contrato se ignora (queda el actual):
 * nunca entra un tier `xr`, un tamaño de texto fuera de 100-200 % ni un volumen fuera de 0-100.
 */
export function applySettingsPatch(current: Settings, patch: SettingsPatch | null | undefined): Settings {
  if (!patch || typeof patch !== "object") return current;
  const a = current.accessibility;
  const pa = patch.accessibility ?? {};
  const pv = pa.volumes ?? {};
  const pi = patch.input ?? {};
  const pg = patch.graphics ?? {};
  const volumes = Object.fromEntries(
    VOLUME_CHANNELS.map((ch) => [ch, clamp(pv[ch], 0, 100, a.volumes[ch])]),
  ) as Record<VolumeChannel, number>;
  return {
    accessibility: {
      textScale: pa.textScale === undefined ? a.textScale : nearestTextScale(pa.textScale, a.textScale),
      font: oneOf(FONTS, pa.font, a.font),
      subtitles: bool(pa.subtitles, a.subtitles),
      karaoke: bool(pa.karaoke, a.karaoke),
      colorVision: oneOf(COLOR_VISION_MODES, pa.colorVision, a.colorVision),
      highContrast: bool(pa.highContrast, a.highContrast),
      reduceMotion: bool(pa.reduceMotion, a.reduceMotion),
      volumes,
      lumiVoice: bool(pa.lumiVoice, a.lumiVoice),
    },
    input: {
      pushToTalk: bool(pi.pushToTalk, current.input.pushToTalk),
      endOfTurnMs: clamp(pi.endOfTurnMs, 300, 10000, current.input.endOfTurnMs),
      buttonOnly: bool(pi.buttonOnly, current.input.buttonOnly),
      hintChip: bool(pi.hintChip, current.input.hintChip),
      keymap: pi.keymap && typeof pi.keymap === "object" ? { ...pi.keymap } : current.input.keymap,
    },
    feedbackMode: oneOf(FEEDBACK_MODES, patch.feedbackMode, current.feedbackMode),
    npcSpeed: oneOf(NPC_SPEEDS, patch.npcSpeed, current.npcSpeed),
    helpLevel: helpLevel(patch.helpLevel, current.helpLevel),
    graphics: {
      tier: isTierChoice(pg.tier) ? pg.tier : current.graphics.tier,
      suggestedTier: isSelectableTier(pg.suggestedTier) ? pg.suggestedTier : current.graphics.suggestedTier,
    },
    camera: oneOf(CAMERA_PRESETS, patch.camera, current.camera),
  };
}

/** Lo que se guarda en el dispositivo: todo menos la sugerencia, que se recalcula en cada arranque. */
export function persistableSettings(s: Settings): SettingsPatch {
  return {
    accessibility: s.accessibility,
    input: s.input,
    feedbackMode: s.feedbackMode,
    npcSpeed: s.npcSpeed,
    helpLevel: s.helpLevel,
    graphics: { tier: s.graphics.tier },
    camera: s.camera,
  };
}
