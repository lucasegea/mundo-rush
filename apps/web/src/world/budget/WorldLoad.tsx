// world/budget/WorldLoad.tsx — los dos ganchos de carga del mundo dentro del Canvas (open-world-3d T10 (d)):
// `ShaderWarmup` compila los programas de lo que ya está en la escena con compileAsync y avisa (GameCanvas retiene el
// frameloop mientras tanto); `FirstFrameMark` marca el primer cuadro dibujado. Lo que llega después (mallas y mapas de
// la naturaleza, personajes, el chunk de post) compila en su propio cuadro, como antes.
import { useFrame, useThree } from "@react-three/fiber";
import { useEffect, useRef } from "react";
import { bridge } from "../../state/bridge";
import { reportFirstFrame, warmShaders } from "./loadWarmup";

/** Compila con compileAsync lo que está en la escena y llama a `onReady` (también si falla o se pasa del tope). */
export function ShaderWarmup({ onReady }: { onReady: () => void }) {
  const gl = useThree((s) => s.gl);
  const scene = useThree((s) => s.scene);
  const camera = useThree((s) => s.camera);
  useEffect(() => {
    let alive = true;
    void warmShaders(gl, scene, camera).then((r) => {
      if (r !== "compiled") console.warn(`mundo: compileAsync ${r === "timeout" ? "no terminó a tiempo" : "falló"}; compila el primer cuadro`);
      if (alive) onReady();
    });
    return () => {
      alive = false;
    };
  }, [gl, scene, camera, onReady]);
  return null;
}

/**
 * Marca `lg:world-first-frame` después del primer cuadro que dibuja: useFrame corre antes de `gl.render` en el mismo
 * cuadro, y la microtarea corre cuando el cuadro entero ya se envió.
 */
export function FirstFrameMark() {
  const gl = useThree((s) => s.gl);
  const done = useRef(false);
  useFrame(() => {
    if (done.current) return;
    done.current = true;
    queueMicrotask(() => reportFirstFrame(bridge.worldFirstFrame, gl.info.programs?.length ?? 0));
  });
  return null;
}
