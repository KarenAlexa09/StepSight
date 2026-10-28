"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import type { Match } from "../lib/sam";

const MAX_WIDTH = 768;

type Frame = { width: number; height: number };

export default function Home() {
  const videoRef = useRef<HTMLVideoElement>(null);
  const photoRef = useRef<HTMLImageElement>(null);
  const busy = useRef(false);
  const [photo, setPhoto] = useState<string | null>(null);
  const [cameraError, setCameraError] = useState(false);
  const [prompt, setPrompt] = useState("red piece");
  const [frame, setFrame] = useState<Frame | null>(null);
  const [matches, setMatches] = useState<Match[]>([]);
  const [status, setStatus] = useState("Point the camera at your parts");
  const [live, setLive] = useState(false);

  useEffect(() => {
    let stream: MediaStream | undefined;
    navigator.mediaDevices
      ?.getUserMedia({ video: { facingMode: "environment", width: { ideal: 1280 } }, audio: false })
      .then((s) => {
        stream = s;
        if (videoRef.current) videoRef.current.srcObject = s;
      })
      .catch(() => setCameraError(true));
    if (!navigator.mediaDevices) setCameraError(true);
    return () => stream?.getTracks().forEach((t) => t.stop());
  }, []);

  function capture() {
    const source = photo ? photoRef.current : videoRef.current;
    if (!source) return null;
    const width = source instanceof HTMLVideoElement ? source.videoWidth : source.naturalWidth;
    const height = source instanceof HTMLVideoElement ? source.videoHeight : source.naturalHeight;
    if (!width || !height) return null;
    const scale = Math.min(1, MAX_WIDTH / width);
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(width * scale);
    canvas.height = Math.round(height * scale);
    canvas.getContext("2d")!.drawImage(source, 0, 0, canvas.width, canvas.height);
    return { image: canvas.toDataURL("image/jpeg", 0.8), width: canvas.width, height: canvas.height };
  }

  async function find() {
    if (busy.current) return;
    const shot = capture();
    if (!shot) {
      setStatus(photo ? "Image isn't ready yet" : "Camera isn't ready yet");
      return;
    }
    busy.current = true;
    setStatus(`Looking for "${prompt}"…`);
    try {
      const res = await fetch("/api/segment", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ image: shot.image, prompt }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setFrame({ width: shot.width, height: shot.height });
      setMatches(data.matches);
      const count = data.matches.length;
      setStatus(`${count === 0 ? "No match" : count === 1 ? "Found it" : `Found ${count}`} · ${(data.ms / 1000).toFixed(1)} s`);
    } catch (error) {
      setLive(false);
      setStatus(error instanceof Error && error.message ? error.message : "Something went wrong");
    } finally {
      busy.current = false;
    }
  }

  useEffect(() => {
    if (!live) return;
    let stopped = false;
    (async () => {
      while (!stopped) await find();
    })();
    return () => {
      stopped = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [live]);

  function onPhoto(file: File | undefined) {
    if (!file) return;
    setLive(false);
    setMatches([]);
    setPhoto(URL.createObjectURL(file));
    setStatus("Photo loaded. Name a part and tap Find");
  }

  function onSubmit(event: FormEvent) {
    event.preventDefault();
    find();
  }

  return (
    <main className="screen">
      <header className="top">
        <span className="brand">StepSight</span>
        <span className="chip" role="status">
          {status}
        </span>
      </header>

      <div className="stage">
        {photo ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img ref={photoRef} src={photo} alt="Your uploaded photo" className="media" />
        ) : (
          <video ref={videoRef} autoPlay playsInline muted className="media" />
        )}
        {frame && (
          <svg className="media overlay" viewBox={`0 0 ${frame.width} ${frame.height}`} aria-hidden="true">
            {matches.map((m) => (
              <svg
                key={m.id}
                x={m.bounds.left}
                y={m.bounds.top}
                width={m.bounds.right - m.bounds.left}
                height={m.bounds.bottom - m.bounds.top}
                viewBox={`0 0 ${m.size[0]} ${m.size[1]}`}
                preserveAspectRatio="none"
                overflow="visible"
              >
                <path d={m.path} className="mask" vectorEffect="non-scaling-stroke" />
              </svg>
            ))}
          </svg>
        )}
        {cameraError && !photo && <p className="hint">No camera here. Upload a photo instead.</p>}
      </div>

      <form className="controls" onSubmit={onSubmit}>
        <label className="field">
          <span>Part to find</span>
          <input value={prompt} onChange={(e) => setPrompt(e.target.value)} maxLength={80} required />
        </label>
        <div className="row">
          <button type="submit" className="primary">
            Find
          </button>
          <button
            type="button"
            className="secondary"
            aria-pressed={live}
            onClick={() => setLive((v) => !v)}
            disabled={!!photo}
          >
            {live ? "Stop" : "Live"}
          </button>
          <label className="secondary upload">
            Photo
            <input type="file" accept="image/*" onChange={(e) => onPhoto(e.target.files?.[0])} />
          </label>
        </div>
      </form>
    </main>
  );
}
