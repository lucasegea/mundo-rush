# Licencias de assets — F0.2 HD-2D spike

Regla (A5): todo archivo dentro de `public/` debe figurar en la tabla de abajo con su ruta entre comillas invertidas (por ejemplo `public/<ruta>`). `npm run check:licenses` falla si alguno falta.

## Archivos en `public/`

Ninguno. El spike no descarga ni incluye assets (D-029, D-153: no hay pack del operador en `assets-src/`).

| Archivo | Licencia | Autor | Origen | Atribución |
|---|---|---|---|---|
| — | — | — | — | — |

## Placeholders generados por código

No son archivos: se dibujan en un `<canvas>` al arrancar y se suben a la GPU. Autor: el propio código del spike; sin licencia de terceros.

| Asset | Generado en | Descripción |
|---|---|---|
| Atlas de tiles (128×128, celdas de 32 px) | `src/lib/art.ts` → `drawTileAtlas` | Pasto, pasto oscuro, tierra, surco, agua, piedra, arena; detalles con fondo transparente (flores, mata, piedra, brote). Cuadros de color con borde de 1 px y ruido determinista. |
| 8 hojas de sprites (128×192, celdas de 32×48 px) | `src/lib/art.ts` → `drawSpriteSheet` + `PALETTES` | 4 direcciones × (idle + 3 cuadros de caminata). Figuras de bloques con contorno; cada vecino con su paleta. |
| Sombra blob (32×32) | `src/lib/art.ts` → `drawBlobShadow` | Degradé radial negro a transparente. |

## Dependencias de código

three (MIT), @react-three/fiber (MIT), @react-three/drei (MIT), @react-three/postprocessing (MIT), postprocessing (Zlib), react / react-dom (MIT), vite (MIT), vitest (MIT), typescript (Apache-2.0). Se instalan con `npm install`; no se redistribuyen en `public/`.
