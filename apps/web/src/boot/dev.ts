// Gancho de desarrollo (03 §6.5.1, ADR-026). Vacío en F1.3: FD0 carga acá el modo director con
// `import()` SOLO bajo `import.meta.env.DEV && import.meta.env.VITE_LG_DIRECTOR === "1"`. En el build de
// producción `import.meta.env.DEV` es false y el cuerpo se elimina.
export async function runDevHook(): Promise<void> {
  if (!import.meta.env.DEV) return;
  // FD0: if (import.meta.env.VITE_LG_DIRECTOR === "1") await import("../dev/director/...");
}
