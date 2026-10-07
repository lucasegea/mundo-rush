# ADR-006 — Una sesión de voz por escena

- **Estado:** Propuesto (D-088: contrato hasta que el operador decida) · enmendado (P0)
- **Fecha:** 2026-10-06 (decisión, `03` §11) · copiado a `docs/adr/` el 2026-10-07 (F1.1b)
- **Fuente:** `docs/03-arquitectura.md` §11 (estado en la tabla de `03`: Propuesto)

## Decisión

Una sesión de voz por escena, contexto mínimo, aperturas y cierres guionados fuera de Live, tope 5 min en el servidor (§5.4)

## Alternativas descartadas

Sesión larga con compresión de contexto

## Qué se resigna

Continuidad conversacional larga

## Enmendado (P0)

Enmienda de "cómo" de `docs/reports/P0-2026-10-06.md` §1, aceptada por el default de D-196. No cambia la decisión.

La inyección de la apertura guionada como turno previo y de las notas `[DIRECTOR]` depende de `clientContent` a mitad de sesión. Que se admite durante toda la sesión con roles `user`/`model` está **verificado** en la documentación; que un turno `model` inyectado no dispare generación (`turnComplete: false`) es **supuesto**: test contra el servidor Live falso y prueba real en la sonda.

## Cómo se cambia

Un cambio a esta decisión entra como ADR nuevo con el número siguiente (D-088); este archivo no se reescribe.
