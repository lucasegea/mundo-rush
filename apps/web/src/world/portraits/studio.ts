// world/portraits/studio.ts — el estudio de retratos de solo-diálogo (plan estetica-c M3, D-030; revisión de arquitectura 2026-10-12). Solo
// de desarrollo: lo carga boot/dev.ts con import() bajo la doble llave del modo director y `?retratos`, y el operador lo
// usa desde el panel de dev/portraits/ en su navegador (sin render 3D sin navegador, D-016). Arma cada personaje con el
// mismo modelo del juego (cuerpo con esqueleto, cabeza por código, idle), lo encuadra de busto con la cámara de
// world/camera/portrait.ts y devuelve un PNG. El marcador de abajo hace que check:dev-only falle si esto llega a un build.
import { ACESFilmicToneMapping, Color, DirectionalLight, HemisphereLight, Scene, Vector3, WebGLRenderer } from "three";
import { chooseAnimation } from "../actors/animState";
import { loadCharacterAssets } from "../actors/characterAssets";
import { HEAD_RADIUS } from "../actors/head";
import type { CharacterLook } from "../actors/looks";
import { buildSkinnedCharacter, disposeSkinnedCharacter, driveCharacter } from "../actors/skinned";
import { createPortraitCamera, portraitFraming } from "../camera/portrait";
import { HEMI, SUN, TONE } from "../lighting/params";

/** Marcador de solo-desarrollo (scripts/budgets/dev-only.ts busca "__lg_director"). */
export const STUDIO_MARKER = "__lg_director:retratos";
export const PORTRAIT_SIZE = 256;
/**
 * Los personajes con retrato: los NPCs con apariencia (el jugador no tiene retrato de solo-diálogo). Plan estetica-c M5:
 * la apariencia viene del contenido, así que la lista sale del catálogo cargado (boot/dev.ts la arma desde el store).
 */
export const portraitIds = (looks: ReadonlyMap<string, CharacterLook>): string[] => [...looks.keys()].filter((id) => id.startsWith("NPC-")).sort();

let renderer: WebGLRenderer | null = null;

function studioRenderer(size: number): WebGLRenderer {
  renderer ??= new WebGLRenderer({ antialias: true, preserveDrawingBuffer: true, alpha: false });
  renderer.setPixelRatio(1);
  renderer.setSize(size, size, false);
  renderer.toneMapping = ACESFilmicToneMapping;
  renderer.toneMappingExposure = TONE.exposure;
  return renderer;
}

/** Renderiza el retrato de `id` con su apariencia (el modelo del juego en idle, de busto) y lo devuelve como PNG. */
export async function renderPortrait(id: string, look: CharacterLook, size = PORTRAIT_SIZE, background = "#f4ede2"): Promise<Blob> {
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
    const r = studioRenderer(size);
    r.render(scene, cam);
    return await new Promise<Blob>((resolve, reject) => {
      r.domElement.toBlob((b) => (b ? resolve(b) : reject(new Error(`retrato ${id}: el canvas no dio un PNG`))), "image/png");
    });
  } finally {
    disposeSkinnedCharacter(c);
  }
}
