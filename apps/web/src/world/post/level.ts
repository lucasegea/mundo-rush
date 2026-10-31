// world/post/level.ts — which postprocessing runs (plan estetica-c M6, 03 §2.9 and §2.7.1), apart from Post.tsx so that
// GameCanvas decides it without importing the post chunk: `low` and `dialog-only` give "none" and never request the chunk; with
// "reduce motion" neither (the selector turns `post` off).

export type PostLevel = "none" | "bloom" | "full";

/** The tier post level, if the selector allows it (`allowed` is `selectWorldRender(...).post`). */
export const postLevel = (allowed: boolean, tierPost: PostLevel): PostLevel => (allowed ? tierPost : "none");

/**
 * Open-world-3d T10 (b): EffectComposer knobs (by default multisampling 0 and HalfFloat frame buffer, as until
 * now). Today only the development measurement factors move them (world/budget/devFactors.ts).
 */
export interface PostComposer {
  multisampling: number;
  /** 8-bit frame buffer (UnsignedByte) instead of the default HalfFloat. */
  eightBit: boolean;
}
