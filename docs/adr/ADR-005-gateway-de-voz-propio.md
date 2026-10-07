# ADR-005 — Gateway de voz propio (port de un prototipo de voz anterior)

- **Estado:** Propuesto (D-088: contrato hasta que el operador decida) · enmendado (P0)
- **Fecha:** 2026-10-06 (decisión, `03` §11) · copiado a `docs/adr/` el 2026-10-07 (F1.1b)
- **Fuente:** `docs/03-arquitectura.md` §11 (estado en la tabla de `03`: Propuesto)

## Decisión

Portar módulos de un prototipo de voz anterior a un gateway propio que arma el `setup` en el servidor; sin tokens efímeros en v1; LT queda como laboratorio (§5.2-5.3)

## Alternativas descartadas

Usar LT como servicio; paquete compartido; tokens efímeros directos

## Qué se resigna

Latencia mínima posible; un solo código de voz

## Enmendado (P0)

Enmienda de "cómo" de `docs/reports/P0-2026-10-06.md` §1, aceptada por el default de D-196. No cambia la decisión.

El port tiene que: pedir explícitamente las transcripciones de entrada y de salida (`inputAudioTranscription`/`outputAudioTranscription`), usar actividad manual (`realtimeInputConfig.automaticActivityDetection.disabled` + `activityStart`/`activityEnd`), enmarcar el audio en binario y no loguear contenido (LT loguea los primeros 400 caracteres de cada mensaje no-audio, `setup` incluido). Es más "reescritura con procedencia" que "port"; la estimación de F5.1 lo refleja.

## Cómo se cambia

Un cambio a esta decisión entra como ADR nuevo con el número siguiente (D-088); este archivo no se reescribe.
