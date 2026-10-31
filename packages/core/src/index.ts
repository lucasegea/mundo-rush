// @lg/core — pure TS: game rules (03 §4.2, R4). No DOM, no Node, no React/three/zustand.
// F1.1b base core: branded domain ids, injectable Clock and Rng, append-only EventLog.
// F1.3: quality tiers (R12), player settings and shell phase/panels.
// F2: movement (grid, A*, collision, controller), semantic input (R10), camera (R11) and diorama.
// F4.2: per-build glossary and tappable words of the dialogue HUD (dialogue/).
// F4.1: scene machine, success criteria and mission effects (also through the @lg/core/scene subpath).
// A2: conversation meters (ADR-027; also through the @lg/core/conversation subpath).
export const PACKAGE_NAME = "@lg/core";

export * from "./ids";
export * from "./runtime";
export * from "./quality";
export * from "./settings";
export * from "./shell";
export * from "./movement";
export * from "./input";
export * from "./camera";
export * from "./world";
export * from "./scene";
export * from "./dialogue";
export * from "./conversation";
