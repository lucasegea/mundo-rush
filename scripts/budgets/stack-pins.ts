// Guarda de pines del stack 3D (open-world-3d T2(b), PA-8, lección F0.2): @react-three/fiber necesita react < 19.4 y
// postprocessing necesita three < 0.187. Hasta acá solo el lockfile protegía el pin; esta guarda lee lo instalado.
import { readFileSync } from "node:fs";
import { join } from "node:path";

export interface StackVersions {
  react: string;
  three: string;
}

const parse = (v: string): [number, number, number] | null => {
  const m = /^(\d+)\.(\d+)\.(\d+)/.exec(v);
  return m ? [Number(m[1]), Number(m[2]), Number(m[3])] : null;
};

/** Problemas de pin (vacío = bien): react 19.3.x y three 0.186.x exactos en major.minor. */
export const stackPinProblems = ({ react, three }: StackVersions): string[] => {
  const out: string[] = [];
  const r = parse(react);
  const t = parse(three);
  if (!r || r[0] !== 19 || r[1] !== 3) out.push(`react ${react}: @react-three/fiber necesita react 19.3.x (< 19.4)`);
  if (!t || t[0] !== 0 || t[1] !== 186) out.push(`three ${three}: postprocessing necesita three 0.186.x (< 0.187)`);
  return out;
};

/** Versiones instaladas, leídas de node_modules (three no exporta su package.json, así que va por ruta). */
export const installedStackVersions = (root: string): StackVersions => {
  const version = (pkg: string): string => (JSON.parse(readFileSync(join(root, "node_modules", pkg, "package.json"), "utf8")) as { version: string }).version;
  return { react: version("react"), three: version("three") };
};
