"use client";

import { useEffect, useRef, useState } from "react";
import { getSettings, useSettings } from "../lib/settings";
import { onSound } from "../lib/sound";
import { relayUrl } from "./useDictation";

export default function Shell() {
  const settings = useSettings();
  const [label, setLabel] = useState("");
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);

  useEffect(() => {
    const root = document.documentElement;
    root.classList.toggle("slow", settings.slow);
    root.classList.toggle("big", settings.big);
    root.lang = settings.lang;
  }, [settings.slow, settings.big, settings.lang]);

  // A free relay sleeps after 15 idle minutes and takes ~1 min to wake: knock as soon as the app opens.
  useEffect(() => {
    const url = relayUrl();
    if (url) fetch(url.replace(/^ws/, "http"), { mode: "no-cors" }).catch(() => {});
  }, []);

  useEffect(
    () =>
      onSound((text) => {
        if (!getSettings().captions) return;
        setLabel(text);
        clearTimeout(timer.current);
        timer.current = setTimeout(() => setLabel(""), 1100);
      }),
    [],
  );

  return label ? (
    <span className="sound-cap" role="status">
      {label}
    </span>
  ) : null;
}
