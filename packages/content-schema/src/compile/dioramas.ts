// Checks of dioramas in the painted diorama format (plan estetica-c M5, D-207). Pure, like the rest of the compiler:
// - each prop is a known code constructor (`codigo/*`, list from @lg/art) or a `modelo/*` from the registry (that
//   cross-check is done by assets.ts); `tinte` only on code props; every code prop carries `tam`;
// - each NPC placed in a diorama has `apariencia` in its sheet;
// - the budget estimator runs for each diorama in each tier with a world (plan estetica-c M6: `low`, `medium` and
//   `high`, each with its @lg/art density) and fails if it exceeds that tier's caps in 03 §2.7.1.
// The estimator adds up with the @lg/art cost table; apps/web/test/maqueta.test.ts tests that it gives EXACTLY the
// same as world/budget/estimate.ts over the three graph that world/ builds at each density (what is estimated is what is drawn).
import {
  addEstimates, BLOB_TRIANGLES, bodyAsset, codePropTriangles, DENSITY, DETAIL_TRIANGLES, headTriangles, isCodeProp,
  isTreeProp, keptDetail, lookFromApariencia, OPEN_WORLD_DENSITY, pavingStoneCount, skyEstimate, PLAYER_LOOK, SPRITE_TRIANGLES, ACTOR_DRAW_CALLS, TERRAIN_APRON, TERRAIN_SKIRT,
  SHADOW_MAP_TIERS, terrainTriangles, TIER_BUDGETS, TIER_DENSITY, WATER_TRIANGLES, WORLD_TIERS, type BudgetEstimate, type CharacterLook,
  type SceneDensity, type WorldTier,
} from "@lg/art";
import { PREFIJO_MODELO, type RegistroAsset } from "../schemas/assets.ts";
import type { Diorama } from "../schemas/mundo.ts";
import type { Apariencia } from "../schemas/npc.ts";
import type { Conjunto } from "./conjunto.ts";
import type { Hallazgo } from "./tipos.ts";

const PREFIJO_CODIGO = "codigo/";
/** The part of the estimate that is not in the scene graph: the `high` shadow map pass. */
export const PARTE_SOMBRA = "pasada de sombra";
const RUTA_REGISTRO = "content/assets-registry.yaml";

/** A layout prop, expanded: one entry per instance. */
export interface InstanciaDesplegada {
  asset: string;
  pos: readonly [number, number, number];
  tam: readonly [number, number, number] | undefined;
  rotY: number;
  tinte: string | null;
}

/** The layout's props with their `instancias` expanded (the same rule as the core's prepareDiorama). */
export function desplegarProps(d: Pick<Diorama, "props">): InstanciaDesplegada[] {
  return (d.props ?? []).flatMap((p) => {
    const lista = p.instancias ?? [{ pos: p.pos as [number, number, number], rotY: p.rotY, tam: undefined }];
    return lista.map((i) => ({ asset: p.asset, pos: i.pos, tam: i.tam ?? p.tam, rotY: i.rotY ?? p.rotY ?? 0, tinte: p.tinte ?? null }));
  });
}

export interface ContextoPresupuesto {
  /** Asset registry rows by id (`<pack>/<pieza>`). */
  registro: ReadonlyMap<string, RegistroAsset>;
  /** Each NPC's appearance (undefined if its sheet does not carry one). */
  apariencias: ReadonlyMap<string, Apariencia | undefined>;
}

export interface EstimadoDiorama {
  total: BudgetEstimate;
  /** By part, for the error message and the run log. */
  partes: Record<string, BudgetEstimate>;
  /** What could not be counted (model without measured triangles, NPC without appearance): the estimate is partial. */
  faltan: string[];
}

/**
 * Detail instances by type, as world/terrain/ plants them (zones of the painted diorama format) and as
 * the density leaves them (M6: at reduced density one of every three flowers, tufts and pebbles remains; the cobblestones stay whole).
 */
function detalleDe(d: Diorama, densidad: SceneDensity): Record<keyof typeof DETAIL_TRIANGLES, number> {
  const out = { flores: 0, matas: 0, piedritas: 0, empedrado: 0 };
  for (const z of d.detalle ?? []) out[z.tipo] += z.cantidad;
  for (const c of d.caminos ?? []) if (c.superficie === "empedrado") out.empedrado += pavingStoneCount(c.puntos, c.ancho);
  return { flores: keptDetail(out.flores, densidad), matas: keptDetail(out.matas, densidad), piedritas: keptDetail(out.piedritas, densidad), empedrado: out.empedrado };
}

const tieneAgua = (d: Diorama): boolean => (d.agua?.length ?? 0) > 0 || (d.rio?.length ?? 0) > 0;

/**
 * Static estimate of calls and triangles of the diorama in a tier (`medium` by default), with its density and with everything
 * in view: it is the far view of the farthest zoom (160 m, D-208), where the whole diorama and the skirt fit on screen
 * and nothing is culled by frustum. It counts terrain, water, code props (identical instanced ones: one call per type,
 * size and tint), layout trees and edge pines, detail, pipeline models, the player and each NPC (skeletal body and
 * head), a label and an order bubble per NPC (upper bound) and the blob shadows. At `high` it adds the
 * shadow map pass (the bodies again, "shadow pass" part); it does not count the post passes (full
 * screen, measured by renderer.info in the director-mode snapshot).
 */
export function estimarPresupuestoDiorama(d: Diorama, ctx: ContextoPresupuesto, tier: WorldTier = "medium"): EstimadoDiorama {
  const partes: Record<string, BudgetEstimate> = {};
  const faltan: string[] = [];
  const sumar = (k: string, e: BudgetEstimate): void => { partes[k] = addEstimates(partes[k] ?? { drawCalls: 0, triangles: 0 }, e); };
  const densidad = TIER_DENSITY[tier];

  const extension = d.terreno?.extension ?? TERRAIN_SKIRT;
  if (d.terreno?.relieve === true) {
    // Open-world-3d T6 (D-819, D-823): the open world's terrain goes in tiles (one call each, all in view
    // at the whole map) with the tier's step; the dome and clouds (not at `low`) are part of the diorama.
    const ow = OPEN_WORLD_DENSITY[tier];
    sumar("terreno", { drawCalls: ow.terrainTiles[0] * ow.terrainTiles[1], triangles: terrainTriangles(d.bounds, extension, ow.terrain) });
    // Open-world-3d M3 (AC35): the apron around the extent, one more call with the ground material.
    sumar("terreno", { drawCalls: TERRAIN_APRON.drawCalls, triangles: TERRAIN_APRON.triangles });
    sumar("cielo", skyEstimate(tier));
  } else {
    sumar("terreno", { drawCalls: 1, triangles: terrainTriangles(d.bounds, extension, densidad) });
  }
  if (tieneAgua(d)) sumar("agua", { drawCalls: 1, triangles: WATER_TRIANGLES });

  const grupos = new Map<string, { asset: string; tam: readonly [number, number, number]; n: number }>();
  const arboles = new Map<string, number>([["codigo/pino|", DENSITY[densidad].borderPines]]);
  let troncos = 0;
  for (const p of desplegarProps(d)) {
    if (p.asset.startsWith(PREFIJO_MODELO)) {
      const fila = ctx.registro.get(p.asset.slice(PREFIJO_MODELO.length));
      if (fila?.triangulos === undefined || fila.primitivas === undefined) faltan.push(`${p.asset} sin triangulos/primitivas en ${RUTA_REGISTRO}`);
      else sumar("modelos", { drawCalls: fila.primitivas, triangles: fila.triangulos });
      continue;
    }
    if (!p.tam || !isCodeProp(p.asset)) continue; // reported by chequearDioramas
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
    sumar("props", { drawCalls: 1, triangles: codePropTriangles(g.asset, { w: g.tam[0], h: g.tam[1], d: g.tam[2] }, densidad) * g.n });
  }
  for (const [k, n] of arboles) {
    const asset = k.slice(0, k.indexOf("|"));
    if (n > 0 && isCodeProp(asset)) sumar("arboles", { drawCalls: 1, triangles: codePropTriangles(asset, { w: 0.6, h: 1, d: 0.6 }, densidad) * n });
  }
  const det = detalleDe(d, densidad);
  for (const k of Object.keys(det) as (keyof typeof det)[]) if (det[k] > 0) sumar("detalle", { drawCalls: 1, triangles: DETAIL_TRIANGLES[k] * det[k] });

  const npcs = d.npcs ?? [];
  const looks: CharacterLook[] = [PLAYER_LOOK];
  for (const n of npcs) {
    const a = ctx.apariencias.get(n.id);
    if (a) looks.push(lookFromApariencia(a));
    else faltan.push(`${n.id} sin apariencia`);
  }
  const sombra = (SHADOW_MAP_TIERS as readonly WorldTier[]).includes(tier);
  for (const look of looks) {
    const cuerpo = ctx.registro.get(bodyAsset(look.body, densidad));
    if (cuerpo?.triangulos === undefined) {
      faltan.push(`${bodyAsset(look.body, densidad)} sin triangulos en ${RUTA_REGISTRO}`);
      continue;
    }
    sumar("personajes", { drawCalls: ACTOR_DRAW_CALLS, triangles: cuerpo.triangulos + headTriangles(look) });
    if (sombra) sumar(PARTE_SOMBRA, { drawCalls: 1, triangles: cuerpo.triangulos });
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
    const faltan = new Set<string>();
    for (const tier of WORLD_TIERS) {
      const tope = TIER_BUDGETS[tier];
      const e = estimarPresupuestoDiorama(d, { registro, apariencias }, tier);
      const detalle = Object.entries(e.partes).map(([k, v]) => `${k} ${fmt(v)}`).join("; ");
      if (e.total.drawCalls > tope.maxDrawCalls || e.total.triangles > tope.maxTriangles) {
        err(archivo, "", `presupuesto de ${tier} pasado (03 §2.7.1: ${tope.maxDrawCalls} llamadas, ${tope.maxTriangles} triángulos): estimado ${fmt(e.total)} (${detalle})`);
      }
      for (const f of e.faltan) faltan.add(f);
    }
    // An NPC without appearance already has its error above (with the index); here go the ones only the estimator sees.
    for (const f of [...faltan].filter((x) => !x.endsWith(" sin apariencia"))) err(archivo, "", `presupuesto sin estimar: ${f}`);
  }
};
