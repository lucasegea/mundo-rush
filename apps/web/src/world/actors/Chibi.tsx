// world/actors/Chibi.tsx — un personaje chibi en el mundo (plan estetica-c M1 ítem 13): 6 mallas con el material toon,
// animación procedural por cuadro (idle con respiración y balanceo de cabeza, caminar con rebote según la velocidad) y
// giro suave hacia donde mira. Todo lo que cambia por cuadro se hace en useFrame mutando refs (03 §2.3, R7). Deja su
// lugar en `actorSpots` para la sombra blob. Con `onSelect`, el clic sobre el cuerpo llega como en el billboard.
import { useFrame, type ThreeEvent } from "@react-three/fiber";
import { useEffect, useMemo, useRef } from "react";
import { actorSpots } from "../runtime";
import { applyChibiPose, buildChibi, chibiPose, disposeChibi } from "./chibiModel";
import { chibiLook } from "./looks";

export interface ActorPose {
  x: number;
  z: number;
  /** m/s (para el ritmo del paso). */
  speed: number;
  /** Hacia dónde mirar (radianes, 0 = +z); null = sigue mirando a donde miraba. */
  yaw: number | null;
}

interface Props {
  id: string;
  lookId: string;
  /** La pose de este cuadro; se llama dentro de useFrame. */
  pose: (dtSec: number) => ActorPose;
  /** "Reducir movimiento": el giro corta en vez de suavizarse. */
  cut: boolean;
  onSelect?: (e: ThreeEvent<MouseEvent>) => void;
  initialYaw?: number;
}

const WALK_SPEED = 3.5;

export function Chibi({ id, lookId, pose, cut, onSelect, initialYaw = Math.PI / 4 }: Props) {
  const chibi = useMemo(() => buildChibi(chibiLook(lookId)), [lookId]);
  useEffect(() => () => {
    disposeChibi(chibi);
    actorSpots.delete(id);
  }, [chibi, id]);
  const phase = useRef(0);
  const yaw = useRef(initialYaw);

  useFrame(({ clock }, delta) => {
    const p = pose(delta);
    chibi.root.position.set(p.x, 0, p.z);
    if (p.yaw !== null) {
      const d = Math.atan2(Math.sin(p.yaw - yaw.current), Math.cos(p.yaw - yaw.current));
      yaw.current += cut ? d : d * (1 - Math.exp(-10 * delta));
    }
    chibi.root.rotation.y = yaw.current;
    const speed01 = Math.min(1, p.speed / WALK_SPEED);
    phase.current += delta * (speed01 > 0.05 ? 9 * Math.max(0.6, speed01) : 2);
    applyChibiPose(chibi, chibiPose(phase.current, speed01, clock.elapsedTime + id.length));
    actorSpots.set(id, { x: p.x, z: p.z });
  });

  return <primitive object={chibi.root} {...(onSelect ? { onClick: onSelect } : {})} />;
}
