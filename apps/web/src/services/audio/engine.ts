// Browser audio engine (F5.2, R13): the client's ONLY AudioContext, the microphone and the playback queue.
// Provenance: an earlier voice prototype (public/index.html, startSession/playPcm16) captures with ScriptProcessor at 16 kHz; here
// capture is an AudioWorklet that wraps dsp/ (40 ms blocks at 16 kHz PCM16) with the AudioContext at its native
// rate, and ScriptProcessor remains only as a fallback if the worklet fails to load. The NPC voice (24 kHz) plays through the queue
// in playback.ts. Loaded via deferred import() with the first voice scene: none of this enters the initial chunk.
import type { MicProblem } from "../../state/slices";
import { createCaptureFramer, type CaptureFrame } from "./dsp";
import { createPlaybackQueue, resumeIfSuspended, type PlaybackContext } from "./playback";
import type { AudioEngine, MicResult } from "./types";
import captureWorkletUrl from "./capture.worklet.ts?worker&url";

/** Same name that capture.worklet.ts registers. */
const CAPTURE_PROCESSOR = "lg-capture";

/** getUserMedia error → why there is no microphone (the HUD says so in plain language). */
export function micProblemOf(err: unknown): MicProblem {
  const name = err instanceof Error || (typeof err === "object" && err !== null && "name" in err) ? String((err as { name: unknown }).name) : "";
  if (name === "NotAllowedError" || name === "SecurityError" || name === "PermissionDeniedError") return "denied";
  if (name === "NotFoundError" || name === "OverconstrainedError" || name === "DevicesNotFoundError") return "noDevice";
  return "failed";
}

export async function createBrowserAudioEngine(): Promise<AudioEngine> {
  const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!Ctor) throw new Error("este navegador no tiene Web Audio");
  const ctx = new Ctor({ latencyHint: "interactive" });
  const drained: (() => void)[] = [];
  const lost: (() => void)[] = [];
  const queue = createPlaybackQueue(ctx as unknown as PlaybackContext, () => drained.forEach((fn) => fn()));
  let stream: MediaStream | null = null;
  const nodes: AudioNode[] = [];
  let closed = false;

  /** Connects capture: AudioWorklet if possible; otherwise ScriptProcessor with the same dsp/. */
  async function connectCapture(source: MediaStreamAudioSourceNode, onFrame: (f: CaptureFrame) => void): Promise<void> {
    // Muted output to the destination: some browsers do not process a node that is not connected to anything.
    const sink = ctx.createGain();
    sink.gain.value = 0;
    sink.connect(ctx.destination);
    nodes.push(sink);
    try {
      await ctx.audioWorklet.addModule(captureWorkletUrl);
      const node = new AudioWorkletNode(ctx, CAPTURE_PROCESSOR, { numberOfInputs: 1, numberOfOutputs: 1, channelCount: 1, channelCountMode: "explicit" });
      node.port.onmessage = (e: MessageEvent<CaptureFrame>) => onFrame({ pcm: e.data.pcm, rms: e.data.rms });
      source.connect(node);
      node.connect(sink);
      nodes.push(node);
    } catch (err) {
      console.warn("[audio] el AudioWorklet de captura no cargó; uso ScriptProcessor:", err instanceof Error ? err.message : err);
      const framer = createCaptureFramer({ sourceRate: ctx.sampleRate });
      const sp = ctx.createScriptProcessor(2048, 1, 1);
      sp.onaudioprocess = (e) => {
        for (const f of framer.push(e.inputBuffer.getChannelData(0))) onFrame(f);
      };
      source.connect(sp);
      sp.connect(sink);
      nodes.push(sp);
    }
  }

  return {
    async startMic(onFrame): Promise<MicResult> {
      const media = typeof navigator !== "undefined" ? navigator.mediaDevices : undefined;
      if (!media?.getUserMedia || !ctx.audioWorklet) return { ok: false, problem: "unsupported" };
      try {
        stream = await media.getUserMedia({ audio: { channelCount: 1, echoCancellation: true, noiseSuppression: true, autoGainControl: true } });
      } catch (err) {
        return { ok: false, problem: micProblemOf(err) };
      }
      if (closed) {
        stream.getTracks().forEach((t) => t.stop());
        return { ok: false, problem: "failed" };
      }
      const track = stream.getAudioTracks()[0];
      if (!track) return { ok: false, problem: "noDevice" };
      track.onended = () => lost.forEach((fn) => fn());
      const source = ctx.createMediaStreamSource(stream);
      nodes.push(source);
      await connectCapture(source, onFrame);
      ctx.resume().catch(() => {});
      return { ok: true };
    },
    resume() {
      if (ctx.state === "suspended") ctx.resume().catch(() => {});
    },
    play(pcm16, sampleRate) {
      if (closed) return;
      // A suspended AudioContext does not advance (no gesture yet, or suspended by the browser): the queue never drains
      // and the client would stay "playing" forever. We try to resume here; the service also has a watchdog.
      resumeIfSuspended(ctx);
      queue.push(pcm16, sampleRate);
    },
    stopPlayback() {
      queue.stop();
    },
    onDrained(fn) {
      drained.push(fn);
    },
    onMicLost(fn) {
      lost.push(fn);
    },
    close() {
      if (closed) return;
      closed = true;
      queue.stop();
      stream?.getTracks().forEach((t) => t.stop());
      for (const n of nodes) n.disconnect();
      ctx.close().catch(() => {});
    },
  };
}
