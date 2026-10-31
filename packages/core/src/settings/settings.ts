// Player settings (`settings` slice, 03 §3.3; GDD §2.19). Pure rules: default values,
// sanitizing of what arrives (UI, local save from an old version) and text size steps.
// None of these functions is unlocked by progress (GDD §2.19, inviolable rule 3).
import { isSelectableTier, isTierChoice, type SelectableTier, type TierChoice } from "../quality/tiers";

/** Silence on your turn before the hint chip (D-035, GDD §2.6.2: 10 s; scaffolding adjusts it in F6). */
export const HINT_CHIP_DELAY_MS = 10_000;

/** Text size: 4 steps between 100 % and 200 % (GDD §2.19), default 125 %. */
export const TEXT_SCALES = [100, 125, 150, 175, 200] as const;
export type TextScale = (typeof TEXT_SCALES)[number];

/** Three NPC speeds (GDD §2.6): Natural, Más lenta, Muy lenta. */
export const NPC_SPEEDS = ["natural", "slower", "slowest"] as const;
export type NpcSpeed = (typeof NPC_SPEEDS)[number];

/** Feedback modes (03 §3.3, GDD §2.4.4). In F1.3 they are only saved; the effect arrives with F6. */
export const FEEDBACK_MODES = ["accompanied", "flagOnly", "moreHelp"] as const;
export type FeedbackMode = (typeof FEEDBACK_MODES)[number];

export const FONTS = ["legible", "dyslexia"] as const;
export type FontChoice = (typeof FONTS)[number];

export const COLOR_VISION_MODES = ["none", "protanopia", "deuteranopia", "tritanopia"] as const;
export type ColorVisionMode = (typeof COLOR_VISION_MODES)[number];

/**
 * Camera the player can choose. Open-world-3d T5 (PD-5): `thirdPerson` is the default; `perspective3D` (D-207)
 * is still selectable and opens third person with the whole map (t = 1). An old saved setting (one of the HD-2D
 * ortho presets, retired from R11 in plan estetica-c M7) is not in the list and `oneOf` takes it to the default.
 */
export const CAMERA_PRESETS = ["thirdPerson", "perspective3D"] as const;
export type CameraPreset = (typeof CAMERA_PRESETS)[number];

export const VOLUME_CHANNELS = ["npc", "lumi", "music", "ambient", "sfx"] as const;
export type VolumeChannel = (typeof VOLUME_CHANNELS)[number];

/** Help level fixed 1-5 (scaffolding, GDD §2.10) or automatic. */
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
    /** 0-100 per channel. */
    volumes: Record<VolumeChannel, number>;
    lumiVoice: boolean;
  };
  input: {
    pushToTalk: boolean;
    /** End-of-turn threshold in ms (the "Terminé" button is always there). */
    endOfTurnMs: number;
    buttonOnly: boolean;
    /** Visual chip "¿Querés una pista?" after 10 s of silence on your turn (D-035; can be disabled, no sound). */
    hintChip: boolean;
    /** Semantic action → key (R10). Empty until F2. */
    keymap: Record<string, string>;
  };
  feedbackMode: FeedbackMode;
  npcSpeed: NpcSpeed;
  helpLevel: HelpLevel;
  graphics: {
    /** Player's choice (local only per device, 03 §3.3). */
    tier: TierChoice;
    /** Suggestion from capability detection; recomputed on every start. */
    suggestedTier: SelectableTier;
  };
  camera: CameraPreset;
}

export const DEFAULT_SETTINGS: Settings = {
  accessibility: {
    textScale: 125,
    font: "legible",
    subtitles: true,
    karaoke: true, // GDD §2.19: on in A0-A1; the prologue is A0
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

/** A partial settings change: what the UI or the local save sends. Sanitized field by field. */
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

/** The text step closest to any value (a save with 130 ends up at 125). */
export function nearestTextScale(value: unknown, fallback: TextScale = DEFAULT_SETTINGS.accessibility.textScale): TextScale {
  if (typeof value !== "number" || !Number.isFinite(value)) return fallback;
  return TEXT_SCALES.reduce((best, s) => (Math.abs(s - value) < Math.abs(best - value) ? s : best), TEXT_SCALES[0]);
}

/** One step bigger (+1) or smaller (-1), without leaving 100-200 %. */
export function stepTextScale(current: TextScale, direction: 1 | -1): TextScale {
  const i = TEXT_SCALES.indexOf(current);
  const next = Math.min(TEXT_SCALES.length - 1, Math.max(0, (i < 0 ? 1 : i) + direction));
  return TEXT_SCALES[next] ?? current;
}

const helpLevel = (value: unknown, fallback: HelpLevel): HelpLevel =>
  value === "auto" || (typeof value === "number" && Number.isInteger(value) && value >= 1 && value <= 5) ? (value as HelpLevel) : fallback;

/**
 * Applies a partial change without mutating the input. Any out-of-contract value is ignored (the current one stays):
 * an `xr` tier never gets in, nor a text size outside 100-200 % nor a volume outside 0-100.
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

/** What is saved on the device: everything except the suggestion, which is recomputed on every start. */
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
