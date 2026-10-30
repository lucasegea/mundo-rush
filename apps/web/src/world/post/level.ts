// world/post/level.ts — qué postprocesado corre (plan estetica-c M6, 03 §2.9 y §2.7.1), aparte de Post.tsx para que
// GameCanvas lo decida sin importar el chunk de post: `low` y `dialog-only` dan "none" y nunca piden el chunk; con
// "reducir movimiento" tampoco (el selector apaga `post`).

export type PostLevel = "none" | "bloom" | "full";

/** El nivel de post del tier, si el selector lo permite (`allowed` es `selectWorldRender(...).post`). */
export const postLevel = (allowed: boolean, tierPost: PostLevel): PostLevel => (allowed ? tierPost : "none");

/**
 * Open-world-3d T10 (b): perillas del EffectComposer (por defecto multisampling 0 y frame buffer HalfFloat, como hasta
 * ahora). Hoy las mueven solo los factores de medición de desarrollo (world/budget/devFactors.ts).
 */
export interface PostComposer {
  multisampling: number;
  /** Frame buffer de 8 bits (UnsignedByte) en lugar del HalfFloat por defecto. */
  eightBit: boolean;
}
