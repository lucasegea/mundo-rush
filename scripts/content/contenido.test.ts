// F1.2 A2-A9 y A11 sobre el contenido real (content/) y copias rotas en memoria o en un directorio temporal.
// Cada lint tiene un fixture que falla: el contenido real con una sola línea cambiada.
import { execFileSync } from "node:child_process";
import { cpSync, existsSync, mkdtempSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterAll, describe, expect, test } from "vitest";
import { parse } from "yaml";
import {
  buscarRetirados, compilarContenido, compilarIncremental, filtrarGlosario, filtrarSaberes, formatearHallazgo,
} from "@lg/content-schema";
import type { ArchivoFuente, EntradaGlosario, Hallazgo, Saber } from "@lg/content-schema";
import { construir, crearCompiladorIncremental, leerContenido, SALIDA_CLIENTE, SALIDA_SERVIDOR } from "./build.ts";

const ROOT = fileURLToPath(new URL("../..", import.meta.url));
const REAL = leerContenido(ROOT);
const base = compilarContenido(REAL);

/** El contenido real con un reemplazo en un archivo (el texto viejo tiene que estar, si no el fixture no mide nada). */
const mut = (ruta: string, viejo: string, nuevo: string, archivos: readonly ArchivoFuente[] = REAL): ArchivoFuente[] => {
  const f = archivos.find((a) => a.ruta === ruta);
  if (!f) throw new Error(`no existe ${ruta}`);
  if (!f.texto.includes(viejo)) throw new Error(`"${viejo}" no está en ${ruta}`);
  return archivos.map((a) => (a.ruta === ruta ? { ruta, texto: a.texto.replace(viejo, nuevo) } : a));
};
const errores = (archivos: readonly ArchivoFuente[]): Hallazgo[] => compilarContenido(archivos).errores;
const conError = (hs: readonly Hallazgo[], archivo: string, clave: string, regla?: string): void => {
  const hit = hs.some((h) => h.archivo === archivo && h.clave === clave && (regla === undefined || h.regla === regla));
  expect(hit, `se esperaba ${regla ?? "error"} en ${archivo} › ${clave}; hubo:\n${hs.map(formatearHallazgo).join("\n")}`).toBe(true);
};

const temporales: string[] = [];
const copiaTemporal = (): string => {
  const dir = mkdtempSync(join(tmpdir(), "lg-f12-"));
  temporales.push(dir);
  cpSync(join(ROOT, "content"), join(dir, "content"), { recursive: true });
  return dir;
};
afterAll(() => { for (const d of temporales) rmSync(d, { recursive: true, force: true }); });

describe("contenido real", () => {
  test("compila sin errores y mide algo (falla en 0 medido)", () => {
    expect(base.errores.map(formatearHallazgo)).toEqual([]);
    expect(base.salida).not.toBeNull();
    expect(base.conjunto.misiones.length).toBeGreaterThan(0);
    expect(base.conjunto.bloqueos.length).toBe(8); // F4.2: + riesgo e inapropiado (03 §7.7)
    expect(base.conjunto.niveles.length).toBeGreaterThan(0);
  });
});

describe("A2: una referencia rota falla nombrando archivo y clave", () => {
  test("misión → NPC inexistente", () => {
    conError(errores(mut("content/missions/M0.1.yaml", "    npc: NPC-INES\n", "    npc: NPC-NADIE\n")),
      "content/missions/M0.1.yaml", "escenas[0].npc", "referencia");
  });
  test("efecto → SITIO-* inexistente", () => {
    conError(errores(mut("content/missions/M1.1.yaml", "fundacion: SITIO-TABLERO, estado", "fundacion: SITIO-FALTA, estado")),
      "content/missions/M1.1.yaml", "escenas[0].efectos[0].fundacion", "referencia");
  });
  test("escena → lugar, criterio → HAB-*, misión → SAB-*", () => {
    conError(errores(mut("content/missions/M0.3.yaml", "lugar: cruce.arbol", "lugar: cruce.luna")),
      "content/missions/M0.3.yaml", "escenas[0].lugar", "referencia");
    conError(errores(mut("content/missions/M1.2.yaml", "habilidad: HAB-DESC-1 }", "habilidad: HAB-DESC-9 }")),
      "content/missions/M1.2.yaml", "escenas[1].criterios_exito[0].habilidad", "referencia");
    conError(errores(mut("content/missions/M0.2.yaml", "saberes: [{ saber: SAB-CORN", "saberes: [{ saber: SAB-MAIZ")),
      "content/missions/M0.2.yaml", "saberes[0].saber", "referencia");
  });
  test("YAML roto: archivo y línea", () => {
    const hs = errores(mut("content/missions/M0.1.yaml", "id: M0.1\n", "id: [M0.1\n"));
    expect(hs.some((h) => h.archivo === "content/missions/M0.1.yaml" && /línea \d+/.test(h.clave))).toBe(true);
  });
});

/** Las filas de la tabla de 02 §0.5.1, leídas del documento (fuente única). */
const filasDe02 = () => {
  const doc = readFileSync(join(ROOT, "docs/02-narrativa-guion.md"), "utf8");
  const ini = doc.indexOf("#### 0.5.1");
  const fin = doc.indexOf("**No se retira**", ini);
  return doc.slice(ini, fin).split("\n")
    .filter((l) => l.startsWith("| ") && !l.startsWith("| Grupo") && !l.startsWith("|---"))
    .map((l) => {
      const [grupo, celda, testea] = l.split("|").slice(1, 4).map((s) => s.trim());
      const retirado = (celda ?? "").replace(/\s*\([^)]*\)/g, "").split(",").map((s) => s.replace(/`/g, "").trim()).filter(Boolean);
      return { grupo, retirado, testea };
    });
};

describe("A3: conjuntos exactos y lo retirado", () => {
  test("misiones y NPCs exactos", () => {
    expect(base.conjunto.misiones.map((m) => m.data.id).sort()).toEqual(["M0.1", "M0.2", "M0.3", "M1.1", "M1.2", "M9.1"]);
    expect(base.conjunto.npcs.map((n) => n.data.id).sort()).toEqual(["NPC-HARLAN", "NPC-INES", "NPC-KOFI", "NPC-MAYA", "NPC-NELL", "NPC-OLLIE"]);
  });
  test("content/retired-ids.yaml = las filas de 02 §0.5.1", () => {
    const filas = filasDe02();
    expect(filas.length).toBe(12);
    const archivo = parse(readFileSync(join(ROOT, "content/retired-ids.yaml"), "utf8")) as { filas: { grupo: string; retirado: string[]; testea: string }[] };
    expect(archivo.filas.map(({ grupo, retirado, testea }) => ({ grupo, retirado, testea }))).toEqual(filas);
  });
  test("ningún id, nombre o término con testea: si aparece en content/", () => {
    const filas = base.conjunto.retirados?.data.filas ?? [];
    expect(filas.filter((f) => f.testea === "si").length).toBeGreaterThan(0);
    expect(buscarRetirados(filas, REAL).map(formatearHallazgo)).toEqual([]);
  });
  test("la búsqueda encuentra lo retirado, con archivo y clave (ids/nombres con mayúsculas, términos sin)", () => {
    const filas = base.conjunto.retirados?.data.filas ?? [];
    const hs = buscarRetirados(filas, mut("content/missions/M0.1.yaml", 'en: "And a map."', 'en: "And a LANTERN."'));
    conError(hs, "content/missions/M0.1.yaml", "escenas[0].cierre_guionado[2].en");
    const nombre = buscarRetirados(filas, mut("content/npcs/NPC-KOFI.yaml", 'nombre: "Kofi Mensah"', 'nombre: "Biscuit"'));
    conError(nombre, "content/npcs/NPC-KOFI.yaml", "nombre");
    // "biscuit" en minúscula no es el nombre retirado (límite de palabra respetando mayúsculas)
    expect(buscarRetirados(filas, mut("content/npcs/NPC-KOFI.yaml", 'nombre: "Kofi Mensah"', 'nombre: "a biscuit"'))).toEqual([]);
    // testea: no (Rosa, Hill) no entra al test automático
    expect(buscarRetirados(filas, mut("content/npcs/NPC-KOFI.yaml", 'nombre: "Kofi Mensah"', 'nombre: "Rosa Hill"'))).toEqual([]);
  });
});

describe("A4: red de presentaciones", () => {
  test("todo NPC con requiere_presentacion se alcanza desde el inicio", () => {
    const requieren = base.conjunto.npcs.filter((n) => n.data.requiere_presentacion).map((n) => n.data.id);
    expect(requieren.sort()).toEqual(["NPC-NELL", "NPC-OLLIE"]);
    expect(base.errores.filter((h) => h.regla === "red")).toEqual([]);
  });
  test("sin la arista Maya → Nell, Nell y Ollie quedan inalcanzables", () => {
    const sinArista = mut("content/red/presentaciones.yaml", "    presentado_por: NPC-MAYA\n", "    presentado_por: NPC-OLLIE\n");
    const hs = errores(sinArista);
    conError(hs, "content/npcs/NPC-NELL.yaml", "requiere_presentacion", "red");
    conError(hs, "content/npcs/NPC-OLLIE.yaml", "requiere_presentacion", "red");
  });
});

describe("A5: saberes", () => {
  test("cada SAB-* tiene linea_sin_dato, ≥1 HV-* y está sin_verificar; el glosario está todo en draft", () => {
    const saberes = base.conjunto.saberes.map((s) => s.data);
    expect(saberes.map((s) => s.id).sort()).toEqual(["SAB-AVIONETA", "SAB-CABRAS", "SAB-CORN", "SAB-ESCUELA-RURAL", "SAB-MATE", "SAB-PUPILAS"]);
    for (const s of saberes) {
      expect(s.linea_sin_dato.length, s.id).toBeGreaterThan(0);
      expect(s.hechos.length, s.id).toBeGreaterThanOrEqual(1);
      expect(s.estado, s.id).toBe("sin_verificar");
    }
    const glosario = base.conjunto.glosario.map((g) => g.data);
    expect(glosario.length).toBeGreaterThan(0);
    expect(glosario.filter((e) => e.estado !== "draft")).toEqual([]);
  });
  test("una ficha verificada sin fuente real falla", () => {
    conError(errores(mut("content/saberes/SAB-CORN.yaml", "estado: sin_verificar", "estado: verificado")),
      "content/saberes/SAB-CORN.yaml", "fuente", "esquema");
  });
});

describe("A6: lints de texto, un fixture que falla por lint", () => {
  const M01 = "content/missions/M0.1.yaml";
  const VOS = 'en: "And you?"';
  const CLAVE = "escenas[0].apertura_guionada[3].en";
  test("apelativos (dear, honey…)", () => conError(errores(mut(M01, VOS, 'en: "And you, honey?"')), M01, CLAVE, "apelativos"));
  test("corrección explícita", () => conError(errores(mut(M01, VOS, 'en: "Wrong. And you?"')), M01, CLAVE, "correccion_explicita"));
  test("dinero", () => conError(errores(mut(M01, VOS, 'en: "Money? And you?"')), M01, CLAVE, "dinero"));
  test("salud solo en boca de NPC-GRACE (D-176)", () => {
    conError(errores(mut(M01, VOS, 'en: "Sick? And you?"')), M01, CLAVE, "salud");
    const grace = mut(M01, `{ quien: NPC-INES, ${VOS}`, `{ quien: NPC-GRACE, en: "Sick? And you?"`);
    expect(errores(grace).filter((h) => h.regla === "salud")).toEqual([]);
  });
  test("nombres reales (principios activos)", () => conError(errores(mut(M01, VOS, 'en: "Glyphosate. And you?"')), M01, CLAVE, "nombres_reales"));
  test("cifras: dígitos, porcentajes y unidades; las cantidades de la escena pasan", () => {
    conError(errores(mut(M01, VOS, 'en: "Ten percent? And you?"')), M01, CLAVE, "cifras");
    conError(errores(mut(M01, VOS, 'en: "It is 50 meters away."')), M01, CLAVE, "cifras");
    conError(errores(mut(M01, VOS, 'en: "Here are 3 bags of seeds."')), M01, CLAVE, "cifras");
    const conLista = mut(M01, "    temas_vedados_extra: []\n", '    temas_vedados_extra: []\n    cifras_permitidas: ["3 bags of seeds"]\n',
      mut(M01, VOS, 'en: "Here are 3 bags of seeds."'));
    expect(errores(conLista).filter((h) => h.regla === "cifras")).toEqual([]);
  });
  test("Lumi: palabras vedadas en sus textos (02 §2.2)", () => {
    const hs = errores(mut("content/companion/lumi.es-AR.yaml", "Eso va al frasco ámbar", "Excelente, va al frasco ámbar"));
    expect(hs.some((h) => h.archivo === "content/companion/lumi.es-AR.yaml" && h.regla === "lumi" && /^plantillas\[\d+\]\.texto$/.test(h.clave))).toBe(true);
  });
  test("\"Dear\" solo como encabezado de carta en una escena de modo escritura", () => {
    const carta = mut(M01, VOS, 'en: "Dear Nell, hello!"');
    conError(errores(carta), M01, CLAVE, "apelativos");
    const escritura = mut(M01, "    temas_vedados_extra: []\n", "    temas_vedados_extra: []\n    modo_escritura: true\n", carta);
    expect(errores(escritura).filter((h) => h.regla === "apelativos")).toEqual([]);
  });
  test("longitud: una oración sobre el tope de la banda falla; la allowlist la exime; una excepción vieja falla", () => {
    const M11 = "content/missions/M1.1.yaml";
    const larga = mut(M11, 'en: "Good morning!"', 'en: "Good morning to you and to all of the good people here today!"');
    conError(errores(larga), M11, "escenas[0].apertura_guionada[0].en", "longitud");
    const exenta = mut("content/lint-allowlist.yaml", "longitud: []", 'longitud:\n  - { linea: "M1.1-E1.apertura.0", mision: M1.1, motivo: "fixture" }', larga);
    expect(errores(exenta).filter((h) => h.regla === "longitud")).toEqual([]);
    const vieja = mut("content/lint-allowlist.yaml", "longitud: []", 'longitud:\n  - { linea: "M1.1-E1.apertura.0", mision: M1.1, motivo: "fixture" }');
    conError(errores(vieja), "content/lint-allowlist.yaml", "longitud[0].linea", "longitud");
  });
  test("frases_firma de un NPC y citas de uso_en_mundo también pasan por los lints", () => {
    const KOFI = "content/npcs/NPC-KOFI.yaml";
    conError(errores(mut(KOFI, '"Hey, friend!"', '"Hey, honey!"')), KOFI, "frases_firma[0]", "apelativos");
    conError(errores(mut(KOFI, '"Hey, friend!"', '"Hey, friend! Here are all of my good friends from the old farm today!"')),
      KOFI, "frases_firma[0]", "longitud");
    const PARADA = "content/fundaciones/SITIO-PARADA.yaml";
    conError(errores(mut(PARADA, "Now somebody waits", "Money! Now somebody waits")), PARADA, "uso_en_mundo[0]", "dinero");
  });
  test("interjecciones cortas (Hi!, Oh!, Clover!) no cuentan como oraciones bajo el mínimo", () => {
    const avisos = base.hallazgos.filter((h) => h.regla === "longitud" && /oración de [12] palabras/.test(h.mensaje));
    expect(avisos).toEqual([]);
  });
});

describe("A7: filtros por modo", () => {
  const g = (estado: EntradaGlosario["estado"]) => ({ id: `gl.${estado}.n`, estado }) as EntradaGlosario;
  const s = (estado: Saber["estado"]) => ({ id: `SAB-${estado.toUpperCase()}`, estado }) as Saber;
  const G = [g("draft"), g("reviewed"), g("approved")];
  const S = [s("sin_verificar"), s("verificado"), s("revisado")];
  test("glosario: release = approved; fv = approved + reviewed; nunca draft fuera de dev (D-128)", () => {
    expect(filtrarGlosario(G, "release").map((e) => e.estado)).toEqual(["approved"]);
    expect(filtrarGlosario(G, "fv").map((e) => e.estado)).toEqual(["reviewed", "approved"]);
    expect(filtrarGlosario(G, "dev").length).toBe(3);
  });
  test("saberes: release = verificado + revisado (D-170)", () => {
    expect(filtrarSaberes(S, "release").map((x) => x.estado)).toEqual(["verificado", "revisado"]);
    expect(filtrarSaberes(S, "dev").length).toBe(3);
  });
  test("el build de release del contenido real no lleva glosario draft ni saberes sin verificar", () => {
    const r = compilarContenido(REAL, "release");
    const cliente = r.salida?.cliente ?? {};
    expect(cliente["glosario.json"]).toEqual([]);
    expect(cliente["saberes.json"]).toEqual([]);
  });
});

/** Todos los .json de un directorio, concatenados. */
const leerSalida = (dir: string): string => readdirSync(dir).map((f) => readFileSync(join(dir, f), "utf8")).join("\n");

describe("A8 + A11: build real sobre una copia temporal", () => {
  test("escribe los dos árboles; el cliente no lleva prompts, personas ni tarjetas de nivel", () => {
    const dir = copiaTemporal();
    const log: string[] = [];
    expect(construir({ root: dir, modo: "dev", log: (x) => log.push(x) })).toBe(0);
    expect(readdirSync(join(dir, SALIDA_SERVIDOR))).toContain("prompts.json");
    const cliente = leerSalida(join(dir, SALIDA_CLIENTE));
    expect(cliente.length).toBeGreaterThan(1000);
    const prohibido: string[] = [];
    const base_ = readFileSync(join(ROOT, "content/prompts/npc-base.txt"), "utf8");
    prohibido.push(...base_.split("\n").map((l) => l.trim()).filter((l) => l.length > 30));
    for (const n of base.conjunto.npcs) prohibido.push(...n.data.persona_prompt.split("\n").map((l) => l.trim()).filter((l) => l.length > 30));
    for (const t of base.conjunto.niveles) {
      if (t.data.ejemplo_tarjeta) prohibido.push(...t.data.ejemplo_tarjeta.texto.split("\n").map((l) => l.trim()).filter((l) => l.length > 30));
      prohibido.push(t.data.estructuras);
    }
    for (const p of base.conjunto.pistas) if (p.data.verdad_oculta) prohibido.push(p.data.verdad_oculta);
    expect(prohibido.length).toBeGreaterThan(50);
    const filtrado = prohibido.filter((t) => cliente.includes(JSON.stringify(t).slice(1, -1)));
    expect(filtrado).toEqual([]);
    for (const clave of ["persona_prompt", "es_glosa", "situacion", "verdad_oculta", "andamiaje_npc", "criterios_exito", "palabras_por_oracion"]) {
      expect(cliente.includes(`"${clave}"`), clave).toBe(false);
    }
  });
  test("las dos salidas están ignoradas por git (D-159)", () => {
    for (const ruta of [`${SALIDA_CLIENTE}/misiones.json`, `${SALIDA_SERVIDOR}/prompts.json`]) {
      expect(() => execFileSync("git", ["check-ignore", "-q", ruta], { cwd: ROOT })).not.toThrow();
    }
  });
  test("una misión rota en una copia temporal falla nombrando archivo y clave, y no escribe nada", () => {
    const dir = copiaTemporal();
    const ruta = join(dir, "content/missions/M0.3.yaml");
    writeFileSync(ruta, readFileSync(ruta, "utf8").replace("    npc: NPC-MAYA\n", "    npc: NPC-NADIE\n"));
    const log: string[] = [];
    expect(construir({ root: dir, modo: "dev", log: (x) => log.push(x) })).toBe(1);
    expect(log.some((l) => l.startsWith("ERROR content/missions/M0.3.yaml › escenas[0].npc"))).toBe(true);
    expect(existsSync(join(dir, SALIDA_CLIENTE))).toBe(false);
    expect(existsSync(join(dir, SALIDA_SERVIDOR))).toBe(false);
  });
});

describe("A9: compilación incremental", () => {
  test("pura: devuelve los ids tocados y sin salida si hay error", () => {
    const bien = compilarIncremental(REAL, [{ ruta: "content/missions/M0.2.yaml", texto: REAL.find((a) => a.ruta === "content/missions/M0.2.yaml")?.texto ?? "" }]);
    expect(bien.errores).toEqual([]);
    expect(bien.tocados).toEqual(expect.arrayContaining(["M0.2", "M0.2-E1"]));
    const mal = compilarIncremental(REAL, [{ ruta: "content/saberes/SAB-CORN.yaml", texto: null }]);
    expect(mal.tocados).toContain("SAB-CORN");
    expect(mal.salida).toBeNull();
    expect(mal.errores.length).toBeGreaterThan(0);
  });
  test("en disco: un cambio válido reescribe; uno roto no escribe nada", () => {
    const dir = copiaTemporal();
    expect(construir({ root: dir, modo: "dev", log: () => undefined })).toBe(0);
    const inc = crearCompiladorIncremental(dir);
    const ruta = "content/missions/M1.1.yaml";
    const abs = join(dir, ruta);
    writeFileSync(abs, readFileSync(abs, "utf8").replace("duracion_objetivo_min: 3", "duracion_objetivo_min: 4"));
    const r1 = inc.actualizar([ruta]);
    expect(r1).toMatchObject({ escrito: true, errores: [] });
    expect(r1.tocados).toEqual(expect.arrayContaining(["M1.1", "M1.1-E1"]));
    const salida = join(dir, SALIDA_SERVIDOR, "misiones.json");
    const antes = { texto: readFileSync(salida, "utf8"), mtime: statSync(salida).mtimeMs };
    expect(antes.texto).toContain('"duracion_objetivo_min": 4');
    writeFileSync(abs, readFileSync(abs, "utf8").replace("    npc: NPC-NELL\n", "    npc: NPC-NADIE\n"));
    const r2 = inc.actualizar([ruta]);
    expect(r2.escrito).toBe(false);
    conError(r2.errores, ruta, "escenas[0].npc", "referencia");
    expect(readFileSync(salida, "utf8")).toBe(antes.texto);
    expect(statSync(salida).mtimeMs).toBe(antes.mtime);
  });
});
