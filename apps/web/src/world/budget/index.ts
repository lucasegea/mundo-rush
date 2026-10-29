// world/budget/ — estimador estático de draw calls y triángulos (plan estetica-c M1 A15) y memoria de texturas por tier
// (M6). Marcador de zona. renderStats.ts (contadores de renderer.info, solo desarrollo) NO se re-exporta acá: se carga
// por import() bajo la doble llave del modo director, así nunca entra a un build.
export * from "./estimate";
export * from "./textures";
