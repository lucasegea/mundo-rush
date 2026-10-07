// world/sprites/Billboard.tsx — sprite HD-2D (03 §2.9): plano que rota solo en Y hacia la cámara, anclado por
// los pies, con sombra blob en todos los tiers y el cuadro de la hoja según la dirección relativa a la cámara.
// Todo lo que cambia por cuadro se hace en useFrame mutando refs (03 §2.3, R7): sin estado de React.
import { useFrame, type ThreeEvent } from "@react-three/fiber";
import { useEffect, useMemo, useRef } from "react";
import { PlaneGeometry, type Group } from "three";
import { pixelTexture } from "../art/texture";
import type { PixelImage } from "../art/pixels";
import {
  billboardYaw, cameraForward, selectSpriteFrame, sheetCellTransform, spriteHeightCompensation,
  SPRITE_H_PX, SPRITE_W_PX, type Direction,
} from "./orientation";
import { drawBlobShadow } from "./sheet";
import { TILE_PX } from "../tiles/buildTileChunk";

const SPRITE_W = SPRITE_W_PX / TILE_PX; // 1 m
const SPRITE_H = SPRITE_H_PX / TILE_PX; // 1,5 m
const BLOB = drawBlobShadow();

export interface SpritePose {
  x: number;
  z: number;
  vx: number;
  vz: number;
}

interface Props {
  sheet: PixelImage;
  pitchDeg: number;
  yawDeg: number;
  /** La pose de este cuadro; se llama dentro de useFrame (lectura transitoria). */
  pose: () => SpritePose;
  /** Clic sobre el sprite (los NPCs: interactuar). */
  onSelect?: (e: ThreeEvent<MouseEvent>) => void;
}

export function Billboard({ sheet, pitchDeg, yawDeg, pose, onSelect }: Props) {
  const assets = useMemo(() => ({
    texture: pixelTexture(sheet),
    blob: pixelTexture(BLOB),
    // Plano que mira a +z, subido para que su borde de abajo (los pies) quede en y = 0.
    sprite: new PlaneGeometry(SPRITE_W, SPRITE_H).translate(0, SPRITE_H / 2, 0),
    shadow: new PlaneGeometry(0.9, 0.5).rotateX(-Math.PI / 2),
  }), [sheet]);
  useEffect(() => () => {
    assets.texture.dispose();
    assets.blob.dispose();
    assets.sprite.dispose();
    assets.shadow.dispose();
  }, [assets]);

  const group = useRef<Group>(null);
  const facing = useRef<Direction>("down");
  const forward = cameraForward(pitchDeg, yawDeg);
  const yaw = billboardYaw(forward);
  const scaleY = spriteHeightCompensation(forward);

  useFrame(({ clock }) => {
    const g = group.current;
    if (!g) return;
    const p = pose();
    g.position.set(p.x, 0, p.z);
    const frame = selectSpriteFrame(p.vx, p.vz, yaw, clock.elapsedTime, facing.current);
    facing.current = frame.direction;
    const cell = sheetCellTransform(frame.col, frame.row);
    assets.texture.repeat.set(cell.repeatX, cell.repeatY);
    assets.texture.offset.set(cell.offsetX, cell.offsetY);
  });

  return (
    <group ref={group}>
      <mesh geometry={assets.shadow} position={[0, 0.02, 0]} renderOrder={1}>
        <meshBasicMaterial map={assets.blob} transparent depthWrite={false} />
      </mesh>
      <mesh geometry={assets.sprite} rotation={[0, yaw, 0]} scale={[1, scaleY, 1]} {...(onSelect ? { onClick: onSelect } : {})}>
        <meshBasicMaterial map={assets.texture} alphaTest={0.5} />
      </mesh>
    </group>
  );
}
