// Servidor Live falso (03 §8.1, P0 §4.2): un WebSocket local en 127.0.0.1 que habla el formato de cable de la Live API
// (setup → setupComplete, activityStart/audio/activityEnd, clientContent, serverContent con transcripciones, audio y
// turnComplete, usageMetadata, goAway, sessionResumptionUpdate) con respuestas guionadas. Sin red externa, sin clave
// real, sin API paga (D-027).
import type { AddressInfo } from "node:net";
import { WebSocketServer, type WebSocket } from "ws";

export interface ScriptedReply {
  /** Pedazos de la transcripción de entrada (inputTranscription), uno por mensaje. Vacío en respuestas a una nota. */
  player: readonly string[];
  /** Transcripción de salida del NPC (outputTranscription). */
  npc: string;
  /** Muestras PCM16 del audio del NPC (24 kHz). */
  audio: readonly number[];
  usage?: { audioIn: number; audioOut: number; textIn: number; textOut: number };
}

export interface FakeLiveConnection {
  socket: WebSocket;
  /** Mensajes recibidos, ya parseados. */
  received: Record<string, unknown>[];
  url: string;
  closed: boolean;
  closeCode: number | null;
}

export interface FakeLiveServer {
  url: string;
  connections: FakeLiveConnection[];
  /** Manda goAway por la última conexión. */
  goAway(timeLeft?: string): void;
  /** Corta la última conexión del lado del servidor (código 1011). */
  drop(): void;
  /** Espera hasta que haya `n` conexiones con setup completo. */
  untilConnections(n: number): Promise<void>;
  close(): Promise<void>;
}

export interface FakeLiveOptions {
  replies?: readonly ScriptedReply[];
  /** No contesta setupComplete: cierra la conexión (sesión que no abre). */
  refuseSetup?: boolean;
  /** Handle de reanudación que anuncia; null: no anuncia ninguno. */
  resumeHandle?: string | null;
}

export const DEFAULT_REPLY: ScriptedReply = {
  player: ["Hello,", " I'm Nico."], npc: "Nice to meet you, Nico!", audio: [100, -100, 200, -200],
  usage: { audioIn: 75, audioOut: 150, textIn: 1500, textOut: 0 },
};

const pcmBase64 = (samples: readonly number[]): string => {
  const buf = Buffer.alloc(samples.length * 2);
  samples.forEach((v, i) => buf.writeInt16LE(v, i * 2));
  return buf.toString("base64");
};

export async function startFakeLiveServer(opts: FakeLiveOptions = {}): Promise<FakeLiveServer> {
  const wss = new WebSocketServer({ host: "127.0.0.1", port: 0 });
  await new Promise<void>((done) => wss.once("listening", () => done()));
  const port = (wss.address() as AddressInfo).port;
  const connections: FakeLiveConnection[] = [];
  const handle = opts.resumeHandle === undefined ? "resume-1" : opts.resumeHandle;
  let replyIndex = 0;
  let ready = 0;
  let waiters: { n: number; done: () => void }[] = [];

  const nextReply = (): ScriptedReply => opts.replies?.[Math.min(replyIndex++, opts.replies.length - 1)] ?? DEFAULT_REPLY;

  function reply(ws: WebSocket, r: ScriptedReply, withPlayer: boolean): void {
    const send = (m: unknown): void => ws.send(JSON.stringify(m));
    if (withPlayer) for (const p of r.player) send({ serverContent: { inputTranscription: { text: p } } });
    send({ serverContent: { outputTranscription: { text: r.npc } } });
    send({ serverContent: { modelTurn: { parts: [{ inlineData: { mimeType: "audio/pcm;rate=24000", data: pcmBase64(r.audio) } }] } } });
    send({ serverContent: { turnComplete: true } });
    const u = r.usage ?? DEFAULT_REPLY.usage;
    if (u) {
      send({
        usageMetadata: {
          promptTokensDetails: [{ modality: "AUDIO", tokenCount: u.audioIn }, { modality: "TEXT", tokenCount: u.textIn }],
          responseTokensDetails: [{ modality: "AUDIO", tokenCount: u.audioOut }, { modality: "TEXT", tokenCount: u.textOut }],
        },
      });
    }
  }

  wss.on("connection", (ws, req) => {
    const conn: FakeLiveConnection = { socket: ws, received: [], url: req.url ?? "", closed: false, closeCode: null };
    connections.push(conn);
    ws.on("close", (code) => {
      conn.closed = true;
      conn.closeCode = code;
    });
    ws.on("message", (data) => {
      const msg = JSON.parse(data.toString()) as Record<string, unknown>;
      conn.received.push(msg);
      if (msg["setup"]) {
        if (opts.refuseSetup) return ws.close(1008, "setup refused");
        ws.send(JSON.stringify({ setupComplete: {} }));
        if (handle) ws.send(JSON.stringify({ sessionResumptionUpdate: { newHandle: handle, resumable: true } }));
        ready++;
        const hits = waiters.filter((w) => ready >= w.n);
        waiters = waiters.filter((w) => !hits.includes(w));
        hits.forEach((w) => w.done());
        return;
      }
      const ri = msg["realtimeInput"] as Record<string, unknown> | undefined;
      if (ri?.["activityEnd"]) return reply(ws, nextReply(), true);
      const cc = msg["clientContent"] as { turnComplete?: boolean } | undefined;
      if (cc?.turnComplete) reply(ws, nextReply(), false);
    });
  });

  const last = (): FakeLiveConnection | undefined => connections[connections.length - 1];
  return {
    url: `ws://127.0.0.1:${port}/live`,
    connections,
    goAway(timeLeft = "10s") {
      last()?.socket.send(JSON.stringify({ goAway: { timeLeft } }));
    },
    drop() {
      last()?.socket.close(1011, "upstream fault");
    },
    untilConnections: (n) => (ready >= n ? Promise.resolve() : new Promise((done) => waiters.push({ n, done }))),
    close: () => new Promise<void>((done) => {
      for (const c of wss.clients) c.terminate();
      wss.close(() => done());
    }),
  };
}

/** Mensajes de un tipo (la clave de primer nivel: setup, realtimeInput, clientContent). */
export const receivedOf = (c: FakeLiveConnection, key: string): Record<string, unknown>[] =>
  c.received.filter((m) => key in m).map((m) => m[key] as Record<string, unknown>);
