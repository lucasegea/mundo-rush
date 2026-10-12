// Misión y escenas (02 §4.3, §6.2.2, §6.2.3; 01 §2.5.3; 03 §6.1, §6.4.8).
import { z } from "zod";
import {
  ConversacionId, EscenaId, HabilidadId, HechoId, idOf, LugarId, LumiId, MisionId, NpcId, SaberId, SitioId,
} from "../ids.ts";
import { Banda, EstadoRevision, LineaGuionada, oNoAplica, RamaPocion, TextoL1 } from "./common.ts";

/** Estados visibles de una fundación (02 §1.8 regla 3, D-169). */
export const EstadoFundacion = z.enum(["idea", "en_marcha", "fundado", "crece"]);
export type EstadoFundacion = z.infer<typeof EstadoFundacion>;

/** Efecto que el núcleo aplica al cerrar la escena (03 §6.4.8, D-169, D-194). */
export const Efecto = z.union([
  z.strictObject({ fundacion: SitioId, estado: EstadoFundacion }),
  z.strictObject({ intro: NpcId }),
  z.strictObject({ flag: z.string().regex(/^[a-z][a-z0-9_]*$/, { message: "flag en snake_case" }) }),
]);
export type Efecto = z.infer<typeof Efecto>;

/** Sonidos objetivo E1-E14 (01 §2.4.7). */
export const Sonido = z.string().regex(/^E(?:[1-9]|1[0-4])$/, { message: "sonido fuera de E1-E14" });

/** Momento guionado de pronunciación (02 §6.2.3; lo usa FP). Nunca obligatorio. */
export const MomentoPronunciacion = z.strictObject({
  momento_id: idOf("pronunciacion"),
  tipo: z.enum(["repetir", "leer", "frase_clave", "par_minimo"]),
  linea_ref: z.string().min(1),
  texto_esperado: z.string().min(1),
  palabra_foco: z.string().min(1).nullable(),
  par: z.tuple([z.string().min(1), z.string().min(1)]).nullable(),
  sonidos: z.array(Sonido),
  consecuencia: z.string().min(1).nullable(),
  quien_propone: z.enum(["npc", "lumi"]),
  plantilla: LumiId.nullable(),
  obligatorio: z.literal(false),
  nota: z.string().min(1).optional(),
}).refine((m) => (m.tipo === "par_minimo") === (m.par !== null), {
  message: "par solo (y siempre) en momentos par_minimo", path: ["par"],
});

/** Rama del esqueleto de diálogo: condición del jugador → respuesta del NPC. */
export const Rama = z.strictObject({
  si: z.string().min(1),
  quien: NpcId.nullable(),
  npc: z.string().min(1).nullable(),
  /** guionada = texto fijo; ejemplo_ia = muestra de estilo para el modelo (02 §0.4). */
  tipo: z.enum(["guionada", "ejemplo_ia"]),
  lumi: LumiId.optional(),
  nota: z.string().min(1).optional(),
});

export const CriterioExito = z.strictObject({
  id: z.string().regex(/^C\d+$/),
  texto: z.string().min(1),
  opcional: z.boolean().default(false),
  /** Habilidad que este criterio demuestra, si aplica (referencia a HAB-*). */
  habilidad: HabilidadId.optional(),
});

export const Escena = z.strictObject({
  escena_id: EscenaId,
  /** null solo en escenas de Lumi sin NPC en tiempo real (02 §4.3, M0.2). */
  npc: NpcId.nullable(),
  lugar: LugarId,
  hora: z.enum(["amanecer", "manana", "tarde", "atardecer", "noche"]),
  situacion: z.string().min(1),
  necesidad_npc: oNoAplica(z.string().min(1)),
  banda: Banda,
  andamiaje_npc: oNoAplica(z.array(z.string().min(1)).min(1)),
  vocabulario_nivel: z.array(z.string().min(1)).min(1),
  max_palabras_nuevas_por_turno: z.number().int().min(0),
  hechos_escena: z.array(SaberId),
  apertura_guionada: oNoAplica(z.array(LineaGuionada).min(1)),
  ramas: oNoAplica(z.array(Rama).min(1)),
  /** Líneas [GUIONADA] de una escena sin NPC conversando (excepción de 02 §4.3). */
  lineas_guionadas: z.array(LineaGuionada).optional(),
  criterios_exito: z.array(CriterioExito).min(1),
  errores_de_objetivo: z.array(z.string().min(1)),
  cierre_guionado: z.array(LineaGuionada).min(1),
  salida_si_no_converge: oNoAplica(z.strictObject({
    disparador: z.string().min(1),
    lineas: z.array(LineaGuionada),
    resultado: z.string().min(1),
  })),
  efectos: z.array(Efecto).default([]),
  eventos: z.array(z.string().min(1)),
  resumen_para_siguiente: z.string().min(1),
  temas_permitidos: z.array(z.string().min(1)).min(1),
  temas_vedados_extra: z.array(z.string().min(1)),
  /** Escena en modo escritura: única excepción del apelativo "Dear" como encabezado de carta. */
  modo_escritura: z.boolean().default(false),
  /** Cantidades de objetos permitidas por el lint de cifras (02 §6.6 #15), p. ej. "3 bags of seeds". */
  cifras_permitidas: z.array(z.string().min(1)).default([]),
  pronunciacion: z.array(MomentoPronunciacion).default([]),
  /**
   * ADR-027: escena de conversación libre por medidores. La cierra el sistema de conversación (una acción del juego
   * cuando se llena el último medidor), no los criterios del observador; sin éxito no se da por cumplida.
   */
  conversacion: ConversacionId.optional(),
  /** Topes propios de la escena en segundos (si no, los de models.yaml): una conversación libre necesita más aire. */
  topes: z.strictObject({ suave_s: z.number().int().positive(), duro_s: z.number().int().positive() })
    .refine((t) => t.suave_s < t.duro_s, { message: "suave_s tiene que ser menor que duro_s" }).optional(),
});
export type Escena = z.infer<typeof Escena>;

export const Pocion = z.strictObject({
  rama: RamaPocion,
  evento: z.string().min(1),
  max: z.number().positive(),
});

export const Mision = z.strictObject({
  id: MisionId,
  titulo: TextoL1,
  capitulo: z.number().int().min(0),
  region: idOf("region"),
  mcer: Banda,
  tipo_tarea: z.enum([
    "info_gap", "transaccion", "orientacion", "resolucion_problema", "narracion", "decision",
    "persuasion", "mediacion", "social_con_meta", "exploracion",
  ]),
  can_do: TextoL1,
  /** Misiones, habilidades (HAB-*) o presentaciones (`intro:NPC-*`). */
  requiere: z.array(z.string().regex(/^(?:M\d+\.\d+|HAB-[A-Z]+-(?:\d+|[A-Z]+)|intro:NPC-[A-Z]+)$/, {
    message: "requiere admite M<c>.<n>, HAB-* o intro:NPC-*",
  })),
  meta: z.string().min(1),
  consigue: z.string().min(1),
  red: z.strictObject({
    altas: z.array(z.strictObject({ npc: NpcId, por: NpcId.nullable() })),
    presenta: z.array(z.strictObject({ npc: NpcId, por: NpcId })),
    nombra: z.array(NpcId).default([]),
  }),
  fundacion: z.string().min(1),
  saberes: z.array(z.strictObject({ saber: SaberId, rama: z.boolean() })),
  hechos_verificables: z.array(HechoId),
  resultado_mundo: z.string().min(1),
  contagio: z.string().min(1).nullable(),
  npcs: z.array(NpcId),
  lenguaje_objetivo: z.strictObject({
    funciones: z.array(z.string().min(1)),
    estructuras: z.array(z.string().min(1)),
    chunks: z.array(z.string().min(1)),
    vocabulario: z.array(z.string().min(1)),
  }),
  pre_tarea: oNoAplica(z.strictObject({ plantilla: LumiId, piezas_utiles: z.array(z.string().min(1)) })),
  beats: z.array(z.string().min(1)).min(1),
  escenas: z.array(Escena).min(1),
  lumi_marca: z.string().min(1),
  pociones: z.array(Pocion),
  desbloqueos: z.array(z.strictObject({ habilidad: HabilidadId, condicion: z.string().min(1).nullable() })),
  repaso: z.strictObject({
    resurfaces: z.array(z.string().min(1)),
    planta: z.array(z.string().min(1)),
    reaparece_en: z.array(z.string().min(1)),
  }),
  mundo: z.array(z.string().min(1)),
  modo_texto: z.string().min(1),
  efectos: z.array(Efecto).default([]),
  duracion_objetivo_min: z.number().positive(),
  estado: EstadoRevision,
});
export type Mision = z.infer<typeof Mision>;

