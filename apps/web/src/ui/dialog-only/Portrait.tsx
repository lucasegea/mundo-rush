// Retrato de NPC por código (D-030): busto SVG con la paleta del GDD (§5.4), determinístico por id. Desde F3
// lo reemplaza el busto o el sprite de frente del pack. Los colores salen de los tokens --lg-color-*.
import { t } from "../../i18n";

const BACKGROUNDS = ["casa-1", "casa-2", "casa-3", "casa-4", "casa-5", "casa-6"] as const;
const CLOTHES = ["agua", "pasto", "campo", "cielo-atardecer", "noche", "casa-1"] as const;
const HAIR = ["noche", "campo", "casa-1"] as const; // nunca `tierra`, que es la piel
const HAIR_SHAPES = [
  "M18 28 C18 12 46 12 46 28 C42 20 22 20 18 28 Z", // corto
  "M16 34 C14 10 50 10 48 34 L44 34 C44 20 20 20 20 34 Z", // largo
  "M20 24 C20 12 44 12 44 24 C40 18 24 18 20 24 Z M28 10 a5 5 0 1 0 8 0 a5 5 0 1 0 -8 0 Z", // rodete
] as const;

/** FNV-1a de 32 bits: el mismo id da siempre el mismo retrato. */
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
  // La ropa nunca del mismo color que el fondo.
  const clothesOptions = CLOTHES.filter((c) => c !== background);
  return {
    background,
    clothes: pick(clothesOptions, h >>> 3),
    hair: pick(HAIR, h >>> 6),
    hairShape: pick(HAIR_SHAPES, h >>> 9),
  };
}

const fill = (token: string) => ({ fill: `var(--lg-color-${token})` });

export function Portrait({ id, name, size = 96 }: { id: string; name: string; size?: number }) {
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
