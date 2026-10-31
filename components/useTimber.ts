"use client";

import { useEffect, useRef, useState } from "react";
import { tr } from "../lib/i18n";
import { getSettings } from "../lib/settings";
import type { Intent } from "../lib/spark";
import { useDictation } from "./useDictation";

const lines = new Map<string, string>();

// One shared player, started once inside a tap: iPhone Safari then lets it play
// Timber's later replies, which arrive seconds after the tap and would otherwise be blocked.
const SILENT = "data:audio/wav;base64,UklGRiQAAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YQAAAAA=";
let player: HTMLAudioElement | null = null;
function unlock() {
  if (player) return;
  player = new Audio(SILENT);
  player.play().catch(() => {});
}

export type StepContext = { instruction: string; parts: string[] };

export function useTimber(onIntent: (intent: Intent) => void, step?: StepContext) {
  const turn = useRef(0);
  const [thinking, setThinking] = useState(false);
  const [heard, setHeard] = useState("");
  const [reply, setReply] = useState("");

  useEffect(() => {
    document.addEventListener("pointerdown", unlock, { once: true });
    return () => document.removeEventListener("pointerdown", unlock);
  }, []);

  async function say(text: string) {
    if (!getSettings().sound || !text) return;
    const mine = ++turn.current;
    player?.pause();
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
      player ??= new Audio();
      player.src = url;
      await player.play();
    } catch {}
  }

  async function ask(said: string) {
    if (!said.trim()) return;
    setHeard(said);
    setReply("");
    setThinking(true);
    try {
      const res = await fetch("/api/ask", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ said, step, lang: getSettings().lang }),
      });
      const intent = await res.json();
      if (!res.ok) throw new Error(intent.error);
      setReply(intent.reply ?? "");
      onIntent(intent);
    } catch (error) {
      setHeard(error instanceof Error && error.message ? tr(error.message) : tr("Timber didn't get that"));
    } finally {
      setThinking(false);
    }
  }

  const dictation = useDictation(ask, setHeard);

  function listen() {
    unlock();
    dictation.toggle();
  }

  return { say, ask, listen, listening: dictation.listening, live: dictation.live, thinking: thinking || dictation.transcribing, heard, reply };
}
