// world/actors/BlobShadows.tsx — proposal C's blob shadows (plan estetica-c M1 item 12): a single instanced quad
// (one call) under the trunks of trees and pines (fixed) and under the characters (on all tiers, so
// on `medium`, with no cast shadow, nothing floats). Characters are read from `actorSpots` every frame.
import { useFrame } from "@react-three/fiber";
import { useEffect, useMemo } from "react";
import { InstancedMesh, Matrix4, PlaneGeometry } from "three";
import { blobShadowMaterial } from "../materials/registry";
import type { BlobAnchor } from "../dioramas/scene";
import { actorSpots } from "../runtime";

/** Spots for characters besides the fixed ones. */
export const MAX_ACTOR_BLOBS = 12;
export const ACTOR_BLOB_SIZE = 1.5;
const LIFT = 0.025;

/** Open-world-3d T6: `heightAt` rests the fixed shadows on the relief (without relief, the terrain is flat at y = 0). */
export function buildBlobShadows(anchors: readonly BlobAnchor[], heightAt: (x: number, z: number) => number = () => 0): InstancedMesh {
  const mesh = new InstancedMesh(new PlaneGeometry(1, 1).rotateX(-Math.PI / 2), blobShadowMaterial(), anchors.length + MAX_ACTOR_BLOBS);
  const m = new Matrix4();
  anchors.forEach((a, i) => mesh.setMatrixAt(i, m.makeScale(a.size, 1, a.size).setPosition(a.x, heightAt(a.x, a.z) + LIFT, a.z)));
  mesh.count = anchors.length;
  mesh.renderOrder = 1;
  mesh.frustumCulled = false;
  mesh.name = "sombras-blob";
  return mesh;
}

export function BlobShadows({ anchors, heightAt }: { anchors: readonly BlobAnchor[]; heightAt?: (x: number, z: number) => number }) {
  const mesh = useMemo(() => buildBlobShadows(anchors, heightAt), [anchors, heightAt]);
  useEffect(() => () => mesh.geometry.dispose(), [mesh]);
  const m = useMemo(() => new Matrix4(), []);
  useFrame(() => {
    let i = anchors.length;
    for (const spot of actorSpots.values()) {
      if (i >= anchors.length + MAX_ACTOR_BLOBS) break;
      mesh.setMatrixAt(i++, m.makeScale(ACTOR_BLOB_SIZE, 1, ACTOR_BLOB_SIZE).setPosition(spot.x, spot.y + LIFT + 0.005, spot.z));
    }
    mesh.count = i;
    mesh.instanceMatrix.needsUpdate = true;
  });
  return <primitive object={mesh} />;
}
