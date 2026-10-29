// world/actors/characterAssets.ts — carga de los cuerpos y del archivo de clips del pipeline (plan estetica-c M3), con el
// mismo decodificador meshopt autoalojado y la misma convención de url que los modelos de M2 (props/gltf.ts). Cada
// archivo se baja una vez; un fallo se puede reintentar al volver a montar. Mientras no llegan (o si fallan), el
// personaje se ve con el cuerpo de cápsulas de reserva. Plan estetica-c M6: en la densidad reducida de `low` el cuerpo es
// el simplificado del pipeline (`cuerpo-<id>-bajo`, mismo esqueleto y mismos clips).
import type { AnimationClip, Object3D } from "three";
import type { SceneDensity } from "@lg/art";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { loadMeshoptDecoder, MODEL_PREFIX, modelUrl, type MeshoptDecoderModule } from "../props/gltf";
import type { BodyId } from "./looks";
import { KAYKIT_RIG, type RigSpec } from "./rigs";

export interface CharacterAssets {
  body: Object3D;
  clips: readonly AnimationClip[];
}

/** Parsea un .glb de personaje sin red (lo usan los tests y el cargador). */
export async function parseCharacterGlb(data: ArrayBuffer, meshopt: MeshoptDecoderModule): Promise<{ scene: Object3D; clips: AnimationClip[] }> {
  const gltf = await new GLTFLoader().setMeshoptDecoder(meshopt).parseAsync(data, "");
  return { scene: gltf.scene, clips: gltf.animations };
}

const cache = new Map<string, Promise<{ scene: Object3D; clips: AnimationClip[] }>>();

function load(asset: string): Promise<{ scene: Object3D; clips: AnimationClip[] }> {
  const url = modelUrl(MODEL_PREFIX + asset);
  let p = cache.get(url);
  if (!p) {
    p = loadMeshoptDecoder().then(async (meshopt) => {
      const gltf = await new GLTFLoader().setMeshoptDecoder(meshopt).loadAsync(url);
      return { scene: gltf.scene, clips: gltf.animations };
    });
    p.catch(() => cache.delete(url));
    cache.set(url, p);
  }
  return p;
}

/**
 * El cuerpo base y los clips compartidos (la escena del cuerpo se clona por personaje en skinned.ts). Open-world-3d T7:
 * del esqueleto `rig` (KayKit en los dioramas planos, Quaternius en el mundo abierto).
 */
export async function loadCharacterAssets(body: BodyId, lod: SceneDensity = "full", rig: RigSpec = KAYKIT_RIG): Promise<CharacterAssets> {
  const [b, c] = await Promise.all([load(rig.bodyAsset(body, lod)), load(rig.clipsAsset)]);
  return { body: b.scene, clips: c.clips };
}
