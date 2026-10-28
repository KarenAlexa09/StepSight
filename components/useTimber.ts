"use client";

import { useRef, useState } from "react";
import type { Intent } from "../lib/spark";
import { recordingToWav } from "../lib/wav";

const MAX_RECORDING_MS = 5000;

export type StepContext = { instruction: string; parts: string[] };

export function useTimber(onIntent: (intent: Intent) => void, step?: StepContext) {
  const audio = useRef<HTMLAudioElement | null>(null);
  const recorder = useRef<MediaRecorder | null>(null);
  const mutedRef = useRef(false);
  const [muted, setMutedState] = useState(false);
  const [listening, setListening] = useState(false);
  const [thinking, setThinking] = useState(false);
  const [heard, setHeard] = useState("");

  function setMuted(value: boolean) {
    mutedRef.current = value;
    setMutedState(value);
    if (value) audio.current?.pause();
  }

  async function say(text: string) {
    if (mutedRef.current || !text) return;
    try {
      const res = await fetch("/api/speak", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text }),
      });
      if (!res.ok || mutedRef.current) return;
      audio.current?.pause();
      audio.current = new Audio(URL.createObjectURL(await res.blob()));
      await audio.current.play();
    } catch {}
  }

  async function ask(said: string) {
    if (!said.trim()) return;
    setHeard(said);
    setThinking(true);
    try {
      const res = await fetch("/api/ask", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ said, step }),
      });
      const intent = await res.json();
      if (!res.ok) throw new Error(intent.error);
      onIntent(intent);
    } catch (error) {
      setHeard(error instanceof Error && error.message ? error.message : "Timber didn't get that");
    } finally {
      setThinking(false);
    }
  }

  async function listen() {
    if (recorder.current?.state === "recording") {
      recorder.current.stop();
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const chunks: Blob[] = [];
      const rec = new MediaRecorder(stream);
      recorder.current = rec;
      rec.ondataavailable = (e) => chunks.push(e.data);
      rec.onstop = async () => {
        stream.getTracks().forEach((t) => t.stop());
        setListening(false);
        setThinking(true);
        try {
          const form = new FormData();
          form.append("audio", await recordingToWav(new Blob(chunks, { type: rec.mimeType })), "said.wav");
          const res = await fetch("/api/transcribe", { method: "POST", body: form });
          const data = await res.json();
          if (!res.ok) throw new Error(data.error);
          if (data.transcript) await ask(data.transcript);
          else setHeard("Didn't catch that");
        } catch (error) {
          setHeard(error instanceof Error && error.message ? error.message : "Couldn't hear that");
        } finally {
          setThinking(false);
        }
      };
      rec.start();
      setListening(true);
      setTimeout(() => rec.state === "recording" && rec.stop(), MAX_RECORDING_MS);
    } catch {
      setHeard("Allow the microphone to talk to Timber");
    }
  }

  return { say, ask, listen, listening, thinking, heard, muted, setMuted };
}
