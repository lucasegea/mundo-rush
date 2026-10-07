// CLI del modo director (03 §6.5.2, D-188): `npm run director -- <comando>`. Sin dependencias nuevas.
//   state                               snapshot completo (JSON)
//   where                               una línea: diorama, tile, NPC cercano, misión y paso
//   journal [--tail N] [--session ID]   eventos del diario (JSONL), por defecto de la sesión más reciente
//   sessions                            sesiones del diario, de la más nueva a la más vieja
//   content <id>                        dónde está definido un id de contenido y su YAML
//   prune                               deja las últimas 30 sesiones del diario (D-192)
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { REPO_ROOT } from "./files.ts";
import { pruneJournal } from "./journal.ts";
import { formatWhere, listSessions, lookupContent, readJournal, readState } from "./read.ts";

export const USAGE = "uso: npm run director -- state | where | journal [--tail N] [--session ID] | sessions | content <id> | prune";

export interface CliIo {
  root: string;
  out(line: string): void;
  err(line: string): void;
  now?: () => number;
}

const flag = (args: readonly string[], name: string): string | undefined => {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : undefined;
};

/** Corre un comando. Devuelve el código de salida. */
export function runCli(argv: readonly string[], io: CliIo): number {
  const [command, ...args] = argv;
  try {
    switch (command) {
      case "state": {
        const s = readState(io.root);
        if (!s) {
          io.err(formatWhere(null));
          return 1;
        }
        io.out(JSON.stringify(s, null, 2));
        return 0;
      }
      case "where": {
        const s = readState(io.root);
        io.out(formatWhere(s, io.now?.() ?? Date.now()));
        return s ? 0 : 1;
      }
      case "journal": {
        const tailRaw = flag(args, "--tail");
        if (tailRaw !== undefined && !/^\d+$/.test(tailRaw)) {
          io.err(`--tail necesita un entero ≥ 0 (vino ${JSON.stringify(tailRaw)})`);
          return 2;
        }
        const session = flag(args, "--session");
        const j = readJournal(io.root, { ...(session ? { session } : {}), ...(tailRaw !== undefined ? { tail: Number(tailRaw) } : {}) });
        if (j.sessionId === null) {
          io.err("sin sesiones en .director/journal/");
          return 1;
        }
        for (const e of j.events) io.out(JSON.stringify(e));
        return 0;
      }
      case "sessions": {
        const list = listSessions(io.root);
        if (list.length === 0) io.out("sin sesiones en .director/journal/");
        for (const s of list) {
          const npcs = s.npcsTalked.length > 0 ? s.npcsTalked.join(",") : "-";
          io.out(`${s.id}  ${s.events} eventos  ${s.startedAt ?? "?"} → ${s.lastAt ?? "?"}${s.ended ? "" : " (abierta)"}  NPCs: ${npcs}`);
        }
        return 0;
      }
      case "content": {
        const id = args[0];
        if (!id) {
          io.err("uso: npm run director -- content <id>");
          return 2;
        }
        const found = lookupContent(io.root, id);
        if (!found) {
          io.err(`no hay contenido con id ${id}`);
          return 1;
        }
        io.out(`${found.file}\n---\n${found.text.trimEnd()}`);
        return 0;
      }
      case "prune": {
        const removed = pruneJournal(io.root);
        io.out(`diario: ${removed.length} sesión(es) borrada(s)`);
        return 0;
      }
      default:
        io.err(USAGE);
        return 2;
    }
  } catch (err) {
    io.err(`director: ${err instanceof Error ? err.message : String(err)}`);
    return 1;
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  process.exitCode = runCli(process.argv.slice(2), { root: REPO_ROOT, out: (l) => console.log(l), err: (l) => console.error(l) });
}
