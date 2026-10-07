# learning-game (Mundo Rush)

Juego de navegador (PC primero) que es también un sistema de aprendizaje de un segundo idioma.
La documentación de diseño y arquitectura vive en [`docs/`](docs/README.md); el orden de autoridad
está en `docs/00-decisiones.md` §0.3.

## Requisitos

- Node 22 (>= 22.12) y npm 11. npm workspaces, sin turborepo, pnpm ni nx (03 §4.1, D-089).

## Instalar y correr los gates

```bash
npm ci              # instala exactamente lo del package-lock.json
npm run verify      # el gate de toda fase: los 6 pasos en orden, falla si falla uno
```

`verify` encadena:

| Paso | Qué hace |
|---|---|
| `npm run typecheck` | `tsc -b` sobre las referencias de proyecto de `tsconfig.json` |
| `npm run lint` | ESLint 9 con la config exacta de `03` §4.3.1 (límites de módulos + costuras R10-R15) |
| `npm run test` | vitest: un proyecto por workspace + el test de límites (`scripts/lint/boundaries.test.ts`) |
| `npm run validate:content` | centinela hasta F1.2 (todavía no hay `content/`) |
| `npm run check:budgets` | centinela hasta F1.1b (todavía no hay `scripts/budgets/budgets.json`) |
| `npm run build` | `tsc -b` + `vite build` de `apps/web` (build de desarrollo, 03 §8.3) |

Un `npm run lint` rojo por un límite de módulos es un bloqueante, no una advertencia (03 §4.3.2).

## Dónde está cada cosa

El árbol completo es `docs/03-arquitectura.md` §4.2 y la única fuente de rutas es §4.2.1.
Lo que existe hoy (F1.1a):

| Ruta | Qué es |
|---|---|
| `apps/web` (`@lg/web`) | cliente Vite + React + TS. `src/main.tsx`, `App.tsx`, `boot/` = raíz de composición. Las carpetas `ui/`, `world/`, `services/`, `state/`, `dev/`, `teacher/`, `i18n/` tienen solo marcadores para que el lint sea testeable |
| `apps/server` (`@lg/server`) | servidor Node + TS (esqueleto; `/health` llega en F1.1b) |
| `packages/core` (`@lg/core`) | TS puro: sin DOM, sin Node, sin React/three/zustand, sin `Date.now()`/`Math.random()` |
| `packages/protocol` (`@lg/protocol`) | mensajes y DTOs (solo zod) |
| `packages/content-schema` (`@lg/content-schema`) | schemas y compilador de contenido (F1.2) |
| `tooling/` | reservado para el modo director (FD0); no es workspace |
| `eslint.config.js` | copia literal de `03` §4.3.1 |
| `scripts/lint/boundaries.test.ts` | prueba cada celda prohibida de `03` §4.3 por la API de ESLint (`lintText` con `filePath` virtual) |

Alias de `apps/web`: `@ui/*`, `@world/*`, `@state/*`, `@services/*`, `@i18n/*`, `@teacher/*`.

## Reglas para las corridas

- Las corridas no hacen `git add`, `commit`, `push` ni abren PRs (D-024): trabajan en una rama
  `feat/F<n>-<slug>` y el operador commitea después de un `verify` verde.
- Nunca leer ni commitear `.env`; `.env.example` tiene solo nombres de variables (`LG_*`).
- Sin Playwright ni navegador automatizado (D-016).
