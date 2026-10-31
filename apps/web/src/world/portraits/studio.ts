// world/portraits/studio.ts — the dialogue-only portrait studio (plan estetica-c M3, D-030; architecture review 2026-10-12). Development
// only: boot/dev.ts loads it with import() under the director mode double key and `?retratos`, and the operator
// uses it from the dev/portraits/ panel in their browser (no 3D render without a browser, D-016). It builds each character with the
// same model as the game (skeleton body, code-built head, idle), frames it as a bust with the camera from
// world/camera/portrait.ts and returns a PNG. The marker below makes check:dev-only fail if this reaches a build.
// Open-world-3d T7b (D-838, D-839): light, tone and background come from the look passed in (`world`; the panel uses the painted one).
import { ACESFilmicToneMapping, Color, DirectionalLight, HemisphereLight, Scene, Vector3, WebGLRenderer } from "three";
import type { WorldLook } from "@lg/art";
import { chooseAnimation } from "../actors/animState";
import { loadCharacterAssets } from "../actors/characterAssets";
import { HEAD_RADIUS } from "../actors/head";
import type { CharacterLook } from "../actors/looks";
import { buildSkinnedCharacter, disposeSkinnedCharacter, driveCharacter } from "../actors/skinned";
import { createPortraitCamera, portraitFraming } from "../camera/portrait";

/** Development-only marker (scripts/budgets/dev-only.ts looks for "__lg_director"). */
export const STUDIO_MARKER = "__lg_director:retratos";
export const PORTRAIT_SIZE = 256;
/**
 * The characters with a portrait: the NPCs with an appearance (the player has no dialogue-only portrait). Plan estetica-c M5:
 * the appearance comes from the content, so the list comes from the loaded catalog (boot/dev.ts builds it from the store).
 */
export const portraitIds = (looks: ReadonlyMap<string, CharacterLook>): string[] => [...looks.keys()].filter((id) => id.startsWith("NPC-")).sort();

let renderer: WebGLRenderer | null = null;

function studioRenderer(size: number, exposure: number): WebGLRenderer {
  renderer ??= new WebGLRenderer({ antialias: true, preserveDrawingBuffer: true, alpha: false });
  renderer.setPixelRatio(1);
  renderer.setSize(size, size, false);
  renderer.toneMapping = ACESFilmicToneMapping;
  renderer.toneMappingExposure = exposure;
  return renderer;
}

/**
 * Renders the portrait of `id` with its appearance (the game model in idle, as a bust) and returns it as a PNG. The light,
 * tone and background (by default its palette `muro`) are those of the `world` look.
 */
export async function renderPortrait(id: string, look: CharacterLook, world: WorldLook, size = PORTRAIT_SIZE, background = world.palette.muro): Promise<Blob> {
  const { hemi: HEMI, sun: SUN, exposure } = world.light;
  const assets = await loadCharacterAssets(look.body);
  const c = buildSkinnedCharacter(assets.body, assets.clips, look, 0);
  try {
    driveCharacter(c, chooseAnimation({ speed: 0, reduceMotion: true, scene: null, gesture: null }), 0.8, 0, true, true);
    const scene = new Scene();
    scene.background = new Color(background);
    scene.add(new HemisphereLight(HEMI.sky, HEMI.ground, HEMI.intensity));
    const key = new DirectionalLight(SUN.color, SUN.intensity * 0.8);
    key.position.set(1.2, 3, 4);
    scene.add(key, c.root);
    c.root.updateMatrixWorld(true);
    const head = c.head.getWorldPosition(new Vector3());
    const cam = createPortraitCamera(portraitFraming([head.x, head.y, head.z], HEAD_RADIUS * c.root.scale.x));
    const r = studioRenderer(size, exposure);
    r.render(scene, cam);
    return await new Promise<Blob>((resolve, reject) => {
      r.domElement.toBlob((b) => (b ? resolve(b) : reject(new Error(`retrato ${id}: el canvas no dio un PNG`))), "image/png");
    });
  } finally {
    disposeSkinnedCharacter(c);
  }
}
