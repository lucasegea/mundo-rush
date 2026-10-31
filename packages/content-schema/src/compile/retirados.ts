// Search for what was retired from v0.1 across content/ (02 §0.5.1, the test rule; 04 F1.2 A3).
// Ids and names: word boundary, respecting case. Terms: word boundary, case-insensitive.
import { isPair, isScalar, isSeq, parseDocument, visit } from "yaml";
import type { FilaRetirada } from "../schemas/control.ts";
import { regexTermino } from "./lints.ts";
import type { ArchivoFuente, Hallazgo } from "./tipos.ts";

export const RUTA_RETIRADOS = "content/retired-ids.yaml";

/** YAML key of the scalar that contains `offset` (`escenas[0].cierre_guionado[1].en`), or the line if it is not YAML. */
export const claveEnOffset = (ruta: string, texto: string, offset: number): string => {
  const linea = `línea ${texto.slice(0, offset).split("\n").length}`;
  if (!ruta.endsWith(".yaml")) return linea;
  const doc = parseDocument(texto);
  let encontrada: string | null = null;
  visit(doc, {
    Scalar(_k, node, camino) {
      const [ini, fin] = node.range ?? [0, 0];
      if (offset < ini || offset >= fin) return undefined;
      const partes: string[] = [];
      const cadena = [...camino, node];
      cadena.forEach((n, i) => {
        const hijo = cadena[i + 1];
        if (isPair(n) && isScalar(n.key)) partes.push(String(n.key.value));
        else if (isSeq(n) && hijo !== undefined) partes.push(`[${n.items.indexOf(hijo as never)}]`);
      });
      encontrada = partes.join(".").replace(/\.\[/g, "[");
      return visit.BREAK;
    },
  });
  return encontrada ?? linea;
};

/** Findings from `testea: si` rows in the content/ files (except retired-ids.yaml itself). */
export const buscarRetirados = (filas: readonly FilaRetirada[], archivos: readonly ArchivoFuente[]): Hallazgo[] => {
  const h: Hallazgo[] = [];
  const patrones = filas
    .filter((f) => f.testea === "si")
    .flatMap((f) => f.retirado.map((r) => ({ fila: f, r, re: new RegExp(regexTermino(r, f.tipo === "termino").source, f.tipo === "termino" ? "giu" : "gu") })));
  for (const a of archivos) {
    if (a.ruta === RUTA_RETIRADOS) continue;
    for (const { fila, r, re } of patrones) {
      for (const m of a.texto.matchAll(re)) {
        h.push({
          nivel: "error", archivo: a.ruta, clave: claveEnOffset(a.ruta, a.texto, m.index), regla: "retirados",
          mensaje: `"${m[0]}" está retirado (02 §0.5.1, fila "${fila.grupo}": ${r})`,
        });
      }
    }
  }
  return h;
};
