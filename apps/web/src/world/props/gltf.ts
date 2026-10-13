// world/props/gltf.ts: cargador de los modelos del pipeline de assets (plan estetica-c M2, 03 §6.4.1). GLTFLoader de
// three/addons con el decodificador meshopt autoalojado en public/decoders/ (03 §4.2: nada de CDN; el archivo es la
// copia exacta del de three, un test lo compara byte a byte). Todo glTF cargado pasa al material toon compartido
// (A4: las superficies del mundo siguen siendo como mucho 2 instancias) y entra en la caja `tam` de su prop del layout.
import { Box3, Mesh, Vector3, type Material, type Object3D } from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import type { MeshoptDecoder } from "three/addons/libs/meshopt_decoder.module.js";
import { toonMaterial } from "../materials/registry";

export type MeshoptDecoderModule = typeof MeshoptDecoder;

/** Prefijo de los props del layout que son glTF del pipeline (los `codigo/*` son constructores por código). */
export const MODEL_PREFIX = "modelo/";
export const isModelAsset = (asset: string): boolean => asset.startsWith(MODEL_PREFIX);

const base = (): string => import.meta.env.BASE_URL;

/** `modelo/<pack>/<pieza>` → url del .glb servido (apps/web/public/models/<pack>/<pieza>.glb). */
export const modelUrl = (asset: string): string => `${base()}models/${asset.slice(MODEL_PREFIX.length)}.glb`;

/** El decodificador meshopt autoalojado (copia de three/addons/libs/meshopt_decoder.module.js). */
export const meshoptDecoderUrl = (): string => `${base()}decoders/meshopt_decoder.module.js`;

let decoder: Promise<MeshoptDecoderModule> | null = null;

/** Baja el decodificador una sola vez y solo cuando el diorama tiene modelos (no pesa en el chunk 3D). */
export function loadMeshoptDecoder(url = meshoptDecoderUrl()): Promise<MeshoptDecoderModule> {
  decoder ??= (import(/* @vite-ignore */ url) as Promise<{ MeshoptDecoder: MeshoptDecoderModule }>).then(async (m) => {
    await m.MeshoptDecoder.ready;
    return m.MeshoptDecoder;
  });
  return decoder;
}

/**
 * Cambia cada material del modelo por el toon compartido. Un modelo sin color por vértice no salió del pipeline:
 * falla nombrando la pieza (se vería negro con el toon).
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

/** Parsea un .glb del pipeline (sin red) y lo deja con el material toon. */
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
  /** Giro alrededor del eje vertical (radianes, plan estetica-c M5): la caja `tam` gira con el modelo. */
  rotY?: number;
}

/**
 * Escala uniforme para que el modelo entre en la caja `tam` del prop (la misma huella que bloquea la grilla), apoyado
 * en `y` y centrado en x, z; con `rotY`, girado alrededor de ese centro. Devuelve el mismo objeto.
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
    // Gira alrededor del centro de la caja: x' = x cos + z sin, z' = -x sin + z cos (el giro de three sobre +y).
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

/** Carga un modelo por url (una vez) y devuelve un clon (comparte geometría y material) listo para la escena. */
export function loadModel(asset: string): Promise<Object3D> {
  const url = modelUrl(asset);
  let p = cache.get(url);
  if (!p) {
    p = loadMeshoptDecoder().then(async (meshopt) => toonify((await new GLTFLoader().setMeshoptDecoder(meshopt).loadAsync(url)).scene, asset));
    p.catch(() => cache.delete(url)); // un fallo de red se puede reintentar al volver a montar
    cache.set(url, p);
  }
  return p.then((m) => m.clone());
}
