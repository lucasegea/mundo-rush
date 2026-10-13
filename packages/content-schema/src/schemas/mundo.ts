// Región, lugares, fundaciones y dioramas (02 §0.3, §4.1, §6.2.6; 03 §6.4.3; D-169, D-180).
import { z } from "zod";
import { DETAIL_KINDS, HILL_LIMIT, isPaletteToken, TERRAIN_PALETTE_ROLES, TERRAIN_SKIRT, type PaletteToken } from "@lg/art";
import { idOf, LugarId, MisionId, NpcId, SaberId, SitioId } from "../ids.ts";
import { EstadoRevision, TextoL1 } from "./common.ts";
import { EstadoFundacion } from "./mision.ts";

/** Ids de diorama vigentes: no se renombran (D-180). muelle = Los Campos, plaza = El Cruce. */
export const DioramaId = z.enum(["muelle", "plaza", "test"]);

export const Region = z.strictObject({
  id: idOf("region"),
  nombre: TextoL1,
  dioramas: z.array(DioramaId).min(1),
  capitulos: z.array(z.number().int().min(0)).min(1),
  /** Elenco declarado de la región (02 §3.1): ids que el contenido puede nombrar antes de tener ficha. */
  elenco: z.array(NpcId).min(1),
  /** Saberes declarados de la región (02 §1.5): ids que una ficha de NPC puede listar antes de existir. */
  saberes: z.array(SaberId).min(1),
});
export type Region = z.infer<typeof Region>;

export const Lugar = z.strictObject({
  id: LugarId,
  nombre: TextoL1,
  en: z.string().min(1).nullable(),
  region: idOf("region"),
  diorama: DioramaId,
  /** Lugar público a la vista: la regla de menores en escena lo exige (01 §2.17.1, 03 §6.1 #6). */
  publico: z.boolean(),
  descripcion: z.string().min(1),
});
export type Lugar = z.infer<typeof Lugar>;

export const ArchivoLugares = z.strictObject({
  regiones: z.array(Region).min(1),
  lugares: z.array(Lugar).min(1),
});

/** Ficha de fundación (02 §6.2.6). Nada se compra: costo siempre null (D-169). */
export const Fundacion = z.strictObject({
  id: SitioId,
  nombre: z.strictObject({ "es-AR": z.string().min(1), en: z.string().min(1) }),
  nombre_corto: z.string().min(1),
  lugar: LugarId,
  diorama: DioramaId,
  estados: z.partialRecord(EstadoFundacion, z.strictObject({
    visual: z.string().min(1),
    desde: MisionId.nullable(),
  })).refine((e) => Object.keys(e).length > 0, { message: "al menos un estado visible" }),
  propuesta_por: NpcId,
  se_consigue_hablando: z.array(z.string().min(1)).min(1),
  /** Quién puso las manos; el jugador nunca aparece solo (02 §6.3 regla 29). */
  creditos: z.array(z.union([NpcId, z.literal("jugador")])).min(2),
  uso_en_mundo: z.array(z.string().min(1)),
  costo: z.null(),
  estado: EstadoRevision,
});
export type Fundacion = z.infer<typeof Fundacion>;

/** Ancla de un SITIO-* en el layout del diorama (03 §6.4.3; F3.3 la dibuja). */
export const AnclaSitio = z.strictObject({
  id: SitioId,
  pos: z.tuple([z.number(), z.number(), z.number()]),
  ocupa: z.array(z.tuple([z.number(), z.number()])).optional(),
  caminable_en: z.array(EstadoFundacion).optional(),
});

const Vec3 = z.tuple([z.number(), z.number(), z.number()]);
const Vec2 = z.tuple([z.number(), z.number()]);
const tilesDeFila = (fila: string): number => fila.trim().split(/\s+/).length;

/** Capa de tiles (03 §6.4.3): cada fila, ids del atlas separados por espacios (0 = vacío); 1 tile = 1 m. */
export const CapaTiles = z.strictObject({
  capa: z.string().min(1),
  origen: Vec2,
  filas: z.array(z.string().regex(/^\s*\d+(\s+\d+)*\s*$/, "ids enteros separados por espacios")).min(1)
    .refine((filas) => new Set(filas.map(tilesDeFila)).size === 1, { message: "todas las filas con la misma cantidad de tiles" }),
});

/** Un token de la paleta del mundo (@lg/art, propuesta C §6): cualquier otro texto falla nombrándolo (plan estetica-c M5). */
export const TokenPaleta = z.string().superRefine((v, ctx) => {
  if (!isPaletteToken(v)) ctx.addIssue({ code: "custom", message: `"${v}" no es un token de la paleta (@lg/art)` });
}).transform((v) => v as PaletteToken);

/** Una instancia de un prop repetido: posición, giro (grados) y, si cambia, su propio `tam`. */
const InstanciaProp = z.strictObject({ pos: Vec3, rotY: z.number().optional(), tam: Vec3.optional() });

/**
 * Un prop del layout (03 §6.4.3; plan estetica-c M5). Con `tam` (ancho, alto, profundidad) su huella bloquea la grilla.
 * `rotY` es el giro en grados alrededor del eje vertical; `tinte`, el token que reemplaza su color principal (solo
 * `codigo/*`); `instancias`, la lista de lugares de un prop repetido (árboles, cajas), en lugar de `pos`.
 */
export const PropDiorama = z.looseObject({
  asset: z.string().min(1),
  pos: Vec3.optional(),
  tam: Vec3.optional(),
  rotY: z.number().optional(),
  tinte: TokenPaleta.optional(),
  instancias: z.array(InstanciaProp).min(1).optional(),
}).refine((p) => (p.pos === undefined) !== (p.instancias === undefined), { message: "un prop lleva pos o instancias (una de las dos)", path: ["pos"] });

/** Curva catmull-rom por sus puntos de control (x, z) y su ancho en metros: caminos y ríos (propuesta C §2). */
const Curva = z.strictObject({ puntos: z.array(Vec2).min(2), ancho: z.number().positive().max(12) });

/**
 * Layout de diorama. F1.2 validó la forma general y las anclas `sitios:`; F2 tipó lo que consume el mapa de prueba en
 * tiles. Plan estetica-c M5 (D-207): el formato de la maqueta, con `terreno` (falda, lomas y semilla), `caminos` y `rio`
 * por curvas, `agua` por polígonos, `detalle` sembrado por zonas, `paleta` por zona y props con giro, tinte e
 * instancias. Las capas `tiles` siguen aceptadas (las lee el adaptador de M1) hasta M7, pero no se mezclan con el
 * formato nuevo. Lo que no se tipa todavía sigue pasando (looseObject).
 */
export const Diorama = z.looseObject({
  id: DioramaId,
  bounds: z.strictObject({ minX: z.number(), maxX: z.number(), minZ: z.number(), maxZ: z.number() })
    .refine((b) => b.maxX > b.minX && b.maxZ > b.minZ, { message: "límites vacíos" }),
  /** Aparición del jugador (F2; 03 §6.4.5 la usa para la conectividad). */
  spawn: Vec3.optional(),
  /** M7 SEAM: `atlas_tiles` y `tiles` salen del schema en M7 (las rechaza con un mensaje que apunta a este formato). */
  atlas_tiles: z.string().min(1).optional(),
  tiles: z.array(CapaTiles).optional(),
  terreno: z.strictObject({
    /** Metros de terreno más allá de los límites; como mínimo la falda de D-208, para no ver el borde del mundo. */
    extension: z.number().min(TERRAIN_SKIRT).max(400).optional(),
    /** Altura máxima de las lomas del borde (m). */
    lomas: z.number().min(0).max(HILL_LIMIT).optional(),
    semilla: z.number().int().optional(),
  }).optional(),
  /** Colores del terreno de la zona: papel → token de la paleta. */
  paleta: z.partialRecord(z.enum(TERRAIN_PALETTE_ROLES), TokenPaleta).optional(),
  caminos: z.array(Curva.extend({ superficie: z.enum(["camino", "empedrado"]).optional() })).optional(),
  rio: z.array(Curva).optional(),
  /** Estanques: el terreno se hunde y no es caminable. */
  agua: z.array(z.strictObject({ poligono: z.array(Vec2).min(3) })).optional(),
  /** Detalle del suelo sembrado en un círculo: `cantidad` instancias (cota exacta para el estimador de presupuesto). */
  detalle: z.array(z.strictObject({
    tipo: z.enum(DETAIL_KINDS), centro: Vec2, radio: z.number().positive().max(30), cantidad: z.number().int().min(1).max(200),
    semilla: z.number().int().optional(),
  })).optional(),
  props: z.array(PropDiorama).optional(),
  // M5 SEAM: animales (propuesta C, pendiente V2). Cuando el operador cierre V2 (pack CC0 con rig y clips), entran como
  // `animales: [{ especie, pos, area }]` con su fila en el registro y su costo en @lg/art (costs.ts) para el estimador.
  // Hoy no hay animales en ningún diorama; una clave `animales` pasa por el looseObject sin efecto.
  npcs: z.array(z.looseObject({ id: NpcId, spawn: Vec3, radio_interaccion: z.number().positive().optional() })).optional(),
  interactuables: z.array(z.looseObject({ id: z.string().min(1), pos: Vec3, radio: z.number().positive().optional() })).optional(),
  no_caminable: z.array(z.strictObject({ poligono: z.array(Vec2).min(3) })).optional(),
  sitios: z.array(AnclaSitio).default([]),
}).refine((d) => !((d.tiles?.length ?? 0) > 0 && [d.caminos, d.rio, d.agua, d.detalle].some((x) => x !== undefined)), {
  message: "un diorama va en tiles (M1, hasta M7) o en el formato de la maqueta (caminos, rio, agua, detalle), no en los dos",
  path: ["tiles"],
});
export type Diorama = z.infer<typeof Diorama>;
