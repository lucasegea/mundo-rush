// world/props/gltf.ts: loader of the asset pipeline models (plan estetica-c M2, 03 §6.4.1). GLTFLoader from
// three/addons with the self-hosted meshopt decoder in public/decoders/ (03 §4.2: no CDN; the file is the
// exact copy of three one, a test compares it byte by byte). Every loaded glTF goes to the shared toon material
// (A4: the world surfaces remain at most 2 instances) and fits into the `tam` box of its layout prop.
import { Box3, Mesh, Vector3, type Material, type Object3D } from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import type { MeshoptDecoder } from "three/addons/libs/meshopt_decoder.module.js";
import { toonMaterial } from "../materials/registry";

export type MeshoptDecoderModule = typeof MeshoptDecoder;

/** Prefix of the layout props that are pipeline glTFs (the `codigo/*` ones are code builders). */
export const MODEL_PREFIX = "modelo/";
export const isModelAsset = (asset: string): boolean => asset.startsWith(MODEL_PREFIX);

const base = (): string => import.meta.env.BASE_URL;

/** `modelo/<pack>/<piece>` → url of the served .glb (apps/web/public/models/<pack>/<piece>.glb). */
export const modelUrl = (asset: string): string => `${base()}models/${asset.slice(MODEL_PREFIX.length)}.glb`;

/** The self-hosted meshopt decoder (copy of three/addons/libs/meshopt_decoder.module.js). */
export const meshoptDecoderUrl = (): string => `${base()}decoders/meshopt_decoder.module.js`;

let decoder: Promise<MeshoptDecoderModule> | null = null;

/** Downloads the decoder only once and only when the diorama has models (it does not weigh in the 3D chunk). */
export function loadMeshoptDecoder(url = meshoptDecoderUrl()): Promise<MeshoptDecoderModule> {
  // open-world-3d T3: in `vite dev` a dynamic import of a path that starts with "/" gets `?import` and Vite
  // rejects it for being from public/ (the error overlay covered the page). With the absolute url Vite leaves it alone and the file
  // is served as is, just like in the build.
  const href = typeof location === "undefined" ? url : new URL(url, location.href).href;
  decoder ??= (import(/* @vite-ignore */ href) as Promise<{ MeshoptDecoder: MeshoptDecoderModule }>).then(async (m) => {
    await m.MeshoptDecoder.ready;
    return m.MeshoptDecoder;
  });
  return decoder;
}

/**
 * Swaps each model material for the shared toon. A model without vertex color did not come out of the pipeline:
 * it fails naming the piece (it would look black with the toon).
 */
export function toonify(root: Object3D, name: string): Object3D {
  const old = new Set<Material>();
  root.traverse((o) => {
    if (!(o instanceof Mesh)) return;
    if (!o.geometry.getAttribute("color")) throw new Error(`modelo ${name}: la malla "${o.name}" no tiene color por vértice (¿salió de scripts/assets/optimize.ts?)`);
    for (const m of Array.isArray(o.material) ? o.material : [o.material]) old.add(m as Material);
    o.material = toonMaterial();
    o.receiveShadow = true;
  });
  for (const m of old) if (m !== toonMaterial()) m.dispose();
  return root;
}

/** Parses a pipeline .glb (no network) and leaves it with the toon material. */
export async function parseModel(data: ArrayBuffer, name: string, meshopt: MeshoptDecoderModule): Promise<Object3D> {
  const gltf = await new GLTFLoader().setMeshoptDecoder(meshopt).parseAsync(data, "");
  return toonify(gltf.scene, name);
}

export interface ModelBox {
  x: number;
  y: number;
  z: number;
  w: number;
  h: number;
  d: number;
  /** Rotation around the vertical axis (radians, plan estetica-c M5): the `tam` box rotates with the model. */
  rotY?: number;
}

/**
 * Uniform scale so the model fits in the prop `tam` box (the same footprint that blocks the grid), resting
 * on `y` and centered in x, z; with `rotY`, rotated around that center. Returns the same object.
 */
export function fitToBox(model: Object3D, box: ModelBox): Object3D {
  model.position.set(0, 0, 0);
  model.scale.setScalar(1);
  model.updateMatrixWorld(true);
  const bb = new Box3().setFromObject(model);
  const size = bb.getSize(new Vector3());
  const s = Math.min(box.w / Math.max(size.x, 1e-6), box.h / Math.max(size.y, 1e-6), box.d / Math.max(size.z, 1e-6));
  const center = bb.getCenter(new Vector3());
  model.scale.setScalar(s);
  model.position.set(box.x - center.x * s, box.y - bb.min.y * s, box.z - center.z * s);
  const rot = box.rotY ?? 0;
  if (rot !== 0) {
    // Rotates around the box center: x' = x cos + z sin, z' = -x sin + z cos (three rotation about +y).
    const dx = model.position.x - box.x;
    const dz = model.position.z - box.z;
    model.rotation.y = rot;
    model.position.x = box.x + dx * Math.cos(rot) + dz * Math.sin(rot);
    model.position.z = box.z - dx * Math.sin(rot) + dz * Math.cos(rot);
  }
  model.updateMatrixWorld(true);
  return model;
}

const cache = new Map<string, Promise<Object3D>>();

/** Loads a model by url (once) and returns a clone (shares geometry and material) ready for the scene. */
export function loadModel(asset: string): Promise<Object3D> {
  const url = modelUrl(asset);
  let p = cache.get(url);
  if (!p) {
    p = loadMeshoptDecoder().then(async (meshopt) => toonify((await new GLTFLoader().setMeshoptDecoder(meshopt).loadAsync(url)).scene, asset));
    p.catch(() => cache.delete(url)); // a network failure can be retried on remount
    cache.set(url, p);
  }
  return p.then((m) => m.clone());
}
