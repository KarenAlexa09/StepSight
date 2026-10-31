"use client";

import { useRef, useState } from "react";
import { tr } from "../lib/i18n";
import { play } from "../lib/sound";
import { RATE, recordingToWav } from "../lib/wav";

// Packs mic audio into 80 ms chunks of 16-bit PCM for the live relay.
const WORKLET = `registerProcessor("pcm", class extends AudioWorkletProcessor {
  buf = new Int16Array(1920); n = 0;
  process([input]) {
    for (const s of input[0] ?? []) {
      this.buf[this.n++] = Math.max(-1, Math.min(1, s)) * 0x7fff;
      if (this.n === this.buf.length) { this.port.postMessage(this.buf.buffer, [this.buf.buffer]); this.buf = new Int16Array(1920); this.n = 0; }
    }
    return true;
  }
});`;

export function relayUrl() {
  const url = process.env.NEXT_PUBLIC_VOICE_URL;
  if (url !== "auto") return url;
  return `${location.protocol === "https:" ? "wss" : "ws"}://${location.hostname}:3001`;
}

function connect(url: string): Promise<WebSocket> {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(url);
    const timer = setTimeout(() => (ws.close(), reject(new Error("timeout"))), 2500);
    ws.onopen = () => (clearTimeout(timer), resolve(ws));
    ws.onerror = () => (clearTimeout(timer), reject(new Error("relay")));
  });
}

// Live mode (relay running): words show while you talk and it sends itself after ~1 s of silence.
// Fallback: records, then transcribes the whole clip; stops after maxMs or when tapped again.
export function useDictation(onText: (text: string) => void | Promise<void>, onError: (message: string) => void, maxMs = 5000) {
  const stopRef = useRef<(() => void) | null>(null);
  const [listening, setListening] = useState(false);
  const [transcribing, setTranscribing] = useState(false);
  const [live, setLive] = useState("");

  async function toggle() {
    if (stopRef.current) return stopRef.current();
    const url = relayUrl();
    // iPhone Safari only lets audio run if it starts in the tap itself, before any await; later it stays muted.
    const context = url ? new AudioContext({ sampleRate: RATE }) : null;
    context?.resume();
    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true } });
    } catch {
      context?.close();
      return onError(tr("Allow the microphone to talk to Timber"));
    }
    if (url && context) {
      const ws = await connect(url).catch(() => null); // relay down: use the recorded clip instead
      if (ws) {
        try {
          return await streamLive(stream, ws, context);
        } catch {
          ws.close();
        }
      }
      context.close();
    }
    record(stream);
  }

  async function streamLive(stream: MediaStream, ws: WebSocket, context: AudioContext) {
    const module = URL.createObjectURL(new Blob([WORKLET], { type: "text/javascript" }));
    await context.audioWorklet.addModule(module);
    URL.revokeObjectURL(module);
    const node = new AudioWorkletNode(context, "pcm");
    node.port.onmessage = (e) => ws.readyState === WebSocket.OPEN && ws.send(e.data);
    context.createMediaStreamSource(stream).connect(node).connect(context.destination);

    let done = "";
    let partial = "";
    let sent = false;
    const finish = () => {
      if (sent) return;
      sent = true;
      clearTimeout(limit);
      clearTimeout(pause);
      stopRef.current = null;
      stream.getTracks().forEach((t) => t.stop());
      context.close();
      ws.close();
      setListening(false);
      setLive("");
      const text = `${done} ${partial}`.trim();
      if (text) onText(text);
      else onError(tr("Didn't catch that"));
    };
    const stop = () => {
      if (ws.readyState === WebSocket.OPEN) ws.send("end");
      stream.getTracks().forEach((t) => t.stop());
      setTimeout(finish, 1500); // the final words arrive ~0.2 s after "end"
    };
    const limit = setTimeout(stop, Math.max(maxMs, 15000));
    let pause: ReturnType<typeof setTimeout> | undefined;
    ws.onmessage = (e) => {
      const event = JSON.parse(e.data);
      if (event.type === "transcript" && event.transcript) partial = event.transcript;
      if (event.type === "speechStart") clearTimeout(pause);
      if (event.type === "speechComplete") {
        done = `${done} ${event.transcript || partial}`.trim();
        partial = "";
        // Meta ends a turn on short pauses too; wait a beat in case the sentence goes on.
        pause = setTimeout(finish, 900);
      }
      if (event.type === "error") return finish();
      setLive(`${done} ${partial}`.trim());
    };
    ws.onclose = finish;
    stopRef.current = stop;
    play("boop");
    setListening(true);
  }

  function record(stream: MediaStream) {
    const chunks: Blob[] = [];
    const rec = new MediaRecorder(stream);
    rec.ondataavailable = (e) => chunks.push(e.data);
    rec.onstop = async () => {
      stopRef.current = null;
      stream.getTracks().forEach((t) => t.stop());
      setListening(false);
      setTranscribing(true);
      try {
        const form = new FormData();
        form.append("audio", await recordingToWav(new Blob(chunks, { type: rec.mimeType })), "said.wav");
        const res = await fetch("/api/transcribe", { method: "POST", body: form });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error);
        if (data.transcript) await onText(data.transcript);
        else onError(tr("Didn't catch that"));
      } catch (error) {
        onError(error instanceof Error && error.message ? tr(error.message) : tr("Couldn't hear that"));
      } finally {
        setTranscribing(false);
      }
    };
    rec.start();
    stopRef.current = () => rec.state === "recording" && rec.stop();
    play("boop");
    setListening(true);
    setTimeout(() => rec.state === "recording" && rec.stop(), maxMs);
  }

  return { toggle, listening, transcribing, live };
}
