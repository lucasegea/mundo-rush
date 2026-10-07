# ADR-014 — Un proceso Node + Postgres (hoy: modo operador local)

- **Estado:** Propuesto (D-088: contrato hasta que el operador decida) · enmendado (P0)
- **Fecha:** 2026-10-06 (decisión, `03` §11) · copiado a `docs/adr/` el 2026-10-07 (F1.1b)
- **Fuente:** `docs/03-arquitectura.md` §11 (estado en la tabla de `03`: Propuesto)

## Decisión

Un proceso Node (estático + API + WS + jobs) y Postgres administrado con migraciones SQL a mano verificadas; auth propia con login de clase para menores (§7)

## Alternativas descartadas

Supabase Auth (exige email), Firebase, archivos JSON (como LT)

## Qué se resigna

Auth gestionada por terceros

## Enmendado (P0)

Enmienda de "cómo" de `docs/reports/P0-2026-10-06.md` §1, aceptada por el default de D-196. No cambia la decisión.

Postgres llega con F11.1 (postergada, D-135). Hasta entonces: servidor local en `127.0.0.1`, modo operador sin login (`LG_OPERATOR_MODE=1`, D-158), almacenes detrás de interfaces con adaptador de archivo (D-157). Cloud Run (D-102) no aplica mientras el juego sea del operador.

## Cómo se cambia

Un cambio a esta decisión entra como ADR nuevo con el número siguiente (D-088); este archivo no se reescribe.
