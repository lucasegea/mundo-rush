// F1.2 A1: cada esquema tiene un fixture válido y uno inválido (incluidos fundación, saber, presentación,
// sobre, efectos y sitios). Fixtures en YAML como el contenido real; el paquete no lee disco.
import { readFileSync } from "node:fs";
import { describe, expect, test } from "vitest";
import { parse } from "yaml";
import type { z } from "zod";
import {
  ArbolHabilidades, ArchivoAllowlist, ArchivoGlosario, ArchivoLugares, ArchivoLumi, ArchivoPistas,
  ArchivoPresentaciones, ArchivoRetirados, ArchivoSobres, Diorama, Efecto, Escena, Fundacion, ListaBloqueo,
  Mision, MomentoPronunciacion, Npc, PedidoTablero, Saber, TarjetaNivel, TemasGlobales, ArchivoRegistroAssets, PackAssets,
  PiezaPersonaje, FORMATO_MAQUETA,
} from "../src/index.ts";

const y = (s: string): unknown => parse(s);
const ok = (s: z.ZodType, data: unknown) => expect(s.safeParse(data).error?.issues).toBeUndefined();
const falla = (s: z.ZodType, data: unknown, camino: string) => {
  const r = s.safeParse(data);
  expect(r.success).toBe(false);
  expect(r.error?.issues.map((i) => i.path.join("."))).toContain(camino);
};
const con = (base: unknown, cambios: Record<string, unknown>) => ({ ...(base as object), ...cambios });

const ESCENA = y(`
escena_id: M9.1-E1
npc: NPC-ANA
lugar: cruce.arbol
hora: manana
situacion: "x"
necesidad_npc: "x"
banda: A1
andamiaje_npc: ["repeat slower"]
vocabulario_nivel: [goat]
max_palabras_nuevas_por_turno: 1
hechos_escena: [SAB-X]
apertura_guionada:
  - { quien: NPC-ANA, en: "Hello there, friend.", es_glosa: "Hola." }
ramas:
  - { si: "saluda", quien: NPC-ANA, npc: "Nice to meet you!", tipo: ejemplo_ia }
criterios_exito: [{ id: C1, texto: "saluda", habilidad: HAB-VINC-1 }]
errores_de_objetivo: []
cierre_guionado:
  - { quien: LUMI, plantilla: LUMI-M9.1-CIERRE }
salida_si_no_converge: { no_aplica: "no" }
efectos: [{ fundacion: SITIO-X, estado: fundado }, { intro: NPC-BO }, { flag: lamp_on }]
eventos: []
resumen_para_siguiente: "x"
temas_permitidos: ["goats"]
temas_vedados_extra: []
pronunciacion:
  - { momento_id: M9.1-E1-PRON-1, tipo: par_minimo, linea_ref: "x", texto_esperado: "three", palabra_foco: three,
      par: [three, tree], sonidos: [E5], consecuencia: null, quien_propone: npc, plantilla: null, obligatorio: false }
`);

const MISION = y(`
id: M9.1
titulo: { es-AR: "Prueba" }
capitulo: 9
region: R1
mcer: A1
tipo_tarea: info_gap
can_do: { es-AR: "Puedo probar." }
requiere: [M9.0, HAB-VINC-1, "intro:NPC-ANA"]
meta: "x"
consigue: "x"
red: { altas: [{ npc: NPC-ANA, por: null }], presenta: [] }
fundacion: "x"
saberes: [{ saber: SAB-X, rama: false }]
hechos_verificables: [HV-M9.1-01]
resultado_mundo: "x"
contagio: null
npcs: [NPC-ANA]
lenguaje_objetivo: { funciones: [], estructuras: [], chunks: [], vocabulario: [] }
pre_tarea: { no_aplica: "x" }
beats: ["x"]
escenas: []
lumi_marca: "x"
pociones: [{ rama: ambar, evento: "x", max: 1 }]
desbloqueos: []
repaso: { resurfaces: [], planta: [], reaparece_en: [] }
mundo: []
modo_texto: "x"
duracion_objetivo_min: 2
estado: draft
`);

const NPC = y(`
id: NPC-ANA
nombre: "Ana"
rol: "x"
lugar: cruce.arbol
edad_aparente: "30s"
es_menor: false
personalidad: [calma]
registro: "x"
bandas_mcer: { region_1: "A1", max: B1 }
frases_firma: ["Hi!"]
voz: { descripcion: "x", voice_id: TBD }
representacion: null
sabe: []
no_sabe: []
relaciones: {}
necesidad_arco: "x"
funciones_lengua: [saludar]
postura: null
requiere_presentacion: true
presentado_por: [NPC-BO]
presenta_a: []
hechos_que_puede_decir: [SAB-X]
quien_sabe_mas: {}
pistas_misterio: [CLUE-ANA-1]
timido_hasta: null
persona_prompt: "=== PERSONA: ANA ==="
estado: draft
`);

const SABER = y(`
id: SAB-X
titulo_corto: { es-AR: "x" }
linea_en: "Goats eat weeds."
plantilla: null
linea_sin_dato: "Goats eat."
explicacion_es: "x"
hechos: [{ id: HV-M9.1-01, texto_es: "x", fuente_sugerida: "x", rama: false }]
fuente: "[FUENTE-PENDIENTE: x]"
estado: sin_verificar
dicho_por: NPC-ANA
mision: M9.1
rama: false
ficcion: false
usable_como_argumento: true
`);

const FUNDACION = y(`
id: SITIO-X
nombre: { es-AR: "x", en: "x" }
nombre_corto: "x"
lugar: cruce.arbol
diorama: plaza
estados: { idea: { visual: "x", desde: null }, fundado: { visual: "y", desde: M9.1 } }
propuesta_por: NPC-ANA
se_consigue_hablando: ["x"]
creditos: [NPC-ANA, jugador]
uso_en_mundo: ["x"]
costo: null
estado: draft
`);

describe("A1: esquemas con fixture válido e inválido", () => {
  test("escena (con efectos y pronunciación)", () => {
    ok(Escena, ESCENA);
    falla(Escena, con(ESCENA, { hora: "mediodia" }), "hora");
    falla(Escena, con(ESCENA, { situacion_para_modelo: "x" }), "");
  });
  test("efectos: fundación, intro y flag; nada más", () => {
    ok(Efecto, { fundacion: "SITIO-TABLERO", estado: "fundado" });
    ok(Efecto, { intro: "NPC-NELL" });
    ok(Efecto, { flag: "lamp_bunk_on" });
    expect(Efecto.safeParse({ fundacion: "TABLERO", estado: "fundado" }).success).toBe(false);
    expect(Efecto.safeParse({ fundacion: "SITIO-TABLERO", estado: "comprado" }).success).toBe(false);
    expect(Efecto.safeParse({ flag: "LampOn" }).success).toBe(false);
    expect(Efecto.safeParse({ dinero: 5 }).success).toBe(false);
  });
  test("pronunciación: nunca obligatoria; par solo en par_minimo", () => {
    const m = (ESCENA as { pronunciacion: unknown[] }).pronunciacion[0];
    ok(MomentoPronunciacion, m);
    falla(MomentoPronunciacion, con(m, { obligatorio: true }), "obligatorio");
    falla(MomentoPronunciacion, con(m, { tipo: "repetir" }), "par");
    falla(MomentoPronunciacion, con(m, { sonidos: ["E15"] }), "sonidos.0");
  });
  test("misión", () => {
    ok(Mision, con(MISION, { escenas: [ESCENA] }));
    falla(Mision, con(MISION, { escenas: [] }), "escenas");
    falla(Mision, con(MISION, { escenas: [ESCENA], requiere: ["NELL"] }), "requiere.0");
    falla(Mision, con(MISION, { escenas: [ESCENA], estado: "approved_by_ai" }), "estado");
  });
  test("ficha de NPC: requiere_presentacion coherente con presentado_por", () => {
    ok(Npc, NPC);
    falla(Npc, con(NPC, { presentado_por: [] }), "presentado_por");
    falla(Npc, con(NPC, { requiere_presentacion: false }), "presentado_por");
    falla(Npc, con(NPC, { id: "NPC-Ana" }), "id");
  });
  test("saber: verificado exige fuente real; LUMI exige plantilla", () => {
    ok(Saber, SABER);
    falla(Saber, con(SABER, { estado: "verificado" }), "fuente");
    falla(Saber, con(SABER, { estado: "revisado", fuente: null }), "fuente");
    ok(Saber, con(SABER, { estado: "verificado", fuente: "Extensión agrícola, 2020" }));
    falla(Saber, con(SABER, { dicho_por: "LUMI" }), "dicho_por");
    falla(Saber, con(SABER, { hechos: [] }), "hechos");
  });
  test("fundación: sin costo, créditos de al menos dos", () => {
    ok(Fundacion, FUNDACION);
    falla(Fundacion, con(FUNDACION, { costo: 10 }), "costo");
    falla(Fundacion, con(FUNDACION, { creditos: ["jugador"] }), "creditos");
    falla(Fundacion, con(FUNDACION, { estados: {} }), "estados");
  });
  test("presentación (arista de la red)", () => {
    const p = y(`presentaciones:
  - { id: INTRO-ANA-BO, npc: NPC-ANA, presentado_por: NPC-BO, mision: M9.1, linea_presentador_en: "Ana knows.",
      linea_reconocimiento_en: null, caminos_alternativos: [], bicho_de_luz: true }`);
    ok(ArchivoPresentaciones, p);
    const mal = { presentaciones: [con((p as { presentaciones: unknown[] }).presentaciones[0], { presentado_por: "Bo" })] };
    falla(ArchivoPresentaciones, mal, "presentaciones.0.presentado_por");
  });
  test("sobre y pistas", () => {
    const s = y(`sobres:
  - id: SOBRE-0
    aparece: { lugar: campos.albergue_cucheta, momento: "x", tras: null }
    texto_en: "Plant me."
    glosa_es: "x"
    lectura_en_voz_alta: true
    banda_lectura: A0
    contiene: "x"
    apunta_a: "x"
    estado: draft`);
    ok(ArchivoSobres, s);
    falla(ArchivoSobres, { sobres: [con((s as { sobres: unknown[] }).sobres[0], { id: "NOTA-0" })] }, "sobres.0.id");
    const p = y(`pistas:
  - { id: CLUE-ANA-1, npc: NPC-ANA, disparador: "x", linea_en: "Not mine!", glosa_es: "x", banda: A1, acotacion: null,
      requiere: null, abre: "x", verdad_oculta: null, estado: draft }`);
    ok(ArchivoPistas, p);
    falla(ArchivoPistas, { pistas: [con((p as { pistas: unknown[] }).pistas[0], { requiere: "VINC-2" })] }, "pistas.0.requiere");
  });
  test("diorama con anclas sitios:", () => {
    const d = y(`id: plaza
bounds: { minX: 0, maxX: 10, minZ: 0, maxZ: 10 }
sitios:
  - { id: SITIO-X, pos: [1, 0, 2], ocupa: [[1, 2]], caminable_en: [fundado] }`);
    ok(Diorama, d);
    falla(Diorama, con(d, { sitios: [{ id: "SITIO-X", pos: [1, 2] }] }), "sitios.0.pos");
    falla(Diorama, con(d, { id: "faro" }), "id");
  });
  test("plan estetica-c M7: `tiles` y `atlas_tiles` se rechazan con un mensaje que apunta al formato de la maqueta", () => {
    const d = y(`id: plaza
bounds: { minX: 0, maxX: 10, minZ: 0, maxZ: 10 }`);
    ok(Diorama, d);
    for (const [clave, valor] of [["tiles", []], ["tiles", [{ capa: "suelo", origen: [0, 0], filas: ["1 1"] }]], ["atlas_tiles", "atlas/test"]] as const) {
      const r = Diorama.safeParse(con(d, { [clave]: valor }));
      expect(r.success, clave).toBe(false);
      const issue = r.error?.issues.find((i) => i.path.join(".") === clave);
      expect(issue?.message, clave).toContain(`\`${clave}\` se retiró con HD-2D`);
      expect(issue?.message, clave).toContain(FORMATO_MAQUETA);
      expect(issue?.message, clave).toMatch(/plan estetica-c M5/);
    }
  });
  test("lugares y regiones", () => {
    const l = y(`regiones:
  - { id: R1, nombre: { es-AR: "x" }, dioramas: [muelle], capitulos: [0, 1], elenco: [NPC-ANA], saberes: [SAB-X] }
lugares:
  - { id: cruce.arbol, nombre: { es-AR: "x" }, en: null, region: R1, diorama: plaza, publico: true, descripcion: "x" }`);
    ok(ArchivoLugares, l);
    falla(ArchivoLugares, con(l, { lugares: [{ id: "arbol" }] }), "lugares.0.id");
  });
  test("plantillas de Lumi: slots declarados = slots del texto", () => {
    const base = { id: "LUMI-X-01", funcion: "cierre_mision", escalon: null, modos: ["accompanied"], bandas: ["A0"], tipo_error: null,
      texto: "Bien, {nombre_jugador}.", slots: ["nombre_jugador"], audio: "al_vuelo", mision: null, saber: null, nota: null, estado: "draft" };
    const r = ArchivoLumi.safeParse({ idioma_l1: "es-AR", plantillas: [base] });
    expect(r.error?.issues).toBeUndefined();
    falla(ArchivoLumi, { idioma_l1: "es-AR", plantillas: [{ ...base, slots: [] }] }, "plantillas.0.slots");
    falla(ArchivoLumi, { idioma_l1: "es-AR", plantillas: [{ ...base, audio: "fijo" }] }, "plantillas.0.audio");
    falla(ArchivoLumi, { idioma_l1: "es-AR", plantillas: [{ ...base, funcion: "senal" }] }, "plantillas.0.escalon");
  });
  test("glosario: estados de revisión; nada fuera de draft|reviewed|approved", () => {
    const g = y(`l2: en
l1: es-AR
entradas:
  - { id: gl.goat.n, en: goat, pos: n, traducciones: { es-AR: { texto: cabra, notas: null } }, cefr: A1,
      usado_en: [M0.3], estado: draft, revision: { rol: "revisor", fecha: null } }`);
    ok(ArchivoGlosario, g);
    const e = (g as { entradas: unknown[] }).entradas[0];
    falla(ArchivoGlosario, con(g, { entradas: [con(e, { estado: "verificado" })] }), "entradas.0.estado");
    falla(ArchivoGlosario, con(g, { entradas: [con(e, { id: "goat" })] }), "entradas.0.id");
  });
  test("árbol de habilidades: 6 ramas", () => {
    const ramas = ["ambar", "verde", "azul", "violeta", "coral", "celeste"].map((id) => ({ id, nombre: id, color: id, demuestra: "x" }));
    const a = { ramas, habilidades: [{ id: "HAB-VINC-1", nombre: "x", pociones: [{ rama: "ambar", cantidad: 2 }], requiere: null, habilita: "x" }] };
    ok(ArbolHabilidades, a);
    falla(ArbolHabilidades, { ...a, ramas: ramas.slice(0, 5) }, "ramas");
    falla(ArbolHabilidades, { ...a, habilidades: [{ ...a.habilidades[0], id: "VINC-1" }] }, "habilidades.0.id");
  });
  test("tarjeta de nivel", () => {
    const t = y(`banda: A1
palabras_por_oracion: { min: 4, max: 10 }
oraciones_por_turno: { min: 1, max: 2, nota: "x" }
estructuras: "Presente simple"
preguntas: "Wh- simples"
palabras_nuevas_por_turno: "1"
velocidad_default: "x"
ejemplo_tarjeta: null`);
    ok(TarjetaNivel, t);
    falla(TarjetaNivel, con(t, { banda: "C2" }), "banda");
  });
  test("control: temas, bloqueo, retirados, allowlist", () => {
    ok(TemasGlobales, { fuente: "x", vedados: ["money"] });
    const b = { id: "dinero", regla: "dinero", fuente: "x", aplica_a: "npc", sin_mayusculas: true, terminos: ["money"] };
    ok(ListaBloqueo, b);
    falla(ListaBloqueo, { ...b, terminos: [] }, "terminos");
    falla(ListaBloqueo, { ...b, regla: "otra" }, "regla");
    ok(ArchivoRetirados, { fuente: "x", filas: [{ grupo: "g", tipo: "id", retirado: ["NPC-ROSA"], testea: "si", nota: null }] });
    falla(ArchivoRetirados, { fuente: "x", filas: [{ grupo: "g", tipo: "id", retirado: ["NPC-ROSA"], testea: true, nota: null }] }, "filas.0.testea");
    ok(ArchivoAllowlist, { longitud: [] });
    falla(ArchivoAllowlist, { longitud: [{ linea: "x" }] }, "longitud.0.mision");
  });
  test("pedido del tablero: plantilla de 01 §3.7", () => {
    const p = { id: "P-R1.1", plantilla: "recado", npcs: ["NPC-ANA"], requiere: [], papelito_tablero: { en: "Help!", es_glosa: "x" },
      objetivo: "x", criterio: "x", slots_repaso: 2, red: null, fundacion: null, saberes: [], escenas: [ESCENA], estado: "draft" };
    ok(PedidoTablero, p);
    falla(PedidoTablero, { ...p, plantilla: "compra" }, "plantilla");
  });
});

describe("plan estetica-c M6: los tokens de `pintura` del registro son tokens de la paleta (el M2 SEAM cerrado)", () => {
  const registro = y(readFileSync(new URL("../../../content/assets-registry.yaml", import.meta.url), "utf8")) as {
    packs: Record<string, unknown>[];
    assets: { personaje?: { tipo: string; pintura?: Record<string, unknown>[] } }[];
  };

  test("el registro real valida", () => {
    ok(ArchivoRegistroAssets, registro);
  });

  test("teeth: un token de pintura de pack que no es de la paleta falla en validate:content, nombrando el material", () => {
    const pack = registro.packs.find((p) => p.pintura !== undefined) as Record<string, unknown>;
    expect(pack).toBeDefined();
    ok(PackAssets, pack);
    falla(PackAssets, { ...pack, pintura: { White: "rojo-que-no-existe" } }, "pintura.White");
  });

  test("teeth: una regla de pintura de cuerpo con un token fuera de la paleta falla", () => {
    const cuerpo = registro.assets.find((a) => a.personaje?.tipo === "cuerpo")?.personaje as { pintura: Record<string, unknown>[] };
    expect(cuerpo).toBeDefined();
    ok(PiezaPersonaje, cuerpo);
    const malo = { ...cuerpo, pintura: [{ ...cuerpo.pintura[0], token: "verde-fluo", ropa: undefined }] };
    falla(PiezaPersonaje, malo, "pintura.0.token");
  });

  test("simplificar (cuerpo reducido de low) es una razón entre 0 y 1", () => {
    const cuerpo = registro.assets.find((a) => a.personaje?.tipo === "cuerpo")?.personaje as object;
    ok(PiezaPersonaje, { ...cuerpo, simplificar: 0.4 });
    falla(PiezaPersonaje, { ...cuerpo, simplificar: 1 }, "simplificar");
    falla(PiezaPersonaje, { ...cuerpo, simplificar: 0 }, "simplificar");
  });
});
