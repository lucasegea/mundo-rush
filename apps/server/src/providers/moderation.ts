// ModerationProvider (03 §5.10: interfaz de adaptador en providers/; 03 §7.7 capa "clasificador"). El servidor le pasa
// un texto (entrada del jugador o salida del NPC) y recibe un veredicto. F4.2 trae la interfaz
// (null: sin clasificador configurado, la capa no corre) y el falso de los tests. Un adaptador real (proveedor de
// moderación, DP-A05) necesita clave y autorización (D-027): queda diferido.

export type ModerationDirection = "input" | "output";
export type ModerationVerdict = "ok" | "inappropriate" | "risk";

export interface ModerationProvider {
  readonly id: string;
  /** Un rechazo = el clasificador falló (la moderación corta, no deja pasar). */
  classify(text: string, direction: ModerationDirection): Promise<ModerationVerdict>;
}

