// world/labels/Beacons.tsx — whole-map beacons (open-world-3d T5, PD-5; V6 mockup `world.js` beaconTexture): when
// moving the camera away (t from 0.4 to 0.7) an amber disc appears over the player and a red one over each NPC, sized
// proportionally to the camera distance, with no depth test, to find people with the whole map. The
// opacity and scale come from `cameraLook` (the already-smoothed t and distance) in useFrame, without re-render.
// All the diorama NPCs carry a beacon, also the already-visited ones (T10-integrate, reviewed against AC30): AC30 asks for the
// beacons of the three NPCs on the whole map and the Walk runs it after a chat (AC29); with beacons only for
// pending ones, an NPC completed earlier would leave two and AC30 would fail. The pending ones are marked by the minimap (T9). Switching to
// pending only is a plan decision that amends AC30, not a change to this file.
import { useFrame } from "@react-three/fiber";
import { useEffect, useMemo } from "react";
import { CanvasTexture, DataTexture, RGBAFormat, SRGBColorSpace, Sprite, type Texture } from "three";
import { PALETTE } from "@lg/art";
import { smoothstep } from "../camera/zoom";
import { beaconMaterial } from "../materials/registry";
import { cameraLook, followTarget } from "../runtime";

/** Beacon size per meter of camera distance, and how far it rises over the head (V6 mockup). */
export const BEACON = { scalePerMeter: 0.045, lift: 2.6, liftPerMeter: 0.01, fadeFrom: 0.4, fadeTo: 0.7 } as const;

/** Opacity of the beacons for a zoom t. */
export const beaconAlpha = (t: number): number => smoothstep(BEACON.fadeFrom, BEACON.fadeTo, t);

function beaconTexture(fill: string): Texture {
  const canvas = typeof document === "undefined" ? null : document.createElement("canvas");
  let g: CanvasRenderingContext2D | null = null;
  try {
    g = canvas?.getContext("2d") ?? null;
  } catch {
    g = null;
  }
  if (!canvas || !g) {
    const t = new DataTexture(new Uint8Array([255, 255, 255, 255]), 1, 1, RGBAFormat);
    t.needsUpdate = true;
    return t;
  }
  canvas.width = canvas.height = 64;
  const disc = (r: number, color: string): void => {
    g.beginPath();
    g.arc(32, 32, r, 0, Math.PI * 2);
    g.fillStyle = color;
    g.fill();
  };
  disc(24, PALETTE.tinta);
  disc(19, PALETTE.blanco);
  disc(10, fill);
  const t = new CanvasTexture(canvas);
  t.colorSpace = SRGBColorSpace;
  return t;
}

function beaconSprite(material: ReturnType<typeof beaconMaterial>, id: string, renderOrder: number): Sprite {
  const s = new Sprite(material);
  s.renderOrder = renderOrder;
  s.visible = false;
  s.userData["beacon"] = id;
  return s;
}

export interface BeaconSpot {
  id: string;
  x: number;
  z: number;
}

export function Beacons({ npcs, heightAt }: { npcs: readonly BeaconSpot[]; heightAt: ((x: number, z: number) => number) | null }) {
  const mats = useMemo(() => ({ player: beaconMaterial(beaconTexture(PALETTE["ámbar"])), npc: beaconMaterial(beaconTexture(PALETTE.techo)) }), []);
  const player = useMemo(() => beaconSprite(mats.player, "player", 31), [mats]);
  const others = useMemo(() => npcs.map((n) => ({ n, sprite: beaconSprite(mats.npc, n.id, 30) })), [npcs, mats]);
  useEffect(() => () => {
    for (const m of [mats.player, mats.npc]) {
      m.map?.dispose();
      m.dispose();
    }
  }, [mats]);

  useFrame(() => {
    const alpha = beaconAlpha(cameraLook.t);
    const visible = alpha > 0.02;
    mats.player.opacity = alpha;
    mats.npc.opacity = alpha;
    const scale = cameraLook.distance * BEACON.scalePerMeter;
    const lift = BEACON.lift + cameraLook.distance * BEACON.liftPerMeter;
    const ground = (x: number, z: number): number => (heightAt ? heightAt(x, z) : 0);
    player.visible = visible;
    player.position.set(followTarget.x, ground(followTarget.x, followTarget.z) + lift, followTarget.z);
    player.scale.setScalar(scale);
    for (const { n, sprite } of others) {
      sprite.visible = visible;
      sprite.position.set(n.x, ground(n.x, n.z) + lift, n.z);
      sprite.scale.setScalar(scale);
    }
  });

  return (
    <group name="balizas">
      <primitive object={player} />
      {others.map(({ n, sprite }) => <primitive key={n.id} object={sprite} />)}
    </group>
  );
}
