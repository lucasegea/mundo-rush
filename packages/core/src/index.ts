// @lg/core — TS puro: reglas del juego (03 §4.2, R4). Sin DOM, sin Node, sin React/three/zustand.
// Núcleo base de F1.1b: ids de dominio con marca, Clock y Rng inyectables, EventLog append-only.
// F1.3: tiers de calidad (R12), ajustes del jugador y fase/paneles del shell.
export const PACKAGE_NAME = "@lg/core";

export * from "./ids";
export * from "./runtime";
export * from "./quality";
export * from "./settings";
export * from "./shell";
