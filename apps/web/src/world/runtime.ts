// Estado de presentación por cuadro, compartido entre componentes de world/ (R7: alta frecuencia en refs, nunca en
// el store). Player escribe la posición interpolada del jugador; CameraRig la sigue. Se monta Player antes que
// CameraRig, así en cada cuadro la cámara lee la posición ya actualizada.
export const followTarget = { x: 0, z: 0, ready: false };
