// scripts/assets/png.ts: decodificador de PNG mínimo (plan estetica-c M3) para muestrear por UV la textura de paleta de
// un pack (KayKit trae un atlas de degradé) antes de descartarla. Sin dependencias nuevas: solo zlib de Node. Cubre lo
// que traen los packs: 8 bits por canal, sin entrelazado, en RGB, RGBA, gris, gris con alfa o paleta. El resto falla
// nombrando el formato. `codificarPng` existe para los tests (fixtures con textura). Open-world-3d T7: también 16 bits
// por canal (los PNG 1k de Poly Haven), redondeados a 8 al decodificar.
import { deflateSync, inflateSync } from "node:zlib";

export interface Imagen {
  ancho: number;
  alto: number;
  /** RGBA de 8 bits, fila por fila desde arriba. */
  rgba: Uint8Array;
}

const FIRMA = [137, 80, 78, 71, 13, 10, 26, 10];
/** Canales por tipo de color de PNG. */
const CANALES: Readonly<Record<number, number>> = { 0: 1, 2: 3, 3: 1, 4: 2, 6: 4 };

const TABLA_CRC = Int32Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c;
});
const crc32 = (bytes: Uint8Array): number => {
  let c = -1;
  for (const b of bytes) c = (TABLA_CRC[(c ^ b) & 255] as number) ^ (c >>> 8);
  return (c ^ -1) >>> 0;
};

const paeth = (a: number, b: number, c: number): number => {
  const p = a + b - c;
  const pa = Math.abs(p - a);
  const pb = Math.abs(p - b);
  const pc = Math.abs(p - c);
  return pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
};

export function decodificarPng(datos: Uint8Array): Imagen {
  const b = Buffer.from(datos.buffer, datos.byteOffset, datos.byteLength);
  if (b.length < 8 || FIRMA.some((v, i) => b[i] !== v)) throw new Error("png: no es un PNG (firma)");
  let ancho = 0, alto = 0, bits = 0, tipo = -1, entrelazado = 0;
  let paleta: Uint8Array | null = null;
  const idat: Buffer[] = [];
  for (let o = 8; o + 8 <= b.length;) {
    const largo = b.readUInt32BE(o);
    const nombre = b.toString("latin1", o + 4, o + 8);
    const d = b.subarray(o + 8, o + 8 + largo);
    if (nombre === "IHDR") {
      ancho = d.readUInt32BE(0);
      alto = d.readUInt32BE(4);
      bits = d[8] as number;
      tipo = d[9] as number;
      entrelazado = d[12] as number;
    } else if (nombre === "PLTE") paleta = new Uint8Array(d);
    else if (nombre === "IDAT") idat.push(d);
    else if (nombre === "IEND") break;
    o += 12 + largo;
  }
  const canales = CANALES[tipo];
  if ((bits !== 8 && !(bits === 16 && tipo !== 3)) || canales === undefined || entrelazado !== 0 || (tipo === 3 && !paleta)) {
    throw new Error(`png: formato no soportado (bits ${bits}, tipo de color ${tipo}, entrelazado ${entrelazado})`);
  }
  const crudo = inflateSync(Buffer.concat(idat));
  const bps = bits / 8;
  const bpp = canales * bps;
  const paso = ancho * bpp;
  if (crudo.length < (paso + 1) * alto) throw new Error("png: datos cortos");
  const rgba = new Uint8Array(ancho * alto * 4);
  let previa = new Uint8Array(paso);
  let fila = new Uint8Array(paso);
  for (let y = 0; y < alto; y++) {
    const filtro = crudo[y * (paso + 1)] as number;
    for (let x = 0; x < paso; x++) {
      const a = x >= bpp ? (fila[x - bpp] as number) : 0;
      const arriba = previa[x] as number;
      const c = x >= bpp ? (previa[x - bpp] as number) : 0;
      const v = crudo[y * (paso + 1) + 1 + x] as number;
      const pred = filtro === 1 ? a : filtro === 2 ? arriba : filtro === 3 ? (a + arriba) >> 1 : filtro === 4 ? paeth(a, arriba, c) : 0;
      if (filtro > 4) throw new Error(`png: filtro ${filtro} desconocido`);
      fila[x] = (v + pred) & 255;
    }
    // 16 bits: cada muestra a 8 bits redondeada (alto * 256 + bajo) * 255 / 65535.
    const m = bps === 1 ? fila : Uint8Array.from({ length: ancho * canales }, (_, k) => Math.round((((fila[k * 2] as number) << 8) | (fila[k * 2 + 1] as number)) * 255 / 65535));
    for (let x = 0; x < ancho; x++) {
      const i = (y * ancho + x) * 4;
      const p = x * canales;
      if (tipo === 3) {
        const k = (m[p] as number) * 3;
        rgba.set((paleta as Uint8Array).subarray(k, k + 3), i);
        rgba[i + 3] = 255;
      } else if (canales >= 3) {
        rgba.set(m.subarray(p, p + 3), i);
        rgba[i + 3] = canales === 4 ? (m[p + 3] as number) : 255;
      } else {
        rgba[i] = rgba[i + 1] = rgba[i + 2] = m[p] as number;
        rgba[i + 3] = canales === 2 ? (m[p + 1] as number) : 255;
      }
    }
    [previa, fila] = [fila, previa];
  }
  return { ancho, alto, rgba };
}

/** RGBA de 8 bits → PNG (filtro 0). Para fixtures de tests. */
export function codificarPng(img: Imagen): Uint8Array {
  const paso = img.ancho * 4;
  const crudo = Buffer.alloc((paso + 1) * img.alto);
  for (let y = 0; y < img.alto; y++) Buffer.from(img.rgba.subarray(y * paso, (y + 1) * paso)).copy(crudo, y * (paso + 1) + 1);
  const trozo = (nombre: string, d: Uint8Array): Buffer => {
    const largo = Buffer.alloc(4);
    largo.writeUInt32BE(d.length);
    const cuerpo = Buffer.concat([Buffer.from(nombre, "latin1"), d]);
    const crc = Buffer.alloc(4);
    crc.writeUInt32BE(crc32(cuerpo));
    return Buffer.concat([largo, cuerpo, crc]);
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(img.ancho, 0);
  ihdr.writeUInt32BE(img.alto, 4);
  ihdr[8] = 8;
  ihdr[9] = 6;
  return new Uint8Array(Buffer.concat([Buffer.from(FIRMA), trozo("IHDR", ihdr), trozo("IDAT", deflateSync(crudo)), trozo("IEND", new Uint8Array())]));
}

/** El color sRGB (0 a 1) de la imagen en una UV de glTF (origen arriba a la izquierda, con repetición). */
export function muestrear(img: Imagen, u: number, v: number): [number, number, number] {
  const envolver = (t: number): number => t - Math.floor(t);
  const x = Math.min(img.ancho - 1, Math.floor(envolver(u) * img.ancho));
  const y = Math.min(img.alto - 1, Math.floor(envolver(v) * img.alto));
  const i = (y * img.ancho + x) * 4;
  return [(img.rgba[i] as number) / 255, (img.rgba[i + 1] as number) / 255, (img.rgba[i + 2] as number) / 255];
}
