// Estado de presentación por cuadro, compartido entre componentes de world/ (R7: alta frecuencia en refs, nunca en
// el store). Player escribe la posición dibujada del jugador; CameraRig la sigue y los NPCs la miran. Se monta Player
// antes que CameraRig, así en cada cuadro la cámara lee la posición ya actualizada. Los personajes dejan su lugar en
// `actorSpots` para las sombras blob; CameraRig deja en `cameraLook` el punto que mira y su distancia ya suavizada
// (el sol, la caja de sombra y la niebla la siguen, D-208).
import type { Camera } from "three";

export const followTarget = { x: 0, z: 0, ready: false };
export const actorSpots = new Map<string, { x: number; z: number }>();
/**
 * Open-world-3d T5: además el t de zoom ya suavizado (niebla, etiquetas y balizas lo siguen), el yaw dibujado y la
 * cámara misma (la caminata del navegador proyecta las balizas con sus matrices, AC30).
 */
export const cameraLook: { x: number; y: number; z: number; distance: number; t: number; yawDeg: number; camera: Camera | null } = {
  x: 0, y: 0, z: 0, distance: 30, t: 0, yawDeg: 0, camera: null,
};
/**
 * Plan estetica-c M3: los personajes que se animan este cuadro (AnimationGovernor los elige por tier, distancia y
 * pantalla). Mientras no hay gobernador montado (`active` false) se anima a todos.
 */
export const animatedActors = { active: false, ids: new Set<string>() };
