// Selectores del slice `world`: view-model del modo solo-diálogo (lugares de la región y quién está en cada uno).
import type { GameState } from "../store";
import { createViewSelector } from "./view";

export interface DialogOnlyPlaceItem {
  id: string;
  name: string;
  en: string | null;
  npcNames: string[];
  selected: boolean;
}

export interface DialogOnlyView {
  status: GameState["world"]["catalog"];
  regionName: string | null;
  places: DialogOnlyPlaceItem[];
  selected: {
    id: string;
    name: string;
    en: string | null;
    description: string;
    npcs: { id: string; name: string }[];
  } | null;
}

export const selectDialogOnlyView = createViewSelector(
  (s: GameState) => [s.world.catalog, s.world.regionName, s.world.places, s.world.npcs, s.ui.dialogOnlyPlaceId] as const,
  (status, regionName, places, npcs, selectedId): DialogOnlyView => {
    const npcsAt = (placeId: string) => npcs.filter((n) => n.placeId === placeId);
    const place = places.find((p) => p.id === selectedId) ?? null;
    return {
      status,
      regionName,
      places: places.map((p) => ({ id: p.id, name: p.name, en: p.en, npcNames: npcsAt(p.id).map((n) => n.name), selected: p.id === selectedId })),
      selected: place && {
        id: place.id, name: place.name, en: place.en, description: place.description,
        npcs: npcsAt(place.id).map((n) => ({ id: n.id, name: n.name })),
      },
    };
  },
);
