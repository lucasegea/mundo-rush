# learning-game (Mundo Rush)

Juego de navegador (PC primero) que es también un sistema de aprendizaje de un segundo idioma.
La documentación de diseño y arquitectura vive en [`docs/`](docs/README.md); el orden de autoridad
está en `docs/00-decisiones.md` §0.3.

## Requisitos

- Node 22 (>= 22.18, por el type stripping que usan `apps/server` y `scripts/budgets`) y npm 11. npm workspaces, sin turborepo, pnpm ni nx (03 §4.1, D-089).

## Instalar y correr los gates

```bash
npm ci              # instala exactamente lo del package-lock.json
npm run verify      # el gate de toda fase: los 7 pasos en orden, falla si falla uno
```

`verify` encadena:

| Paso | Qué hace |
|---|---|
| `npm run typecheck` | `tsc -b` sobre las referencias de proyecto de `tsconfig.json` |
| `npm run lint` | ESLint 9 con la config exacta de `03` §4.3.1 (límites de módulos + costuras R10-R15) |
| `npm run test` | vitest: un proyecto por workspace + límites (`scripts/lint/`), presupuestos (`scripts/budgets/`) y ADRs (`scripts/adr/`) |
| `npm run coverage:core` | cobertura de líneas del núcleo base (ids, Clock, Rng, EventLog) con `@vitest/coverage-v8`; falla por debajo del 90 % o si no midió ninguna línea |
| `npm run validate:content` | centinela hasta F1.2 (todavía no hay `content/`) |
| `npm run build` | `tsc -b` + `vite build` de `apps/web` (build de desarrollo, 03 §8.3; emite `dist/.vite/manifest.json`) |
| `npm run check:budgets` | `scripts/budgets/bundle-size.ts`: mide en gzip el grafo estático de `index.html` (y el chunk 3D y `docente.html` cuando existan) contra `scripts/budgets/budgets.json` (= `03` §2.7.3); después corre `check:dev-only`, centinela hasta FD0. Va después de `build` porque lee su salida |

Servidor: `npm start --workspace @lg/server` escucha en `http://127.0.0.1:8787` (`LG_PORT` lo cambia). `GET /health` → `200 {"ok":true,"data":{"status":"ok","service":"@lg/server"}}`; cualquier error responde `{"ok":false,"error":{"code","message"}}` (ruta desconocida: `404 not_found`).

Un `npm run lint` rojo por un límite de módulos es un bloqueante, no una advertencia (03 §4.3.2).

## Dónde está cada cosa

El árbol completo es `docs/03-arquitectura.md` §4.2 y la única fuente de rutas es §4.2.1.
Lo que existe hoy (F1.1b):

| Ruta | Qué es |
|---|---|
| `apps/web` (`@lg/web`) | cliente Vite + React + TS. `src/main.tsx`, `App.tsx`, `boot/` = raíz de composición. Las carpetas `ui/`, `world/`, `services/`, `state/`, `dev/`, `teacher/`, `i18n/` tienen solo marcadores para que el lint sea testeable |
| `apps/web/src/services/platform/` | interfaz `Platform` (`types.ts`) + adaptador `web` (`web.ts`), costura R15 |
| `apps/server` (`@lg/server`) | servidor Node + TS: `src/http.ts` (`/health`, sobre JSON), `src/main.ts` (arranque) |
| `packages/core` (`@lg/core`) | TS puro: sin DOM, sin Node, sin React/three/zustand, sin `Date.now()`/`Math.random()`. Hoy: ids con marca (`src/ids.ts`), `Clock`, `Rng` con semilla y `EventLog` (`src/runtime/`) |
| `packages/protocol` (`@lg/protocol`) | mensajes y DTOs (solo zod) |
| `packages/content-schema` (`@lg/content-schema`) | schemas y compilador de contenido (F1.2) |
| `tooling/` | reservado para el modo director (FD0); no es workspace |
| `eslint.config.js` | copia literal de `03` §4.3.1 |
| `scripts/lint/boundaries.test.ts` | prueba cada celda prohibida de `03` §4.3 por la API de ESLint (`lintText` con `filePath` virtual) |
| `docs/adr/` | ADR-001 a ADR-026 (`03` §11), uno por archivo |

Alias de `apps/web`: `@ui/*`, `@world/*`, `@state/*`, `@services/*`, `@i18n/*`, `@teacher/*`.

## Reglas para las corridas

- Las corridas no hacen `git add`, `commit`, `push` ni abren PRs (D-024): trabajan en una rama
  `feat/F<n>-<slug>` y el operador commitea después de un `verify` verde.
- Nunca leer ni commitear `.env`; `.env.example` tiene solo nombres de variables (`LG_*`).
- Sin Playwright ni navegador automatizado (D-016).
