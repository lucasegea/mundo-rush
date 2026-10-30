// ui/hud/layout.ts — el lugar del minimapa y lo que el HUD del mapa le deja libre (open-world-3d T9, T10-integrate).
// Todo en rem, como el resto del HUD: con el texto al 100 % o al 125 % (el de fábrica) el círculo y su hueco crecen
// juntos, así que lo que no se tapa a un tamaño no se tapa a ninguno. Las clases son literales enteros para que
// Tailwind las vea al escanear; test/hud-layout.test.tsx lee sus números y comprueba que el hueco alcanza.

/** Distancia del minimapa al borde derecho e inferior de la pantalla (más el área segura). */
export const MINIMAP_OFFSET = "bottom-[calc(1rem+env(safe-area-inset-bottom))] right-[calc(1rem+env(safe-area-inset-right))]";

/** El círculo del minimapa: 7rem en teléfono, 10rem desde md (AC55: 112 y 160 px con el texto al 100 %). */
export const MINIMAP_SIZE = "size-[7rem] md:size-[10rem]";

/**
 * En pantallas angostas el aviso de hablar y el zoom van en una sola columna, apilados sobre el minimapa: el bloque de
 * abajo entero deja libre su alto (7rem más 1rem de aire, más el área segura). Desde md no hace falta: el aviso va al
 * centro y solo la columna derecha deja el hueco (`MINIMAP_CLEARANCE_SIDE`).
 */
export const MINIMAP_CLEARANCE_NARROW = "pb-[calc(8rem+env(safe-area-inset-bottom))] md:pb-0";

/** Desde md, la columna derecha (el zoom) deja libre el alto del minimapa: 10rem más 1rem de aire. */
export const MINIMAP_CLEARANCE_SIDE = "md:pb-[11rem]";
