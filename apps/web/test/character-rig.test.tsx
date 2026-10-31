// @vitest-environment jsdom
// Open-world-3d T7b, LK3 amended (D-840): the skeleton is chosen at the point of use. Character is mounted (without canvas:
// useFrame does not run and body loading is spied on) and we look at which skeleton it asks to load. With a KayKit test look
// on the dock (relief) and the open world's NPC distance rules switched on, it loads RIGS.kaykit: the
// skeleton comes from the look, never from distanceRules, relief or the open world.
import { DEFAULT_LOOK, PAINTED_LOOK, type LookId, type WorldLook } from "@lg/art";
import { prepareDiorama, type DioramaLayout } from "@lg/core";
import { cleanup, render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { Character } from "../src/world/actors/Character";
import type { CharacterLook } from "../src/world/actors/looks";
import { RIGS, type RigSpec } from "../src/world/actors/rigs";
import { buildDioramaScene } from "../src/world/dioramas/scene";
import { compiledUniverseClientContent } from "./helpers";

const loads = vi.hoisted(() => [] as RigSpec[]);
// T10-integrate: Character precompiles the body with usePrecompile (useThree); here the body never arrives, it is not called.
vi.mock("@react-three/fiber", () => ({ useFrame: () => {}, useThree: (pick: (s: { get: () => never }) => unknown) => pick({ get: () => { throw new Error("sin canvas"); } }) }));
vi.mock("../src/world/actors/characterAssets", () => ({
  loadCharacterAssets: (_body: unknown, _lod: unknown, rig: RigSpec) => {
    loads.push(rig);
    return new Promise(() => {}); // never arrives: the capsule body remains
  },
}));

const PERSON: CharacterLook = { body: "tunica", shirt: "casa-1", pants: "pantalon", skin: "piel", hair: "pelo", hairStyle: "casquete", hat: "gorra", scarf: "bufanda", scale: 1 };
/** A test look (not from the catalog): DEFAULT_LOOK with the KayKit skeleton. */
const KAYKIT_TEST_LOOK: WorldLook = { ...DEFAULT_LOOK, id: "prueba-kaykit" as LookId, characters: { ...DEFAULT_LOOK.characters, rig: "kaykit" } };

const mount = (cast: WorldLook["characters"] | null, distanceRules: boolean): RigSpec | undefined => {
  loads.length = 0;
  render(<Character id="npc-prueba" look={PERSON} pose={() => ({ x: 0, z: 0, speed: 0, yaw: null })} cut={false} cast={cast} distanceRules={distanceRules} />);
  cleanup();
  expect(loads).toHaveLength(1);
  return loads[0];
};

beforeEach(() => {
  // react-dom does not know <primitive> (it is R3F's) and warns via console.error: it is mount noise without a canvas.
  vi.spyOn(console, "error").mockImplementation(() => {});
});
afterEach(() => {
  vi.restoreAllMocks();
});

describe("LK3: Character carga el esqueleto del look (cast), no el de distanceRules ni del relieve", () => {
  test("look de prueba KayKit sobre el muelle (relieve) con reglas de NPC del mundo abierto: carga RIGS.kaykit", () => {
    const muelle = (compiledUniverseClientContent("U-GALEANO")["dioramas.json"] as DioramaLayout[]).find((d) => d.id === "muelle") as DioramaLayout;
    const scene = buildDioramaScene(prepareDiorama(muelle), "reduced", "low", KAYKIT_TEST_LOOK);
    expect(scene.picker).not.toBeNull(); // relief: yes
    const cast = scene.look.characters;
    scene.dispose();
    expect(mount(cast, true)).toBe(RIGS.kaykit);
    expect(mount(cast, false)).toBe(RIGS.kaykit);
  });

  test("DEFAULT_LOOK carga quaternius con o sin reglas de distancia; el pintado y sin cast, KayKit", () => {
    for (const rules of [true, false]) {
      expect(mount(DEFAULT_LOOK.characters, rules)).toBe(RIGS.quaternius);
      expect(mount(PAINTED_LOOK.characters, rules)).toBe(RIGS.kaykit);
      expect(mount(null, rules)).toBe(RIGS.kaykit);
    }
  });
});
