// ModerationProvider (03 §5.10: adapter interface in providers/; 03 §7.7 "classifier" layer). The server passes it
// a text (player input or NPC output) and receives a verdict. F4.2 brings the interface
// (null: no classifier configured, the layer does not run) and the test fake. A real adapter (moderation
// provider, DP-A05) needs a key and authorization (D-027): deferred.

export type ModerationDirection = "input" | "output";
export type ModerationVerdict = "ok" | "inappropriate" | "risk";

export interface ModerationProvider {
  readonly id: string;
  /** A rejection = the classifier failed (moderation cuts, it does not let through). */
  classify(text: string, direction: ModerationDirection): Promise<ModerationVerdict>;
}

