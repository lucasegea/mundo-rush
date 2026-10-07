import { useFrame } from "@react-three/fiber";
import { useEffect, useMemo, useRef } from "react";
import { PlaneGeometry, Vector3, type Group, type Mesh } from "three";
import { drawBlobShadow, drawSpriteSheet, PALETTES, pixelCanvasTexture, textureGpuBytes } from "../lib/art";
import {
  billboardYaw,
  selectSpriteFrame,
  sheetCellTransform,
  spriteHeightCompensation,
  SPRITE_H_PX,
  SPRITE_W_PX,
  type Direction,
} from "../lib/billboard";
import { TILE_PX } from "../lib/tileChunk";
import { buildWalkPaths, samplePath } from "../lib/world";
import { runtime } from "./runtime";

const SPRITE_W = SPRITE_W_PX / TILE_PX; // 1 m
const SPRITE_H = SPRITE_H_PX / TILE_PX; // 1.5 m
const forward = new Vector3();

/** 8 billboard sprites walking loops: Y-only rotation, feet-anchored, blob shadow in every tier. */
export function Walkers({ compensateHeight }: { compensateHeight: boolean }) {
  const assets = useMemo(() => {
    const blobCanvas = drawBlobShadow();
    const blob = pixelCanvasTexture(blobCanvas);
    const sheets = PALETTES.map((p) => drawSpriteSheet(p));
    runtime.generatedTextures.spriteSheets = sheets.reduce((n, c) => n + textureGpuBytes(c), 0);
    runtime.generatedTextures.blob = textureGpuBytes(blobCanvas);
    // Plane facing +Z, translated up so its bottom edge (the feet) sits at y = 0.
    const sprite = new PlaneGeometry(SPRITE_W, SPRITE_H).translate(0, SPRITE_H / 2, 0);
    const shadow = new PlaneGeometry(0.9, 0.5).rotateX(-Math.PI / 2);
    const walkers = buildWalkPaths().map((path, i) => ({ path, texture: pixelCanvasTexture(sheets[i % sheets.length]!) }));
    return { blob, sprite, shadow, walkers };
  }, []);

  useEffect(
    () => () => {
      assets.blob.dispose();
      assets.sprite.dispose();
      assets.shadow.dispose();
      assets.walkers.forEach((w) => w.texture.dispose());
    },
    [assets],
  );

  const groups = useRef<Array<Group | null>>([]);
  const sprites = useRef<Array<Mesh | null>>([]);
  const facing = useRef<Direction[]>(assets.walkers.map(() => "down"));

  useFrame(({ camera, clock }) => {
    const t = clock.elapsedTime;
    camera.getWorldDirection(forward);
    const yaw = billboardYaw(forward);
    const scaleY = compensateHeight ? spriteHeightCompensation(forward) : 1;
    assets.walkers.forEach((w, i) => {
      const g = groups.current[i];
      const s = sprites.current[i];
      if (!g || !s) return;
      const p = samplePath(w.path.points, w.path.startOffset + t * w.path.speed);
      g.position.set(p.x, 0, p.z);
      s.rotation.y = yaw;
      s.scale.y = scaleY;
      const frame = selectSpriteFrame(p.dx * w.path.speed, p.dz * w.path.speed, yaw, t, facing.current[i]);
      facing.current[i] = frame.direction;
      const cell = sheetCellTransform(frame.col, frame.row);
      w.texture.repeat.set(cell.repeatX, cell.repeatY);
      w.texture.offset.set(cell.offsetX, cell.offsetY);
      if (i === 0) runtime.followTarget.set(p.x, 0, p.z);
    });
  });

  return (
    <group>
      {assets.walkers.map((w, i) => (
        <group key={i} ref={(el) => void (groups.current[i] = el)}>
          <mesh geometry={assets.shadow} position={[0, 0.02, 0]} renderOrder={1}>
            <meshBasicMaterial map={assets.blob} transparent depthWrite={false} />
          </mesh>
          <mesh ref={(el) => void (sprites.current[i] = el)} geometry={assets.sprite}>
            <meshLambertMaterial map={w.texture} alphaTest={0.5} />
          </mesh>
        </group>
      ))}
    </group>
  );
}
