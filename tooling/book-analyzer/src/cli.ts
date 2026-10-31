// CLI of the book → universe analyzer (book-mode slice-1, ADR-029).
//   node tooling/book-analyzer/src/cli.ts --book <path> --universe <id> [--out <dir>]
//
// --book     path to the hand-made intermediate (in slice-1 it is NOT the raw book; see stages/ingest.ts).
// --universe universe id (U-XXX); serves as default for --out and to check the manifest head.
// --out      output directory; defaults to content/universes/<id>/ (S1/D-804).
//
// Exits 0 if EMIT wrote everything; 1 if something did not validate (writes nothing) or an argument is missing.
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { ID_PATTERNS } from "@lg/content-schema";
import { correrPipeline } from "./pipeline.ts";

export const USAGE = "uso: node tooling/book-analyzer/src/cli.ts --book <path> --universe <id> [--out <dir>]";

export interface CliIo {
  out(line: string): void;
  err(line: string): void;
}

const valor = (argv: readonly string[], flag: string): string | undefined => {
  const pegado = argv.find((a) => a.startsWith(`${flag}=`))?.slice(flag.length + 1);
  if (pegado !== undefined) return pegado;
  const i = argv.indexOf(flag);
  return i >= 0 ? argv[i + 1] : undefined;
};

/** Runs the CLI. Returns the exit code. */
export const runCli = (argv: readonly string[], io: CliIo): number => {
  const book = valor(argv, "--book");
  const universe = valor(argv, "--universe");
  if (!book || !universe) {
    io.err(USAGE);
    return 1;
  }
  if (!ID_PATTERNS.universo.test(universe)) {
    io.err(`--universe inválido: "${universe}" no matchea ${ID_PATTERNS.universo} (p. ej. U-GALEANO)`);
    return 1;
  }
  const outDir = resolve(valor(argv, "--out") ?? `content/universes/${universe}`);
  let r;
  try {
    r = correrPipeline({ book: resolve(book), outDir });
  } catch (e) {
    io.err(`book-analyzer: ${e instanceof Error ? e.message : String(e)}`);
    return 1;
  }
  if (r.errores.length > 0) {
    io.err(`book-analyzer: ${r.errores.length} error(es) de validación; no se escribió nada:`);
    for (const m of r.errores) io.err(`  - ${m}`);
    return 1;
  }
  io.out(`book-analyzer OK (${universe}): ${r.escritos.length} archivo(s) en ${outDir}`);
  for (const s of r.escritos) io.out(`  → ${s}`);
  return 0;
};

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  process.exitCode = runCli(process.argv.slice(2), { out: (l) => console.log(l), err: (l) => console.error(l) });
}
