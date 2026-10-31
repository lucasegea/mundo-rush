// Code-made NPC portrait (D-030): SVG bust with the GDD palette (§5.4), deterministic by id. From F3 on, the pack's
// bust or front sprite replaces it. Colors come from the --lg-color-* tokens.
// Plan estetica-c M3: if the id has a portrait rendered from the 3D model (PNG in public/portraits/, downloaded from the
// director-mode portraits panel), that one is shown; if it has none, or the PNG fails to load, the SVG stays.
import { useState } from "react";
import { t } from "../../i18n";

/**
 * Ids with a committed PNG at apps/web/public/portraits/<id>.png (with their row in content/assets-registry.yaml).
 * M3 SEAM: empty until the operator renders and commits the portraits (DEFERRED-OPERATOR); they are added here.
 */
export const RENDERED_PORTRAITS: ReadonlySet<string> = new Set<string>();

/** Url of the rendered portrait for `id`, or null if there is none (falls back to the SVG). */
export function portraitImageUrl(id: string, available: ReadonlySet<string> = RENDERED_PORTRAITS, base = import.meta.env.BASE_URL): string | null {
  return available.has(id) ? `${base}portraits/${id}.png` : null;
}

const BACKGROUNDS = ["casa-1", "casa-2", "casa-3", "casa-4", "casa-5", "casa-6"] as const;
const CLOTHES = ["agua", "pasto", "campo", "cielo-atardecer", "noche", "casa-1"] as const;
const HAIR = ["noche", "campo", "casa-1"] as const; // never `tierra`, which is the skin
const HAIR_SHAPES = [
  "M18 28 C18 12 46 12 46 28 C42 20 22 20 18 28 Z", // short
  "M16 34 C14 10 50 10 48 34 L44 34 C44 20 20 20 20 34 Z", // long
  "M20 24 C20 12 44 12 44 24 C40 18 24 18 20 24 Z M28 10 a5 5 0 1 0 8 0 a5 5 0 1 0 -8 0 Z", // bun
] as const;

/** 32-bit FNV-1a: the same id always gives the same portrait. */
function hash(text: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h;
}

const pick = <T,>(list: readonly T[], n: number): T => list[n % list.length] as T;

export interface PortraitLook {
  background: string;
  clothes: string;
  hair: string;
  hairShape: string;
}

export function portraitLook(id: string): PortraitLook {
  const h = hash(id);
  const background = pick(BACKGROUNDS, h);
  // Clothes are never the same color as the background.
  const clothesOptions = CLOTHES.filter((c) => c !== background);
  return {
    background,
    clothes: pick(clothesOptions, h >>> 3),
    hair: pick(HAIR, h >>> 6),
    hairShape: pick(HAIR_SHAPES, h >>> 9),
  };
}

const fill = (token: string) => ({ fill: `var(--lg-color-${token})` });

export function Portrait({ id, name, size = 96, available = RENDERED_PORTRAITS }: { id: string; name: string; size?: number; available?: ReadonlySet<string> }) {
  // A load failure is remembered PER id (QA M3): if the same component switches to another NPC, its PNG is tried again.
  const [failedId, setFailedId] = useState<string | null>(null);
  const src = failedId === id ? null : portraitImageUrl(id, available);
  if (src) {
    return (
      <img src={src} alt={t("dialogOnly.portrait", { name })} width={size} height={size} className="shrink-0 rounded-lg" onError={() => setFailedId(id)} />
    );
  }
  const look = portraitLook(id);
  return (
    <svg role="img" aria-label={t("dialogOnly.portrait", { name })} viewBox="0 0 64 64" width={size} height={size} className="shrink-0 rounded-lg">
      <rect width="64" height="64" rx="8" style={fill(look.background)} />
      <path d="M8 64 C8 46 56 46 56 64 Z" style={fill(look.clothes)} />
      <rect x="27" y="36" width="10" height="10" style={fill("tierra")} />
      <circle cx="32" cy="28" r="12" style={fill("tierra")} />
      <path d={look.hairShape} style={fill(look.hair)} />
      <circle cx="27.5" cy="29" r="1.6" style={fill("noche")} />
      <circle cx="36.5" cy="29" r="1.6" style={fill("noche")} />
    </svg>
  );
}
