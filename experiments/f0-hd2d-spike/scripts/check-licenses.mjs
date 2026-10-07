// A5: every file under public/ must be listed in LICENSES.md (as `public/<path>` in backticks).
// An empty or missing public/ passes (0 of 0 covered) but the check still runs.
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative, sep } from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("..", import.meta.url));
const publicDir = join(root, "public");
const licenses = readFileSync(join(root, "LICENSES.md"), "utf8");

function walk(dir) {
  if (!existsSync(dir)) return [];
  return readdirSync(dir).flatMap((name) => {
    const full = join(dir, name);
    return statSync(full).isDirectory() ? walk(full) : [full];
  });
}

const listed = new Set([...licenses.matchAll(/`(public\/[^`]+)`/g)].map((m) => m[1]));
const files = walk(publicDir).map((f) => relative(root, f).split(sep).join("/"));
const missing = files.filter((f) => !listed.has(f));

console.log(`check:licenses: ${files.length - missing.length}/${files.length} files in public/ covered by LICENSES.md`);
if (missing.length > 0) {
  for (const f of missing) console.error(`  NOT LISTED: ${f}`);
  process.exit(1);
}
