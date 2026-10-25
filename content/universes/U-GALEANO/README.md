# U-GALEANO — dataset del universo (book-mode slice-1)

Universo generado del libro de Galeano, *Las venas abiertas de América Latina*, Región R1 (Potosí).
Se compila con `npm run build:content -- --universe=U-GALEANO`, que lee este árbol en aislamiento (el reader
de `scripts/content/build.ts` normaliza cada ruta a su canónica `content/<subpath>`) y corre el compilador completo.

## Qué lo EMITe el analizador vs. qué está a mano

- **EMITido** por `tooling/book-analyzer` desde `fixtures/galeano-r1-potosi.yaml` (contenido del libro):
  `manifiesto.yaml`, `world/places.yaml`, `dioramas/`, `npcs/`, `red/presentaciones.yaml`, `missions/`,
  `conversaciones/CONV-POTOSI.yaml`, `saberes/`, `glossary/en.es-AR.yaml`.
- **Scaffolding del engine a mano** (M3 SEAM): EMIT no produce los OBLIGATORIOS de infraestructura ni las listas
  de seguridad, y un universo namespaceado se compila aislado, así que se autoran acá junto al dataset:
  `skills/skill-tree.yaml`, `companion/lumi.es-AR.yaml` (sólo las señales genéricas que exige el catálogo),
  `safety/topics.global.yaml`, `safety/containment.es-AR.yaml`, `safety/blocklists/*.yaml`, `level-cards/B1.yaml`,
  `retired-ids.yaml`, `lint-allowlist.yaml`.
  Un milestone posterior (analizador real / universe-init) debería generar o compartir este scaffolding en vez de
  copiarlo; en slice-1 se copia de la campesino (proven-valid), salvo `lumi.es-AR.yaml` y `lint-allowlist.yaml`
  (recortados a lo que este universo referencia) — ver el build-log de M3.

## Notas de mapeo (Foundation 2, ids no ensanchados)

- `CONV-C1` del research → id `CONV-POTOSI` (`ConversacionId` admite sólo letras).
- `DioramaId` `muelle`/`plaza` reusados: `muelle` = Cerro Rico (mina), `plaza` = Villa Imperial (ciudad).
- `LugarId` `campos.cerro`, `cruce.villa`. Par de idiomas es-AR/en (D-806).
