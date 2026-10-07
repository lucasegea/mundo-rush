// Luz del diorama (03 §2.9, §2.7.1): 1 hemisférica + 1 direccional en todos los tiers. Las luces puntuales y los
// presets por hora del día (D-051) llegan con F3.
export function Lighting() {
  return (
    <>
      <hemisphereLight args={["#fff6e0", "#5a6a3a", 1.4]} />
      <directionalLight position={[8, 16, 6]} intensity={1.6} color="#fff1d6" />
    </>
  );
}
