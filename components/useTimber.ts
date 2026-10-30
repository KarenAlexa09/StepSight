"use client";

import { useRef, useState } from "react";
import { getSettings } from "../lib/settings";
import type { Intent } from "../lib/spark";
import { useDictation } from "./useDictation";

const lines = new Map<string, string>();

export type StepContext = { instruction: string; parts: string[] };

export function useTimber(onIntent: (intent: Intent) => void, step?: StepContext) {
  const audio = useRef<HTMLAudioElement | null>(null);
  const turn = useRef(0);
  const [thinking, setThinking] = useState(false);
  const [heard, setHeard] = useState("");

  async function say(text: string) {
    if (!getSettings().sound || !text) return;
    const mine = ++turn.current;
    audio.current?.pause();
    try {
      let url = lines.get(text);
      if (!url) {
        const res = await fetch("/api/speak", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ text }),
        });
        if (!res.ok) return;
        url = URL.createObjectURL(await res.blob());
        lines.set(text, url);
      }
      if (mine !== turn.current || !getSettings().sound) return;
      audio.current = new Audio(url);
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
        body: JSON.stringify({ said, step, lang: getSettings().lang }),
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

  const dictation = useDictation(ask, setHeard);

  return { say, ask, listen: dictation.toggle, listening: dictation.listening, thinking: thinking || dictation.transcribing, heard };
}
