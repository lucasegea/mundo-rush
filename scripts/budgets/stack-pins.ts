// 3D stack pin guard (open-world-3d T2(b), PA-8, lesson F0.2): @react-three/fiber needs react < 19.4 and
// postprocessing needs three < 0.187. Until now only the lockfile protected the pin; this guard reads what is installed.
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

/** Pin problems (empty = fine): react 19.3.x and three 0.186.x exact on major.minor. */
export const stackPinProblems = ({ react, three }: StackVersions): string[] => {
  const out: string[] = [];
  const r = parse(react);
  const t = parse(three);
  if (!r || r[0] !== 19 || r[1] !== 3) out.push(`react ${react}: @react-three/fiber necesita react 19.3.x (< 19.4)`);
  if (!t || t[0] !== 0 || t[1] !== 186) out.push(`three ${three}: postprocessing necesita three 0.186.x (< 0.187)`);
  return out;
};

/** Installed versions, read from node_modules (three does not export its package.json, so it goes by path). */
export const installedStackVersions = (root: string): StackVersions => {
  const version = (pkg: string): string => (JSON.parse(readFileSync(join(root, "node_modules", pkg, "package.json"), "utf8")) as { version: string }).version;
  return { react: version("react"), three: version("three") };
};
