// world/post/level.ts — qué postprocesado corre (plan estetica-c M6, 03 §2.9 y §2.7.1), aparte de Post.tsx para que
// GameCanvas lo decida sin importar el chunk de post: `low` y `dialog-only` dan "none" y nunca piden el chunk; con
// "reducir movimiento" tampoco (el selector apaga `post`).

export type PostLevel = "none" | "bloom" | "full";

/** El nivel de post del tier, si el selector lo permite (`allowed` es `selectWorldRender(...).post`). */
export const postLevel = (allowed: boolean, tierPost: PostLevel): PostLevel => (allowed ? tierPost : "none");
