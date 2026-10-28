"use client";

import { useEffect, useRef, useState } from "react";
import { getSettings, useSettings } from "../lib/settings";
import { onSound } from "../lib/sound";

export default function Shell() {
  const settings = useSettings();
  const [label, setLabel] = useState("");
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);

  useEffect(() => {
    const root = document.documentElement;
    root.classList.toggle("slow", settings.slow);
    root.classList.toggle("big", settings.big);
  }, [settings.slow, settings.big]);

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
