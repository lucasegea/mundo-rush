# ADR-004 — Progreso como plegado de eventos de evidencia

- **Estado:** Propuesto (D-088: contrato hasta que el operador decida) · enmendado (P0)
- **Fecha:** 2026-10-06 (decisión, `03` §11) · copiado a `docs/adr/` el 2026-10-07 (F1.1b)
- **Fuente:** `docs/03-arquitectura.md` §11 (estado en la tabla de `03`: Propuesto)

## Decisión

Progreso como plegado de eventos de evidencia emitidos por el servidor; pociones en tercios enteros (§3.5.3)

## Alternativas descartadas

Saldos mutables en la cuenta

## Qué se resigna

Simplicidad inicial; requiere vista materializada

## Enmendado (P0)

Enmienda de "cómo" de `docs/reports/P0-2026-10-06.md` §1, aceptada por el default de D-196. No cambia la decisión.

La fuente de verdad sigue siendo el log de eventos, pero mientras F11 está postergada el log necesita un almacén: interfaz `EvidenceStore` con adaptador de archivo append-only en `apps/server/data/` (D-157). Sin esto, F7 cierra con progreso que se pierde al reiniciar el servidor.

## Cómo se cambia

Un cambio a esta decisión entra como ADR nuevo con el número siguiente (D-088); este archivo no se reescribe.
