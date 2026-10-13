// Lectura del contenido: clasifica cada archivo por su ruta canónica (03 §4.2.1), parsea el YAML,
// valida con su esquema y arma el conjunto tipado. Los errores nombran archivo y clave.
import { parseDocument } from "yaml";
import type { z } from "zod";
import { ArbolHabilidades, ArchivoGlosario, TarjetaNivel } from "../schemas/aprendizaje.ts";
import type { EntradaGlosario, Habilidad, RamaInfo } from "../schemas/aprendizaje.ts";
import { ArchivoAllowlist, ArchivoContencion, ArchivoRetirados, ListaBloqueo, TemasGlobales } from "../schemas/control.ts";
import { ArchivoLumi } from "../schemas/lumi.ts";
import type { PlantillaLumi } from "../schemas/lumi.ts";
import { Mision } from "../schemas/mision.ts";
import { ArchivoLugares, Diorama, Fundacion } from "../schemas/mundo.ts";
import type { Lugar, Region } from "../schemas/mundo.ts";
import { Npc } from "../schemas/npc.ts";
import { PedidoTablero } from "../schemas/pedido.ts";
import { ArchivoPistas, ArchivoPresentaciones, ArchivoSobres } from "../schemas/red.ts";
import type { Pista, Presentacion, Sobre } from "../schemas/red.ts";
import { Saber } from "../schemas/saber.ts";
import { FichaConversacion } from "../schemas/conversacion.ts";
import { ArchivoCreditos, ArchivoRegistroAssets } from "../schemas/assets.ts";
import type { ArchivoFuente, Entrada, Hallazgo } from "./tipos.ts";
import { clave } from "./tipos.ts";

type Infer<S extends z.ZodType> = z.infer<S>;

/** Contenido validado por esquema, listo para chequeos cruzados. */
export interface Conjunto {
  misiones: Entrada<Infer<typeof Mision>>[];
  npcs: Entrada<Infer<typeof Npc>>[];
  pedidos: Entrada<Infer<typeof PedidoTablero>>[];
  fundaciones: Entrada<Infer<typeof Fundacion>>[];
  saberes: Entrada<Infer<typeof Saber>>[];
  presentaciones: Entrada<Presentacion>[];
  sobres: Entrada<Sobre>[];
  pistas: Entrada<Pista>[];
  plantillas: Entrada<PlantillaLumi>[];
  glosario: Entrada<EntradaGlosario>[];
  habilidades: Entrada<Habilidad>[];
  ramas: RamaInfo[];
  regiones: Entrada<Region>[];
  lugares: Entrada<Lugar>[];
  niveles: Entrada<Infer<typeof TarjetaNivel>>[];
  dioramas: Entrada<Infer<typeof Diorama>>[];
  /** Fichas de conversación por medidores (ADR-027), solo servidor. */
  conversaciones: Entrada<Infer<typeof FichaConversacion>>[];
  bloqueos: Entrada<Infer<typeof ListaBloqueo>>[];
  temas: Infer<typeof TemasGlobales> | null;
  /** Contención y línea segura (F4.2, D-112). */
  contencion: Infer<typeof ArchivoContencion> | null;
  retirados: Entrada<Infer<typeof ArchivoRetirados>> | null;
  allowlist: Entrada<Infer<typeof ArchivoAllowlist>> | null;
  /** Registro de licencias de assets (03 §6.4.2, plan estetica-c M2). */
  registroAssets: Entrada<Infer<typeof ArchivoRegistroAssets>> | null;
  /** Créditos que genera la pantalla de créditos (03 §6.4.2). */
  creditos: Entrada<Infer<typeof ArchivoCreditos>> | null;
  /** Textos planos que van solo al servidor (content/prompts/*.txt), por nombre de archivo sin extensión. */
  prompts: Record<string, string>;
  /** Ids definidos por cada archivo (para la compilación incremental). */
  idsPorArchivo: Map<string, string[]>;
}

export const conjuntoVacio = (): Conjunto => ({
  misiones: [], npcs: [], pedidos: [], fundaciones: [], saberes: [], presentaciones: [], sobres: [], pistas: [],
  plantillas: [], glosario: [], habilidades: [], ramas: [], regiones: [], lugares: [], niveles: [], dioramas: [], conversaciones: [],
  bloqueos: [], temas: null, contencion: null, retirados: null, allowlist: null, registroAssets: null, creditos: null, prompts: {},
  idsPorArchivo: new Map(),
});

type Tipo =
  | "mision" | "npc" | "pedido" | "fundacion" | "saber" | "presentaciones" | "sobres" | "pistas" | "lumi"
  | "glosario" | "habilidades" | "lugares" | "nivel" | "diorama" | "bloqueo" | "temas" | "contencion" | "retirados"
  | "allowlist" | "prompt" | "conversacion" | "registro-assets" | "creditos" | "ignorado";

/** Ruta canónica → tipo (03 §4.2.1). Lo que no matchea es un error: nada se ignora en silencio. */
const RUTAS: [RegExp, Tipo][] = [
  [/^content\/missions\/[^/]+\.yaml$/, "mision"],
  [/^content\/npcs\/[^/]+\.yaml$/, "npc"],
  [/^content\/board\/[^/]+\.yaml$/, "pedido"],
  [/^content\/fundaciones\/[^/]+\.yaml$/, "fundacion"],
  [/^content\/saberes\/[^/]+\.yaml$/, "saber"],
  [/^content\/red\/presentaciones\.yaml$/, "presentaciones"],
  [/^content\/mystery\/sobres\.yaml$/, "sobres"],
  [/^content\/mystery\/clues\.yaml$/, "pistas"],
  [/^content\/companion\/lumi\.es-AR\.yaml$/, "lumi"],
  [/^content\/glossary\/en\.es-AR\.yaml$/, "glosario"],
  [/^content\/skills\/skill-tree\.yaml$/, "habilidades"],
  [/^content\/world\/places\.yaml$/, "lugares"],
  [/^content\/level-cards\/[^/]+\.yaml$/, "nivel"],
  [/^content\/dioramas\/[^/]+\.yaml$/, "diorama"],
  [/^content\/safety\/blocklists\/[^/]+\.yaml$/, "bloqueo"],
  [/^content\/safety\/topics\.global\.yaml$/, "temas"],
  [/^content\/safety\/containment\.es-AR\.yaml$/, "contencion"],
  [/^content\/retired-ids\.yaml$/, "retirados"],
  [/^content\/lint-allowlist\.yaml$/, "allowlist"],
  [/^content\/prompts\/[^/]+\.txt$/, "prompt"],
  [/^content\/conversaciones\/[^/]+\.yaml$/, "conversacion"],
  [/^content\/assets-registry\.yaml$/, "registro-assets"],
  [/^content\/creditos\.yaml$/, "creditos"],
  // Fuera del compilador: prompt offline de Lumi (02 §2.6) y archivos versionados a mano (D-159).
  [/^content\/authoring\//, "ignorado"],
  [/^content\/audio-lines\.manifest\.json$/, "ignorado"],
  [/^content\/README\.md$/, "ignorado"],
];

export const tipoDeRuta = (ruta: string): Tipo | null => RUTAS.find(([re]) => re.test(ruta))?.[1] ?? null;

const nombreBase = (ruta: string): string => ruta.slice(ruta.lastIndexOf("/") + 1).replace(/\.(yaml|txt)$/, "");

/** Pasa los issues de zod a hallazgos; en uniones elige la rama con menos problemas (el mensaje útil). */
const issuesAHallazgos = (archivo: string, base: readonly PropertyKey[], issues: readonly z.core.$ZodIssue[]): Hallazgo[] =>
  issues.flatMap((i) => {
    if (i.code === "invalid_union" && i.errors.length > 0) {
      const mejor = [...i.errors].sort((a, b) => a.length - b.length)[0] ?? [];
      return issuesAHallazgos(archivo, [...base, ...i.path], mejor);
    }
    return [{ nivel: "error" as const, archivo, clave: clave([...base, ...i.path]), regla: "esquema", mensaje: i.message }];
  });

const validar = <S extends z.ZodType>(schema: S, archivo: string, data: unknown, h: Hallazgo[]): Infer<S> | null => {
  const r = schema.safeParse(data);
  if (r.success) return r.data as Infer<S>;
  h.push(...issuesAHallazgos(archivo, [], r.error.issues));
  return null;
};

const parsearYaml = (f: ArchivoFuente, h: Hallazgo[]): unknown => {
  const doc = parseDocument(f.texto, { prettyErrors: false, uniqueKeys: true });
  if (doc.errors.length > 0) {
    for (const e of doc.errors) {
      // Sin prettyErrors no hay linePos: la línea sale del offset (1-based).
      const linea = e.linePos?.[0]?.line ?? f.texto.slice(0, e.pos[0]).split("\n").length;
      h.push({ nivel: "error", archivo: f.ruta, clave: linea ? `línea ${linea}` : "", regla: "yaml", mensaje: e.message.split("\n")[0] ?? e.code });
    }
    return undefined;
  }
  return doc.toJS();
};

/** Chequeo id ↔ nombre de archivo para los tipos de un ítem por archivo. */
const idCoincide = (ruta: string, id: string, h: Hallazgo[], campo = "id"): void => {
  if (nombreBase(ruta) !== id) {
    h.push({ nivel: "error", archivo: ruta, clave: campo, regla: "archivo", mensaje: `el id "${id}" no coincide con el nombre del archivo "${nombreBase(ruta)}"` });
  }
};

/** Lee un archivo, lo valida y lo agrega al conjunto (con los ids que define). */
export const agregarArchivo = (c: Conjunto, f: ArchivoFuente, h: Hallazgo[]): void => {
  const tipo = tipoDeRuta(f.ruta);
  if (tipo === null) {
    h.push({ nivel: "error", archivo: f.ruta, clave: "", regla: "archivo", mensaje: "ruta fuera de las rutas canónicas de 03 §4.2.1 (¿typo de carpeta o nombre?)" });
    return;
  }
  if (tipo === "ignorado") return;
  if (tipo === "prompt") {
    c.prompts[nombreBase(f.ruta)] = f.texto;
    return;
  }
  const raw = parsearYaml(f, h);
  if (raw === undefined) return;
  const ids: string[] = [];
  const uno = <T extends { id: string }>(lista: Entrada<T>[], data: T | null): void => {
    if (!data) return;
    idCoincide(f.ruta, data.id, h);
    lista.push({ archivo: f.ruta, base: "", data });
    ids.push(data.id);
  };
  const varios = <T>(lista: Entrada<T>[], items: T[], campo: string, idDe: (t: T) => string): void => {
    items.forEach((data, i) => {
      lista.push({ archivo: f.ruta, base: `${campo}[${i}]`, data });
      ids.push(idDe(data));
    });
  };
  switch (tipo) {
    case "mision": uno(c.misiones, validar(Mision, f.ruta, raw, h)); break;
    case "npc": uno(c.npcs, validar(Npc, f.ruta, raw, h)); break;
    case "pedido": uno(c.pedidos, validar(PedidoTablero, f.ruta, raw, h)); break;
    case "fundacion": uno(c.fundaciones, validar(Fundacion, f.ruta, raw, h)); break;
    case "saber": uno(c.saberes, validar(Saber, f.ruta, raw, h)); break;
    case "diorama": uno(c.dioramas, validar(Diorama, f.ruta, raw, h)); break;
    case "conversacion": uno(c.conversaciones, validar(FichaConversacion, f.ruta, raw, h)); break;
    case "presentaciones": {
      const d = validar(ArchivoPresentaciones, f.ruta, raw, h);
      if (d) varios(c.presentaciones, d.presentaciones, "presentaciones", (p) => p.id);
      break;
    }
    case "sobres": {
      const d = validar(ArchivoSobres, f.ruta, raw, h);
      if (d) varios(c.sobres, d.sobres, "sobres", (s) => s.id);
      break;
    }
    case "pistas": {
      const d = validar(ArchivoPistas, f.ruta, raw, h);
      if (d) varios(c.pistas, d.pistas, "pistas", (p) => p.id);
      break;
    }
    case "lumi": {
      const d = validar(ArchivoLumi, f.ruta, raw, h);
      if (d) varios(c.plantillas, d.plantillas, "plantillas", (p) => p.id);
      break;
    }
    case "glosario": {
      const d = validar(ArchivoGlosario, f.ruta, raw, h);
      if (d) varios(c.glosario, d.entradas, "entradas", (e) => e.id);
      break;
    }
    case "habilidades": {
      const d = validar(ArbolHabilidades, f.ruta, raw, h);
      if (d) {
        varios(c.habilidades, d.habilidades, "habilidades", (x) => x.id);
        c.ramas = d.ramas;
      }
      break;
    }
    case "lugares": {
      const d = validar(ArchivoLugares, f.ruta, raw, h);
      if (d) {
        varios(c.regiones, d.regiones, "regiones", (r) => r.id);
        varios(c.lugares, d.lugares, "lugares", (l) => l.id);
      }
      break;
    }
    case "nivel": {
      const d = validar(TarjetaNivel, f.ruta, raw, h);
      if (d) {
        idCoincide(f.ruta, d.banda, h, "banda");
        c.niveles.push({ archivo: f.ruta, base: "", data: d });
        ids.push(`nivel:${d.banda}`);
      }
      break;
    }
    case "bloqueo": {
      const d = validar(ListaBloqueo, f.ruta, raw, h);
      if (d) {
        idCoincide(f.ruta, d.id, h);
        c.bloqueos.push({ archivo: f.ruta, base: "", data: d });
        ids.push(`bloqueo:${d.id}`);
      }
      break;
    }
    case "temas": c.temas = validar(TemasGlobales, f.ruta, raw, h); break;
    case "contencion": c.contencion = validar(ArchivoContencion, f.ruta, raw, h); break;
    case "retirados": {
      const d = validar(ArchivoRetirados, f.ruta, raw, h);
      if (d) c.retirados = { archivo: f.ruta, base: "", data: d };
      break;
    }
    case "registro-assets": {
      const d = validar(ArchivoRegistroAssets, f.ruta, raw, h);
      if (d) {
        c.registroAssets = { archivo: f.ruta, base: "", data: d };
        ids.push(...d.packs.map((x) => `pack:${x.id}`), ...d.assets.map((x) => `asset:${x.id}`));
      }
      break;
    }
    case "creditos": {
      const d = validar(ArchivoCreditos, f.ruta, raw, h);
      if (d) c.creditos = { archivo: f.ruta, base: "", data: d };
      break;
    }
    case "allowlist": {
      const d = validar(ArchivoAllowlist, f.ruta, raw, h);
      if (d) c.allowlist = { archivo: f.ruta, base: "", data: d };
      break;
    }
  }
  if (ids.length > 0) c.idsPorArchivo.set(f.ruta, ids);
};

/** Ids duplicados entre archivos o dentro de uno (03 §6.1 validación 1). */
export const chequearDuplicados = (c: Conjunto, h: Hallazgo[]): void => {
  const visto = new Map<string, string>();
  for (const [archivo, ids] of c.idsPorArchivo) {
    for (const id of ids) {
      const previo = visto.get(id);
      if (previo) h.push({ nivel: "error", archivo, clave: "id", regla: "id-unico", mensaje: `id "${id}" duplicado (ya definido en ${previo})` });
      else visto.set(id, archivo);
    }
  }
};
