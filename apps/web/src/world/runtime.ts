// Estado de presentación por cuadro, compartido entre componentes de world/ (R7: alta frecuencia en refs, nunca en
// el store). Player escribe la posición dibujada del jugador; CameraRig la sigue y los NPCs la miran. Se monta Player
// antes que CameraRig, así en cada cuadro la cámara lee la posición ya actualizada. Los personajes dejan su lugar en
// `actorSpots` para las sombras blob; CameraRig deja en `cameraLook` el punto que mira y su distancia ya suavizada
// (el sol, la caja de sombra y la niebla la siguen, D-208).
import type { Camera, WebGLRenderer } from "three";

export const followTarget = { x: 0, z: 0, ready: false };
export const actorSpots = new Map<string, { x: number; y: number; z: number }>();
/**
 * Open-world-3d T6 (D-819): el suelo del diorama montado. Diorama pone `heightAt` (la malla dibujada) y `lift` (0,02 m
 * con relieve, 0 sin él); los personajes apoyan los pies en `actorY`. Sin diorama, el suelo es y = 0.
 */
export const worldGround: { heightAt: (x: number, z: number) => number; lift: number } = { heightAt: () => 0, lift: 0 };
/** La altura de los pies de un personaje en (x, z): el terreno más el levante. */
export const actorY = (x: number, z: number): number => worldGround.heightAt(x, z) + worldGround.lift;
/**
 * Open-world-3d T7 (AC45): el renderer del canvas del mundo abierto (lo pone Diorama). La caminata del navegador dibuja
 * con él solo los árboles y lee `renderer.info` mirando al bosque y de espaldas.
 */
export const worldRenderer: { gl: WebGLRenderer | null } = { gl: null };
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
