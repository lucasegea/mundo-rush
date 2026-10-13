// Chequeos de los dioramas en el formato de la maqueta (plan estetica-c M5, D-207). Puro, como el resto del compilador:
// - cada prop es un constructor por código conocido (`codigo/*`, lista de @lg/art) o un `modelo/*` del registro (ese
//   cruce lo hace assets.ts); `tinte` solo en props por código; todo prop por código lleva `tam`;
// - cada NPC puesto en un diorama tiene `apariencia` en su ficha;
// - el estimador de presupuesto de M1 corre para cada diorama y falla si se pasa del tier `medium` de 03 §2.7.1.
// El estimador suma con la tabla de costos de @lg/art; apps/web/test/maqueta.test.ts prueba que da EXACTAMENTE lo
// mismo que world/budget/estimate.ts sobre el grafo de three que arma world/ (lo estimado es lo dibujado).
import {
  addEstimates, BLOB_TRIANGLES, BORDER_PINES, bodyAsset, codePropTriangles, DETAIL_TRIANGLES, headTriangles, isCodeProp,
  isTreeProp, lookFromApariencia, pavingStoneCount, PLAYER_LOOK, SPRITE_TRIANGLES, ACTOR_DRAW_CALLS, TERRAIN_SKIRT,
  terrainTriangles, TIER_BUDGETS, WATER_TRIANGLES, type BudgetEstimate, type CharacterLook,
} from "@lg/art";
import { PREFIJO_MODELO, type RegistroAsset } from "../schemas/assets.ts";
import type { Diorama } from "../schemas/mundo.ts";
import type { Apariencia } from "../schemas/npc.ts";
import type { Conjunto } from "./conjunto.ts";
import type { Hallazgo } from "./tipos.ts";

const PREFIJO_CODIGO = "codigo/";
const RUTA_REGISTRO = "content/assets-registry.yaml";

/** Un prop del layout desplegado: una entrada por instancia. */
export interface InstanciaDesplegada {
  asset: string;
  pos: readonly [number, number, number];
  tam: readonly [number, number, number] | undefined;
  rotY: number;
  tinte: string | null;
}

/** Los props del layout con sus `instancias` desplegadas (la misma regla que prepareDiorama del núcleo). */
export function desplegarProps(d: Pick<Diorama, "props">): InstanciaDesplegada[] {
  return (d.props ?? []).flatMap((p) => {
    const lista = p.instancias ?? [{ pos: p.pos as [number, number, number], rotY: p.rotY, tam: undefined }];
    return lista.map((i) => ({ asset: p.asset, pos: i.pos, tam: i.tam ?? p.tam, rotY: i.rotY ?? p.rotY ?? 0, tinte: p.tinte ?? null }));
  });
}

export interface ContextoPresupuesto {
  /** Filas del registro de assets por id (`<pack>/<pieza>`). */
  registro: ReadonlyMap<string, RegistroAsset>;
  /** Apariencia de cada NPC (undefined si su ficha no la trae). */
  apariencias: ReadonlyMap<string, Apariencia | undefined>;
}

export interface EstimadoDiorama {
  total: BudgetEstimate;
  /** Por parte, para el mensaje de error y el log de la corrida. */
  partes: Record<string, BudgetEstimate>;
  /** Lo que no se pudo contar (modelo sin triángulos medidos, NPC sin apariencia): el estimado es parcial. */
  faltan: string[];
}

const contarTiles = (filas: readonly string[], cuenta: (id: number, x: number, z: number) => number, origen: readonly [number, number]): number =>
  filas.reduce((n, fila, row) => n + fila.trim().split(/\s+/).reduce((m, c, col) => m + cuenta(Number(c), origen[0] + col, origen[1] + row), 0), 0);

/** Instancias de detalle por tipo, como las siembra world/terrain/ (tiles de M1 o zonas del formato de la maqueta). */
function detalleDe(d: Diorama): Record<keyof typeof DETAIL_TRIANGLES, number> {
  const out = { flores: 0, matas: 0, piedritas: 0, empedrado: 0 };
  for (const capa of d.tiles ?? []) {
    if (capa.capa === "suelo") {
      out.empedrado += contarTiles(capa.filas, (id) => (id === 5 ? 2 : 0), capa.origen);
      continue;
    }
    out.flores += contarTiles(capa.filas, (id) => (id === 6 ? 1 : 0), capa.origen);
    out.matas += contarTiles(capa.filas, (id, x, z) => (id === 7 && ((((x + z) % 2) + 2) % 2) === 0 ? 1 : 0), capa.origen);
    out.piedritas += contarTiles(capa.filas, (id) => (id === 8 ? 1 : 0), capa.origen);
  }
  for (const z of d.detalle ?? []) out[z.tipo] += z.cantidad;
  for (const c of d.caminos ?? []) if (c.superficie === "empedrado") out.empedrado += pavingStoneCount(c.puntos, c.ancho);
  return out;
}

const tieneAgua = (d: Diorama): boolean =>
  (d.agua?.length ?? 0) > 0 || (d.rio?.length ?? 0) > 0 || (d.tiles ?? []).some((c) => c.capa === "suelo" && c.filas.some((f) => /(^|\s)4(\s|$)/.test(f.trim())));

/**
 * Estimado estático de llamadas y triángulos del diorama en `medium`, con todo a la vista (la vista lejana, sin recorte
 * por frustum): terreno, agua, props por código (los iguales instanciados: una llamada por tipo, tamaño y tinte), árboles
 * del layout y pinos del borde, detalle, modelos del pipeline, el jugador y cada NPC (cuerpo con esqueleto y cabeza),
 * una etiqueta y una burbuja de pedido por NPC (cota de arriba) y las sombras blob.
 */
export function estimarPresupuestoDiorama(d: Diorama, ctx: ContextoPresupuesto): EstimadoDiorama {
  const partes: Record<string, BudgetEstimate> = {};
  const faltan: string[] = [];
  const sumar = (k: string, e: BudgetEstimate): void => { partes[k] = addEstimates(partes[k] ?? { drawCalls: 0, triangles: 0 }, e); };

  sumar("terreno", { drawCalls: 1, triangles: terrainTriangles(d.bounds, d.terreno?.extension ?? TERRAIN_SKIRT) });
  if (tieneAgua(d)) sumar("agua", { drawCalls: 1, triangles: WATER_TRIANGLES });

  const grupos = new Map<string, { asset: string; tam: readonly [number, number, number]; n: number }>();
  const arboles = new Map<string, number>([["codigo/pino|", BORDER_PINES]]);
  let troncos = 0;
  for (const p of desplegarProps(d)) {
    if (p.asset.startsWith(PREFIJO_MODELO)) {
      const fila = ctx.registro.get(p.asset.slice(PREFIJO_MODELO.length));
      if (fila?.triangulos === undefined || fila.primitivas === undefined) faltan.push(`${p.asset} sin triangulos/primitivas en ${RUTA_REGISTRO}`);
      else sumar("modelos", { drawCalls: fila.primitivas, triangles: fila.triangulos });
      continue;
    }
    if (!p.tam || !isCodeProp(p.asset)) continue; // lo informa chequearDioramas
    if (isTreeProp(p.asset)) {
      const k = `${p.asset}|${p.tinte ?? ""}`;
      arboles.set(k, (arboles.get(k) ?? 0) + 1);
      troncos += 1;
      continue;
    }
    const k = `${p.asset}|${p.tam.join("x")}|${p.tinte ?? ""}`;
    const g = grupos.get(k) ?? { asset: p.asset, tam: p.tam, n: 0 };
    g.n += 1;
    grupos.set(k, g);
  }
  for (const g of grupos.values()) {
    if (!isCodeProp(g.asset)) continue;
    sumar("props", { drawCalls: 1, triangles: codePropTriangles(g.asset, { w: g.tam[0], h: g.tam[1], d: g.tam[2] }) * g.n });
  }
  for (const [k, n] of arboles) {
    const asset = k.slice(0, k.indexOf("|"));
    if (n > 0 && isCodeProp(asset)) sumar("arboles", { drawCalls: 1, triangles: codePropTriangles(asset, { w: 0.6, h: 1, d: 0.6 }) * n });
  }
  const det = detalleDe(d);
  for (const k of Object.keys(det) as (keyof typeof det)[]) if (det[k] > 0) sumar("detalle", { drawCalls: 1, triangles: DETAIL_TRIANGLES[k] * det[k] });

  const npcs = d.npcs ?? [];
  const looks: CharacterLook[] = [PLAYER_LOOK];
  for (const n of npcs) {
    const a = ctx.apariencias.get(n.id);
    if (a) looks.push(lookFromApariencia(a));
    else faltan.push(`${n.id} sin apariencia`);
  }
  for (const look of looks) {
    const cuerpo = ctx.registro.get(bodyAsset(look.body));
    if (cuerpo?.triangulos === undefined) {
      faltan.push(`${bodyAsset(look.body)} sin triangulos en ${RUTA_REGISTRO}`);
      continue;
    }
    sumar("personajes", { drawCalls: ACTOR_DRAW_CALLS, triangles: cuerpo.triangulos + headTriangles(look) });
  }
  if (npcs.length > 0) sumar("etiquetas y burbujas", { drawCalls: 2 * npcs.length, triangles: 2 * npcs.length * SPRITE_TRIANGLES });
  sumar("sombras blob", { drawCalls: 1, triangles: BLOB_TRIANGLES * (troncos + looks.length) });

  return { total: addEstimates(...Object.values(partes)), partes, faltan };
}

const fmt = (e: BudgetEstimate): string => `${e.drawCalls} llamadas, ${e.triangles} triángulos`;

export const chequearDioramas = (c: Conjunto, h: Hallazgo[]): void => {
  const err = (archivo: string, clave: string, mensaje: string): void => { h.push({ nivel: "error", archivo, clave, regla: "diorama", mensaje }); };
  const fichas = new Map(c.npcs.map((n) => [n.data.id, n]));
  const registro = new Map((c.registroAssets?.data.assets ?? []).map((a) => [a.id, a]));
  const apariencias = new Map(c.npcs.map((n) => [n.data.id, n.data.apariencia]));
  const medium = TIER_BUDGETS.medium;

  for (const { archivo, data: d } of c.dioramas) {
    (d.props ?? []).forEach((p, i) => {
      const k = `props[${i}]`;
      if (p.asset.startsWith(PREFIJO_CODIGO)) {
        if (!isCodeProp(p.asset)) err(archivo, `${k}.asset`, `"${p.asset}" no tiene constructor por código (world/props/builders.ts) ni es un modelo/* del registro`);
        const sinTam = p.instancias ? p.instancias.some((x) => !(x.tam ?? p.tam)) : !p.tam;
        if (sinTam) err(archivo, `${k}.tam`, `"${p.asset}" necesita tam (la huella que bloquea la grilla y el tamaño del constructor)`);
      } else if (p.asset.startsWith(PREFIJO_MODELO)) {
        if (p.tinte !== undefined) err(archivo, `${k}.tinte`, `"${p.asset}": tinte solo vale en props codigo/*; un modelo trae la pintura del pipeline (scripts/assets/optimize.ts)`);
      } else {
        err(archivo, `${k}.asset`, `"${p.asset}" no es codigo/* (constructor por código) ni modelo/* (registro en ${RUTA_REGISTRO})`);
      }
    });
    (d.npcs ?? []).forEach((n, i) => {
      const f = fichas.get(n.id);
      if (f && !f.data.apariencia) err(archivo, `npcs[${i}].id`, `${n.id} está en el diorama "${d.id}" y su ficha (${f.archivo}) no tiene apariencia`);
    });
    const e = estimarPresupuestoDiorama(d, { registro, apariencias });
    const detalle = Object.entries(e.partes).map(([k, v]) => `${k} ${fmt(v)}`).join("; ");
    if (e.total.drawCalls > medium.maxDrawCalls || e.total.triangles > medium.maxTriangles) {
      err(archivo, "", `presupuesto de medium pasado (03 §2.7.1: ${medium.maxDrawCalls} llamadas, ${medium.maxTriangles} triángulos): estimado ${fmt(e.total)} (${detalle})`);
    }
    // Un NPC sin apariencia ya tiene su error arriba (con el índice); acá van los que solo ve el estimador.
    for (const f of e.faltan.filter((x) => !x.endsWith(" sin apariencia"))) err(archivo, "", `presupuesto sin estimar: ${f}`);
  }
};
