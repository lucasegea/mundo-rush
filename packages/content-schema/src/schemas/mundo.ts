// Region, places, foundations and dioramas (02 §0.3, §4.1, §6.2.6; 03 §6.4.3; D-169, D-180).
import { z } from "zod";
import { DETAIL_KINDS, HILL_LIMIT, isPaletteToken, TERRAIN_PALETTE_ROLES, TERRAIN_SKIRT, type PaletteToken } from "@lg/art";
import { idOf, LugarId, MisionId, NpcId, SaberId, SitioId } from "../ids.ts";
import { EstadoRevision, TextoL1 } from "./common.ts";
import { EstadoFundacion } from "./mision.ts";

/** Current diorama ids: not renamed (D-180). muelle = Los Campos, plaza = El Cruce. */
export const DioramaId = z.enum(["muelle", "plaza", "test"]);

export const Region = z.strictObject({
  id: idOf("region"),
  nombre: TextoL1,
  dioramas: z.array(DioramaId).min(1),
  capitulos: z.array(z.number().int().min(0)).min(1),
  /** Declared cast of the region (02 §3.1): ids that the content can name before having a sheet. */
  elenco: z.array(NpcId).min(1),
  /** Declared knowledge items of the region (02 §1.5): ids that an NPC sheet can list before they exist. */
  saberes: z.array(SaberId).min(1),
});
export type Region = z.infer<typeof Region>;

export const Lugar = z.strictObject({
  id: LugarId,
  nombre: TextoL1,
  en: z.string().min(1).nullable(),
  region: idOf("region"),
  diorama: DioramaId,
  /** Public place in plain view: the minors-in-scene rule requires it (01 §2.17.1, 03 §6.1 #6). */
  publico: z.boolean(),
  descripcion: z.string().min(1),
});
export type Lugar = z.infer<typeof Lugar>;

export const ArchivoLugares = z.strictObject({
  regiones: z.array(Region).min(1),
  lugares: z.array(Lugar).min(1),
});

/** Foundation sheet (02 §6.2.6). Nothing is bought: cost always null (D-169). */
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
  /** Who put their hands to it; the player never appears alone (02 §6.3 rule 29). */
  creditos: z.array(z.union([NpcId, z.literal("jugador")])).min(2),
  uso_en_mundo: z.array(z.string().min(1)),
  costo: z.null(),
  estado: EstadoRevision,
});
export type Fundacion = z.infer<typeof Fundacion>;

/** Anchor of a SITIO-* in the diorama layout (03 §6.4.3; F3.3 draws it). */
export const AnclaSitio = z.strictObject({
  id: SitioId,
  pos: z.tuple([z.number(), z.number(), z.number()]),
  ocupa: z.array(z.tuple([z.number(), z.number()])).optional(),
  caminable_en: z.array(EstadoFundacion).optional(),
});

const Vec3 = z.tuple([z.number(), z.number(), z.number()]);
const Vec2 = z.tuple([z.number(), z.number()]);

/**
 * HD-2D keys retired in plan estetica-c M7 (D-207): `tiles` and `atlas_tiles` fail with a message that points
 * to the M5 painted diorama format (the walk grid comes from props, water, rivers and `no_caminable`, not from tiles).
 */
export const FORMATO_MAQUETA = "el formato de la maqueta (plan estetica-c M5): terreno, caminos y rio por curvas, agua por polígonos, detalle por zonas y props con rotY, tinte e instancias";
const retirada = (clave: string) =>
  z.never({ error: `\`${clave}\` se retiró con HD-2D (D-207, plan estetica-c M7): el diorama va en ${FORMATO_MAQUETA}` }).optional();

/** A world palette token (@lg/art, proposal C §6): any other text fails naming it (plan estetica-c M5). */
export const TokenPaleta = z.string().superRefine((v, ctx) => {
  if (!isPaletteToken(v)) ctx.addIssue({ code: "custom", message: `"${v}" no es un token de la paleta (@lg/art)` });
}).transform((v) => v as PaletteToken);

/** An instance of a repeated prop: position, rotation (degrees) and, if it changes, its own `tam`. */
const InstanciaProp = z.strictObject({ pos: Vec3, rotY: z.number().optional(), tam: Vec3.optional() });

/**
 * A layout prop (03 §6.4.3; plan estetica-c M5). With `tam` (width, height, depth) its footprint blocks the grid.
 * `rotY` is the rotation in degrees around the vertical axis; `tinte`, the token that replaces its main color (only
 * `codigo/*`); `instancias`, the list of places of a repeated prop (trees, boxes), instead of `pos`.
 */
export const PropDiorama = z.looseObject({
  asset: z.string().min(1),
  pos: Vec3.optional(),
  tam: Vec3.optional(),
  rotY: z.number().optional(),
  tinte: TokenPaleta.optional(),
  instancias: z.array(InstanciaProp).min(1).optional(),
}).refine((p) => (p.pos === undefined) !== (p.instancias === undefined), { message: "un prop lleva pos o instancias (una de las dos)", path: ["pos"] });

/** Catmull-rom curve by its control points (x, z) and its width in meters: paths and rivers (proposal C §2). */
const Curva = z.strictObject({ puntos: z.array(Vec2).min(2), ancho: z.number().positive().max(12) });

/**
 * Diorama layout. F1.2 validated the general shape and the `sitios:` anchors; F2 typed what the map consumes. Plan
 * estetica-c M5 (D-207): the painted diorama format, with `terreno` (skirt, hills and seed), `caminos` and `rio` by curves,
 * `agua` by polygons, `detalle` planted by zones, `paleta` per zone and props with rotation, tint and instances. Plan
 * estetica-c M7: the HD-2D `tiles` and `atlas_tiles` layers are rejected. What is not typed yet still passes
 * (looseObject).
 */
export const Diorama = z.looseObject({
  id: DioramaId,
  bounds: z.strictObject({ minX: z.number(), maxX: z.number(), minZ: z.number(), maxZ: z.number() })
    .refine((b) => b.maxX > b.minX && b.maxZ > b.minZ, { message: "límites vacíos" }),
  /** Player spawn (F2; 03 §6.4.5 uses it for connectivity). */
  spawn: Vec3.optional(),
  atlas_tiles: retirada("atlas_tiles"),
  tiles: retirada("tiles"),
  terreno: z.strictObject({
    /** Meters of terrain beyond the bounds; at minimum D-208's skirt, so the edge of the world is not visible. */
    extension: z.number().min(TERRAIN_SKIRT).max(400).optional(),
    /** Maximum height of the edge hills (m). */
    lomas: z.number().min(0).max(HILL_LIMIT).optional(),
    semilla: z.number().int().optional(),
    /**
     * Open-world-3d T6 (D-819): interior relief (`reliefAt` from @lg/art, 2 to 8 m) with flats at the spawn and at each
     * NPC; the terrain uses the open world's per-tier step (OPEN_WORLD_DENSITY). Without the key, the interior ground is
     * flat as in farmer.
     */
    relieve: z.boolean().optional(),
  }).optional(),
  /** Terrain colors of the zone: role → palette token. */
  paleta: z.partialRecord(z.enum(TERRAIN_PALETTE_ROLES), TokenPaleta).optional(),
  caminos: z.array(Curva.extend({ superficie: z.enum(["camino", "empedrado"]).optional() })).optional(),
  rio: z.array(Curva).optional(),
  /** Ponds: the terrain sinks and is not walkable. */
  agua: z.array(z.strictObject({ poligono: z.array(Vec2).min(3) })).optional(),
  /** Ground detail planted in a circle: `cantidad` instances (exact bound for the budget estimator). */
  detalle: z.array(z.strictObject({
    tipo: z.enum(DETAIL_KINDS), centro: Vec2, radio: z.number().positive().max(30), cantidad: z.number().int().min(1).max(200),
    semilla: z.number().int().optional(),
  })).optional(),
  props: z.array(PropDiorama).optional(),
  // M5 SEAM: animals (proposal C, pending V2). When the operator closes V2 (CC0 pack with rig and clips), they come in as
  // `animales: [{ especie, pos, area }]` with their row in the registry and their cost in @lg/art (costs.ts) for the estimator.
  // Today there are no animals in any diorama; an `animales` key passes through the looseObject with no effect.
  npcs: z.array(z.looseObject({ id: NpcId, spawn: Vec3, radio_interaccion: z.number().positive().optional() })).optional(),
  interactuables: z.array(z.looseObject({ id: z.string().min(1), pos: Vec3, radio: z.number().positive().optional() })).optional(),
  no_caminable: z.array(z.strictObject({ poligono: z.array(Vec2).min(3) })).optional(),
  sitios: z.array(AnclaSitio).default([]),
});
export type Diorama = z.infer<typeof Diorama>;
