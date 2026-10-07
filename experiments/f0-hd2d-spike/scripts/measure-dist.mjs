// A1: weights of dist/ by kind (raw and gzip). Run after `npm run build`.
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { extname, join, relative, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { gzipSync } from "node:zlib";

const dist = fileURLToPath(new URL("../dist", import.meta.url));
if (!existsSync(dist)) {
  console.error("dist/ not found: run `npm run build` first");
  process.exit(1);
}

const KIND = { ".js": "js", ".mjs": "js", ".css": "js", ".png": "textures", ".jpg": "textures", ".jpeg": "textures", ".webp": "textures", ".ktx2": "textures", ".glb": "glb", ".gltf": "glb" };
const walk = (d) => readdirSync(d).flatMap((n) => (statSync(join(d, n)).isDirectory() ? walk(join(d, n)) : [join(d, n)]));

const totals = { js: [0, 0], textures: [0, 0], glb: [0, 0], other: [0, 0] };
const rows = [];
for (const f of walk(dist)) {
  const buf = readFileSync(f);
  const gz = gzipSync(buf, { level: 9 }).length;
  const kind = KIND[extname(f).toLowerCase()] ?? "other";
  totals[kind][0] += buf.length;
  totals[kind][1] += gz;
  rows.push([relative(dist, f).split(sep).join("/"), kind, buf.length, gz]);
}

const kb = (n) => (n / 1024).toFixed(1);
for (const [name, kind, raw, gz] of rows.sort((a, b) => b[2] - a[2])) console.log(`${name}\t${kind}\t${kb(raw)} KB\t${kb(gz)} KB gzip`);
console.log("---");
let raw = 0;
let gz = 0;
for (const [kind, [r, g]] of Object.entries(totals)) {
  raw += r;
  gz += g;
  console.log(`${kind}\t${kb(r)} KB\t${kb(g)} KB gzip`);
}
console.log(`total\t${kb(raw)} KB\t${kb(gz)} KB gzip`);
