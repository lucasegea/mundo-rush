// EvidenceStore (D-157, ADR-004 enmendado por P0): log de evidencia append-only del operador. Interfaz + adaptador en
// memoria (tests) + adaptador de archivo JSONL (apps/server/data/evidence.jsonl, gitignored). Este módulo es uno de los
// dos lugares de apps/server que escriben a disco (lint, D-108) y rechaza cualquier dato binario: el servidor nunca
// guarda audio.
import { appendFileSync, closeSync, existsSync, fstatSync, mkdirSync, openSync, readFileSync, readSync } from "node:fs";
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { EvidenceEventSchema, type EvidenceEvent } from "@lg/protocol";

export const DEFAULT_EVIDENCE_PATH = fileURLToPath(new URL("../../data/evidence.jsonl", import.meta.url));

export interface EvidenceStore {
  append(event: EvidenceEvent): void;
  /** Eventos de la cuenta, en el orden en que se agregaron. */
  list(accountId: string): EvidenceEvent[];
}

export class BinaryDataError extends Error {
  constructor(path: string) {
    super(`dato binario rechazado en ${path || "(raíz)"}: el servidor no guarda audio (D-108)`);
    this.name = "BinaryDataError";
  }
}

/** Recorre el valor y falla ante Buffer, ArrayBuffer o vistas tipadas (D-108). */
export function assertNoBinary(value: unknown, path = ""): void {
  if (value instanceof ArrayBuffer || ArrayBuffer.isView(value) || (typeof Blob !== "undefined" && value instanceof Blob)) {
    throw new BinaryDataError(path);
  }
  if (Array.isArray(value)) value.forEach((v, i) => assertNoBinary(v, `${path}[${i}]`));
  else if (value !== null && typeof value === "object") {
    for (const [k, v] of Object.entries(value)) assertNoBinary(v, path ? `${path}.${k}` : k);
  }
}

/** Valida antes de guardar: sin binarios y con la forma del esquema (un campo de más no entra). */
function checked(event: EvidenceEvent): EvidenceEvent {
  assertNoBinary(event);
  return EvidenceEventSchema.parse(event);
}

export function createMemoryEvidenceStore(): EvidenceStore {
  const events: EvidenceEvent[] = [];
  return {
    append(event) {
      events.push(checked(event));
    },
    list: (accountId) => events.filter((e) => e.accountId === accountId),
  };
}

/** Lee el JSONL saltando líneas corruptas (p. ej. una escritura cortada por un apagón). */
export function readEvidenceFile(path: string): EvidenceEvent[] {
  if (!existsSync(path)) return [];
  const out: EvidenceEvent[] = [];
  for (const line of readFileSync(path, "utf8").split("\n")) {
    if (line.trim() === "") continue;
    try {
      const parsed = EvidenceEventSchema.safeParse(JSON.parse(line));
      if (parsed.success) out.push(parsed.data);
    } catch {
      // línea corrupta: se ignora
    }
  }
  return out;
}

/** true si el archivo no existe, está vacío o su último byte es "
". */
function endsWithNewline(path: string): boolean {
  let fd: number;
  try {
    fd = openSync(path, "r");
  } catch {
    return true;
  }
  try {
    const size = fstatSync(fd).size;
    if (size === 0) return true;
    const last = Buffer.alloc(1);
    readSync(fd, last, 0, 1, size - 1);
    return last[0] === 0x0a;
  } finally {
    closeSync(fd);
  }
}

/** Adaptador de archivo: una línea JSON por evento, solo agregar. Lo escrito sobrevive a reiniciar el servidor. */
export function createFileEvidenceStore(path: string = DEFAULT_EVIDENCE_PATH): EvidenceStore {
  let cache: EvidenceEvent[] | null = null;
  const all = (): EvidenceEvent[] => (cache ??= readEvidenceFile(path));
  return {
    append(event) {
      const ok = checked(event);
      const events = all(); // se lee antes de escribir: si no, el evento nuevo quedaría dos veces en la caché
      mkdirSync(dirname(path), { recursive: true });
      // Si una escritura anterior quedó cortada sin salto de línea, el evento nuevo se pegaría a ella y se
      // perdería al leer: se cierra la línea rota primero.
      const sep = endsWithNewline(path) ? "" : "\n";
      appendFileSync(path, `${sep}${JSON.stringify(ok)}\n`, "utf8");
      events.push(ok);
    },
    list: (accountId) => all().filter((e) => e.accountId === accountId),
  };
}
