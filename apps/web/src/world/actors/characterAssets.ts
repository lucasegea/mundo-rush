// world/actors/characterAssets.ts — loading of the pipeline's bodies and clip file (plan estetica-c M3), with the
// same self-hosted meshopt decoder and the same url convention as the M2 models (props/gltf.ts). Each
// file downloads once; a failure can be retried on remount. While they have not arrived (or if they fail), the
// character shows with the fallback capsule body. Plan estetica-c M6: at the reduced density of `low` the body is
// the pipeline's simplified one (`cuerpo-<id>-bajo`, same skeleton and same clips).
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

/** Parses a character .glb without network (used by the tests and the loader). */
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
 * The base body and the shared clips (the body scene is cloned per character in skinned.ts). Open-world-3d T7:
 * of the `rig` skeleton (KayKit in the flat dioramas, Quaternius in the open world).
 */
export async function loadCharacterAssets(body: BodyId, lod: SceneDensity = "full", rig: RigSpec = KAYKIT_RIG): Promise<CharacterAssets> {
  const [b, c] = await Promise.all([load(rig.bodyAsset(body, lod)), load(rig.clipsAsset)]);
  return { body: b.scene, clips: c.clips };
}
