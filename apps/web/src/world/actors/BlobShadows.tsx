// world/actors/BlobShadows.tsx — las sombras blob de la propuesta C (plan estetica-c M1 ítem 12): un solo quad
// instanciado (una llamada) bajo los troncos de árboles y pinos (fijos) y bajo los personajes (en todos los tiers, así
// en `medium`, sin sombra proyectada, nada flota). Los personajes se leen de `actorSpots` en cada cuadro.
import { useFrame } from "@react-three/fiber";
import { useEffect, useMemo } from "react";
import { InstancedMesh, Matrix4, PlaneGeometry } from "three";
import { blobShadowMaterial } from "../materials/registry";
import type { BlobAnchor } from "../dioramas/scene";
import { actorSpots } from "../runtime";

/** Lugares para personajes además de los fijos. */
export const MAX_ACTOR_BLOBS = 12;
export const ACTOR_BLOB_SIZE = 1.5;
const LIFT = 0.025;

export function buildBlobShadows(anchors: readonly BlobAnchor[]): InstancedMesh {
  const mesh = new InstancedMesh(new PlaneGeometry(1, 1).rotateX(-Math.PI / 2), blobShadowMaterial(), anchors.length + MAX_ACTOR_BLOBS);
  const m = new Matrix4();
  anchors.forEach((a, i) => mesh.setMatrixAt(i, m.makeScale(a.size, 1, a.size).setPosition(a.x, LIFT, a.z)));
  mesh.count = anchors.length;
  mesh.renderOrder = 1;
  mesh.frustumCulled = false;
  mesh.name = "sombras-blob";
  return mesh;
}

export function BlobShadows({ anchors }: { anchors: readonly BlobAnchor[] }) {
  const mesh = useMemo(() => buildBlobShadows(anchors), [anchors]);
  useEffect(() => () => mesh.geometry.dispose(), [mesh]);
  const m = useMemo(() => new Matrix4(), []);
  useFrame(() => {
    let i = anchors.length;
    for (const spot of actorSpots.values()) {
      if (i >= anchors.length + MAX_ACTOR_BLOBS) break;
      mesh.setMatrixAt(i++, m.makeScale(ACTOR_BLOB_SIZE, 1, ACTOR_BLOB_SIZE).setPosition(spot.x, LIFT + 0.005, spot.z));
    }
    mesh.count = i;
    mesh.instanceMatrix.needsUpdate = true;
  });
  return <primitive object={mesh} />;
}
