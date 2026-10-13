// Estado de presentación por cuadro, compartido entre componentes de world/ (R7: alta frecuencia en refs, nunca en
// el store). Player escribe la posición dibujada del jugador; CameraRig la sigue y los NPCs la miran. Se monta Player
// antes que CameraRig, así en cada cuadro la cámara lee la posición ya actualizada. Los personajes dejan su lugar en
// `actorSpots` para las sombras blob; CameraRig deja en `cameraLook` el punto que mira y su distancia ya suavizada
// (el sol, la caja de sombra y la niebla la siguen, D-208).
export const followTarget = { x: 0, z: 0, ready: false };
export const actorSpots = new Map<string, { x: number; z: number }>();
export const cameraLook = { x: 0, y: 0, z: 0, distance: 30 };
