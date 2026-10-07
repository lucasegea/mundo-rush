// Contrato de textura pixel art (D-154, 03 §2.9): `nearest` en min y mag, sin mipmaps, sRGB.
import { DataTexture, NearestFilter, RGBAFormat, SRGBColorSpace, UnsignedByteType } from "three";
import type { PixelImage } from "./pixels";

export function pixelTexture(img: PixelImage): DataTexture {
  const tex = new DataTexture(img.data, img.width, img.height, RGBAFormat, UnsignedByteType);
  tex.magFilter = NearestFilter;
  tex.minFilter = NearestFilter;
  tex.generateMipmaps = false;
  tex.colorSpace = SRGBColorSpace;
  tex.anisotropy = 1;
  tex.needsUpdate = true;
  return tex;
}
