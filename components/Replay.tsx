"use client";

import { useEffect, useState } from "react";

const FRAME_MS = 450;

export default function Replay({ frames }: { frames: string[] }) {
  const [index, setIndex] = useState(0);
  const [playing, setPlaying] = useState(true);

  useEffect(() => {
    if (!playing || frames.length < 2 || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const id = setInterval(() => setIndex((i) => (i + 1) % frames.length), FRAME_MS);
    return () => clearInterval(id);
  }, [playing, frames.length]);

  if (!frames.length) return null;

  return (
    <section className="replay" aria-label="Build replay">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={frames[Math.min(index, frames.length - 1)]} alt={`Step ${index + 1} of your build`} />
      <span className="chip">Build replay</span>
      <button type="button" className="round play" aria-label={playing ? "Pause replay" : "Play replay"} onClick={() => setPlaying((p) => !p)}>
        {playing ? "❚❚" : "▶"}
      </button>
      <span className="replay-bar" aria-hidden="true">
        <span style={{ width: `${((index + 1) / frames.length) * 100}%` }} />
      </span>
    </section>
  );
}
