// Plan estetica-c M5 (D-207): validate:content sobre el formato de la maqueta. Cada regla nueva tiene su fixture que
// falla: el contenido real con una sola línea cambiada, y el error nombra archivo, clave y lo que está mal.
// - un NPC puesto en un diorama sin `apariencia` en su ficha;
// - un tinte que no es token de la paleta (@lg/art), en un prop o en una apariencia;
// - un prop sin constructor por código ni fila en el registro (o con otro prefijo);
// - el estimador de presupuesto corre para cada diorama y falla por encima de `medium` (50k triángulos, 120 llamadas).
import { describe, expect, test } from "vitest";
import { compilarContenido, estimarPresupuestoDiorama, formatearHallazgo } from "@lg/content-schema";
import type { ArchivoFuente, Hallazgo } from "@lg/content-schema";
import { leerContenido } from "./build.ts";
import { fileURLToPath } from "node:url";

const ROOT = fileURLToPath(new URL("../..", import.meta.url));
const REAL = leerContenido(ROOT);
const base = compilarContenido(REAL);
const TEST = "content/dioramas/test.yaml";
const INES = "content/npcs/NPC-INES.yaml";
const REGISTRO = "content/assets-registry.yaml";
const CASA = "- { asset: codigo/casa, pos: [-9, 0, -7], tam: [4, 3, 3] }";
const GALLINERO = "- { asset: modelo/quaternius-farm-buildings/gallinero, pos: [-12.5, 0, 8], tam: [3, 2.3, 2.7] }";
const APARIENCIA_INES = "apariencia: { cuerpo: saco, remera: casa-3, pantalon: pantalon-2, piel: piel-2, pelo: pelo-2, peinado: largo, sombrero: null, cuello: panuelo, escala: 1 }\n";

/** El contenido real con un reemplazo (el texto viejo tiene que estar: si no, el fixture no mide nada). */
const mut = (ruta: string, viejo: string, nuevo: string, archivos: readonly ArchivoFuente[] = REAL): ArchivoFuente[] => {
  const f = archivos.find((a) => a.ruta === ruta);
  if (!f) throw new Error(`no existe ${ruta}`);
  const texto = f.texto.replace(/\r\n/g, "\n");
  if (!texto.includes(viejo)) throw new Error(`"${viejo}" no está en ${ruta}`);
  return archivos.map((a) => (a.ruta === ruta ? { ruta, texto: texto.replace(viejo, nuevo) } : a));
};
const errores = (archivos: readonly ArchivoFuente[]): Hallazgo[] => compilarContenido(archivos).errores;
/** Exige un error en archivo › clave cuyo mensaje cumpla `re`; devuelve el mensaje. */
const conError = (hs: readonly Hallazgo[], archivo: string, clave: string, re: RegExp): string => {
  const hit = hs.find((h) => h.archivo === archivo && h.clave === clave && re.test(h.mensaje));
  expect(hit, `se esperaba ${re} en ${archivo} › ${clave}; hubo:\n${hs.map(formatearHallazgo).join("\n")}`).toBeDefined();
  return hit?.mensaje ?? "";
};

describe("el contenido real en el formato de la maqueta", () => {
  test("compila sin errores; test.yaml no tiene tiles y cada NPC tiene apariencia", () => {
    expect(base.errores.map(formatearHallazgo)).toEqual([]);
    const d = base.conjunto.dioramas.find((x) => x.data.id === "test")?.data;
    expect(d?.tiles ?? []).toEqual([]);
    expect(d?.caminos?.length).toBe(3);
    expect(base.conjunto.npcs.every((n) => n.data.apariencia !== undefined)).toBe(true);
  });

  test("el estimador da para test.yaml 29 llamadas y 49 164 triángulos (dentro de medium; el web lo compara con el grafo)", () => {
    const d = base.conjunto.dioramas.find((x) => x.data.id === "test")?.data;
    if (!d) throw new Error("sin test.yaml");
    const registro = new Map((base.conjunto.registroAssets?.data.assets ?? []).map((a) => [a.id, a]));
    const apariencias = new Map(base.conjunto.npcs.map((n) => [n.data.id, n.data.apariencia]));
    const e = estimarPresupuestoDiorama(d, { registro, apariencias });
    expect(e.faltan).toEqual([]);
    expect(e.total).toEqual({ drawCalls: 29, triangles: 49164 });
    expect(e.partes["terreno"]).toEqual({ drawCalls: 1, triangles: 9672 });
    expect(e.partes["personajes"]).toEqual({ drawCalls: 8, triangles: 3904 + 3818 + 3728 + 3948 });
  });
});

describe("apariencia de los NPCs", () => {
  test("teeth: un NPC del diorama sin apariencia falla nombrando el NPC, el diorama y su ficha", () => {
    const m = conError(errores(mut(INES, APARIENCIA_INES, "")), TEST, "npcs[1].id", /NPC-INES/);
    expect(m).toContain('diorama "test"');
    expect(m).toContain(INES);
  });

  test("teeth: un tinte de apariencia que no es token de la paleta falla en la ficha", () => {
    const hs = errores(mut(INES, "piel: piel-2,", "piel: rosado,"));
    conError(hs, INES, "apariencia.piel", /"rosado" no es un token de la paleta/);
  });

  test("teeth: un cuerpo o un peinado fuera del vocabulario falla", () => {
    conError(errores(mut(INES, "cuerpo: saco,", "cuerpo: gigante,")), INES, "apariencia.cuerpo", /./);
    conError(errores(mut(INES, "peinado: largo,", "peinado: mohicano,")), INES, "apariencia.peinado", /./);
  });
});

describe("props del diorama", () => {
  test("teeth: un tinte de prop que no es token de la paleta falla nombrando el valor", () => {
    conError(errores(mut(TEST, CASA, "- { asset: codigo/casa, pos: [-9, 0, -7], tam: [4, 3, 3], tinte: rojo-fuego }")),
      TEST, "props[0].tinte", /"rojo-fuego" no es un token de la paleta/);
  });

  test("un tinte de la paleta en un prop por código pasa", () => {
    const hs = errores(mut(TEST, CASA, "- { asset: codigo/casa, pos: [-9, 0, -7], tam: [4, 3, 3], tinte: casa-2 }"));
    expect(hs.map(formatearHallazgo)).toEqual([]);
  });

  test("teeth: un prop codigo/* sin constructor falla nombrando el asset", () => {
    conError(errores(mut(TEST, CASA, "- { asset: codigo/molino, pos: [-9, 0, -7], tam: [4, 3, 3] }")),
      TEST, "props[0].asset", /"codigo\/molino" no tiene constructor/);
  });

  test("teeth: un modelo/* sin fila en el registro falla nombrando el asset", () => {
    conError(errores(mut(TEST, GALLINERO, "- { asset: modelo/quaternius-farm-buildings/silo, pos: [-12.5, 0, 8], tam: [3, 2.3, 2.7] }")),
      TEST, "props[6].asset", /"modelo\/quaternius-farm-buildings\/silo" no tiene registro/);
  });

  test("teeth: un asset con otro prefijo falla", () => {
    conError(errores(mut(TEST, CASA, "- { asset: casa, pos: [-9, 0, -7], tam: [4, 3, 3] }")), TEST, "props[0].asset", /ni modelo\/\*/);
  });

  test("teeth: tinte en un modelo/* falla (la pintura del modelo es la del pipeline)", () => {
    conError(errores(mut(TEST, GALLINERO, "- { asset: modelo/quaternius-farm-buildings/gallinero, pos: [-12.5, 0, 8], tam: [3, 2.3, 2.7], tinte: casa-2 }")),
      TEST, "props[6].tinte", /tinte solo vale en props codigo/);
  });

  test("teeth: un prop por código sin tam falla; un prop sin pos ni instancias también", () => {
    conError(errores(mut(TEST, CASA, "- { asset: codigo/casa, pos: [-9, 0, -7] }")), TEST, "props[0].tam", /necesita tam/);
    expect(errores(mut(TEST, CASA, "- { asset: codigo/casa, tam: [4, 3, 3] }")).some((h) => h.archivo === TEST && h.clave.startsWith("props[0]"))).toBe(true);
  });
});

describe("formato", () => {
  test("teeth (M7): `tiles` y `atlas_tiles` en un diorama real fallan en validate:content apuntando al formato de la maqueta", () => {
    const hs = errores(mut(TEST, "spawn: [0.5, 0, 3]\n", "spawn: [0.5, 0, 3]\ntiles: [{ capa: suelo, origen: [-16, -12], filas: [\"1 1\"] }]\n"));
    conError(hs, TEST, "tiles", /`tiles` se retiró con HD-2D .*formato de la maqueta \(plan estetica-c M5\)/);
    const ha = errores(mut(TEST, "spawn: [0.5, 0, 3]\n", "spawn: [0.5, 0, 3]\natlas_tiles: atlas/test\n"));
    conError(ha, TEST, "atlas_tiles", /`atlas_tiles` se retiró con HD-2D .*formato de la maqueta/);
  });

  test("teeth: un río más ancho que 12 m o un detalle de más de 200 piezas no pasan el esquema", () => {
    conError(errores(mut(TEST, "agua:\n", "rio: [{ puntos: [[-16, -11], [16, -11]], ancho: 20 }]\nagua:\n")), TEST, "rio[0].ancho", /./);
    conError(errores(mut(TEST, "cantidad: 5 }\n", "cantidad: 500 }\n")), TEST, "detalle[0].cantidad", /./);
  });
});

describe("presupuesto de medium en validate:content", () => {
  test("teeth: detalle de más pasa los 50k triángulos y falla con el desglose por parte", () => {
    const hs = errores(mut(TEST, "detalle:\n", "detalle:\n  - { tipo: matas, centro: [0, -8], radio: 3, cantidad: 10 }\n"));
    // 10 matas = 1000 triángulos: el margen de test.yaml es 836.
    const m = conError(hs, TEST, "", /presupuesto de medium pasado/);
    expect(m).toContain("50164 triángulos");
    expect(m).toMatch(/detalle 4 llamadas, \d+ triángulos/);
  });

  test("teeth: llamadas de más (props por código de tamaños distintos, uno por llamada) también fallan", () => {
    const cajas = Array.from({ length: 95 }, (_, i) => `  - { asset: codigo/caja, pos: [${-15 + (i % 30)}, 0, ${-11.5 + Math.floor(i / 30) * 0.8}], tam: [0.1, ${(0.1 + i * 0.001).toFixed(3)}, 0.1] }\n`).join("");
    const hs = errores(mut(TEST, "props:\n", `props:\n${cajas}`));
    const m = conError(hs, TEST, "", /presupuesto de medium pasado/);
    expect(m).toMatch(/estimado 124 llamadas/);
  });

  test("plan estetica-c M6 teeth: el mismo chequeo corre por tier; un detalle pesado pasa los 25k de low con su densidad", () => {
    // 200 matas: low conserva una de cada tres (67 × 100 triángulos), más que su margen de 2698 sobre test.yaml.
    const hs = errores(mut(TEST, "detalle:\n", "detalle:\n  - { tipo: matas, centro: [0, -8], radio: 3, cantidad: 200 }\n"));
    const low = conError(hs, TEST, "", /presupuesto de low pasado/);
    expect(low).toContain("60 llamadas, 25000 triángulos");
    expect(low).toMatch(/estimado 29 llamadas, 2[89]\d{3} triángulos/);
    conError(hs, TEST, "", /presupuesto de medium pasado/);
  });

  test("plan estetica-c M6: test.yaml entra en los tres tiers (sin errores de presupuesto)", () => {
    expect(errores(REAL).filter((h) => /presupuesto/.test(h.mensaje))).toEqual([]);
  });

  test("teeth: un modelo sin triángulos medidos en el registro deja el estimado incompleto y falla", () => {
    const hs = errores(mut(REGISTRO, "    triangulos: 948\n", ""));
    conError(hs, TEST, "", /presupuesto sin estimar: modelo\/quaternius-farm-buildings\/gallinero sin triangulos\/primitivas/);
  });
});
