"use client";

import { useRef, useState } from "react";
import { play } from "../lib/sound";
import { recordingToWav } from "../lib/wav";

// shortcut: stops after a fixed time or when tapped again, not on silence; add voice-activity detection if people forget to stop.
export function useDictation(onText: (text: string) => void | Promise<void>, onError: (message: string) => void, maxMs = 5000) {
  const recorder = useRef<MediaRecorder | null>(null);
  const [listening, setListening] = useState(false);
  const [transcribing, setTranscribing] = useState(false);

  async function toggle() {
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
        setTranscribing(true);
        try {
          const form = new FormData();
          form.append("audio", await recordingToWav(new Blob(chunks, { type: rec.mimeType })), "said.wav");
          const res = await fetch("/api/transcribe", { method: "POST", body: form });
          const data = await res.json();
          if (!res.ok) throw new Error(data.error);
          if (data.transcript) await onText(data.transcript);
          else onError("Didn't catch that");
        } catch (error) {
          onError(error instanceof Error && error.message ? error.message : "Couldn't hear that");
        } finally {
          setTranscribing(false);
        }
      };
      rec.start();
      play("boop");
      setListening(true);
      setTimeout(() => rec.state === "recording" && rec.stop(), maxMs);
    } catch {
      onError("Allow the microphone to talk to Timber");
    }
  }

  return { toggle, listening, transcribing };
}
