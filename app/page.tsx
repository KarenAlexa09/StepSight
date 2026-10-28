"use client";

import { useEffect, useRef, useState, type CSSProperties, type FormEvent } from "react";
import type { Match } from "../lib/sam";

const MAX_WIDTH = 768;
const SAMPLE_WIDTH = 32;
const SAMPLE_HEIGHT = 24;
// shortcut: thresholds set by eye; recalibrate on the demo phone and lighting.
const MOVED = 22;
const STEADY = 6;
const STEADY_TICKS = 4;

const PARTICLES: [number, number, string][] = [
  [-16, -12, "#E4FF3A"],
  [18, -10, "#E4FF3A"],
  [-20, 6, "#E4FF3A"],
  [22, 8, "#E4FF3A"],
  [-6, -18, "#FFA8A0"],
  [8, 17, "#E4FF3A"],
  [2, -20, "#C9C3F5"],
  [-12, 16, "#C9C3F5"],
];

type Shot = { image: string; width: number; height: number };
type Snapshot = Shot & { matches: Match[]; key: number; reference: Uint8ClampedArray | null };

function difference(a: Uint8ClampedArray, b: Uint8ClampedArray) {
  let sum = 0;
  for (let i = 0; i < a.length; i += 4) sum += Math.abs(a[i] + a[i + 1] + a[i + 2] - b[i] - b[i + 1] - b[i + 2]) / 3;
  return sum / (a.length / 4);
}

function maskTransform(m: Match) {
  const { left, top, right, bottom } = m.bounds;
  return `translate(${left} ${top}) scale(${(right - left) / m.size[0]} ${(bottom - top) / m.size[1]})`;
}

export default function Home() {
  const videoRef = useRef<HTMLVideoElement>(null);
  const photoRef = useRef<HTMLImageElement>(null);
  const sampler = useRef<CanvasRenderingContext2D | null>(null);
  const lastSample = useRef<Uint8ClampedArray | null>(null);
  const steadyTicks = useRef(0);
  const busy = useRef(false);
  const [photo, setPhoto] = useState<string | null>(null);
  const [cameraError, setCameraError] = useState(false);
  const [prompt, setPrompt] = useState("red piece");
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null);
  const [searching, setSearching] = useState(false);
  const [moving, setMoving] = useState(false);
  const [status, setStatus] = useState("Point the camera at your parts");
  const [live, setLive] = useState(false);

  useEffect(() => {
    let stream: MediaStream | undefined;
    if (!navigator.mediaDevices) {
      setCameraError(true);
      return;
    }
    navigator.mediaDevices
      .getUserMedia({ video: { facingMode: "environment", width: { ideal: 1280 } }, audio: false })
      .then((s) => {
        stream = s;
        if (videoRef.current) videoRef.current.srcObject = s;
      })
      .catch(() => setCameraError(true));
    return () => stream?.getTracks().forEach((t) => t.stop());
  }, []);

  function sample() {
    const video = videoRef.current;
    if (!video?.videoWidth) return null;
    if (!sampler.current) {
      const canvas = document.createElement("canvas");
      canvas.width = SAMPLE_WIDTH;
      canvas.height = SAMPLE_HEIGHT;
      sampler.current = canvas.getContext("2d", { willReadFrequently: true });
    }
    sampler.current!.drawImage(video, 0, 0, SAMPLE_WIDTH, SAMPLE_HEIGHT);
    return sampler.current!.getImageData(0, 0, SAMPLE_WIDTH, SAMPLE_HEIGHT).data;
  }

  function capture(): Shot | null {
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
    return { image: canvas.toDataURL("image/jpeg", 0.85), width: canvas.width, height: canvas.height };
  }

  async function find() {
    if (busy.current) return;
    setSnapshot(null);
    const shot = capture();
    if (!shot) {
      setStatus(photo ? "Image isn't ready yet" : "Camera isn't ready yet");
      return;
    }
    const reference = photo ? null : sample();
    busy.current = true;
    setSearching(true);
    setMoving(false);
    setStatus(`Looking for ${prompt}…`);
    try {
      const res = await fetch("/api/segment", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ image: shot.image, prompt }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      const seconds = (data.ms / 1000).toFixed(1);
      if (data.matches.length === 0) {
        setStatus(`No match · ${seconds} s`);
        return;
      }
      setSnapshot({ ...shot, matches: data.matches, key: Date.now(), reference });
      setStatus(`Found ${data.matches.length > 1 ? data.matches.length : "it"} · ${seconds} s`);
    } catch (error) {
      setLive(false);
      setStatus(error instanceof Error && error.message ? error.message : "Something went wrong");
    } finally {
      busy.current = false;
      setSearching(false);
    }
  }

  useEffect(() => {
    if (photo || cameraError) return;
    const id = setInterval(() => {
      const current = sample();
      if (!current) return;
      const previous = lastSample.current;
      lastSample.current = current;

      if (snapshot?.reference) {
        if (difference(snapshot.reference, current) > MOVED) {
          setSnapshot(null);
          setMoving(true);
          setStatus("Hold steady…");
          steadyTicks.current = 0;
        }
        return;
      }

      steadyTicks.current = previous && difference(previous, current) < STEADY ? steadyTicks.current + 1 : 0;
      if (steadyTicks.current >= STEADY_TICKS) {
        steadyTicks.current = 0;
        setMoving(false);
        if (live) find();
      }
    }, 250);
    return () => clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [photo, cameraError, snapshot, live, prompt]);

  function onPhoto(file: File | undefined) {
    if (!file) return;
    setLive(false);
    setSnapshot(null);
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

      <div className={`stage${snapshot ? " frozen" : ""}`}>
        {photo ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img ref={photoRef} src={photo} alt="Your uploaded photo" className="media" />
        ) : (
          <video ref={videoRef} autoPlay playsInline muted className="media" style={{ opacity: snapshot ? 0 : 1 }} />
        )}
        {snapshot && !photo && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={snapshot.image} alt="Snapshot of your parts" className="media" />
        )}
        {searching && <span className="scan" aria-hidden="true" />}
        {snapshot && <FoundIt key={snapshot.key} snapshot={snapshot} />}
        {moving && !snapshot && <p className="steady">Hold steady…</p>}
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
        {live && <p className="tip">Hold the phone still for a second to search.</p>}
      </form>
    </main>
  );
}

function FoundIt({ snapshot }: { snapshot: Snapshot }) {
  const { width, height, matches, image, key } = snapshot;
  const first = matches[0];
  const { left, top, right, bottom } = first.bounds;
  const cx = (left + right) / 2;
  const cy = (top + bottom) / 2;
  const unit = Math.max(width, height) / 100;
  const scale = Math.max(1, Math.min(2.2, (width * 0.6) / (right - left), (height * 0.45) / (bottom - top)));
  const lift = {
    "--dx": `${width / 2 - cx}px`,
    "--dy": `${height * 0.42 - cy}px`,
    "--s": scale,
    transformOrigin: `${cx}px ${cy}px`,
  } as CSSProperties;
  const pad = unit * 1.5;

  return (
    <>
      <span className="flash fx" aria-hidden="true" />
      <svg className="media overlay" viewBox={`0 0 ${width} ${height}`} aria-hidden="true">
        <defs>
          <clipPath id={`cut-${key}`}>
            <path d={first.path} transform={maskTransform(first)} />
          </clipPath>
        </defs>
        {matches.map((m) => (
          <path key={m.id} d={m.path} transform={maskTransform(m)} className="mask" vectorEffect="non-scaling-stroke" />
        ))}
        <rect
          className="ring"
          x={left - pad}
          y={top - pad}
          width={right - left + pad * 2}
          height={bottom - top + pad * 2}
          rx={pad}
          vectorEffect="non-scaling-stroke"
        />
        <rect className="dim fx" width={width} height={height} />
        <g className="lift fx" style={lift}>
          <image href={image} width={width} height={height} clipPath={`url(#cut-${key})`} />
          <path d={first.path} transform={maskTransform(first)} className="cut-outline" vectorEffect="non-scaling-stroke" />
        </g>
        {PARTICLES.map(([dx, dy, color], i) => (
          <circle
            key={i}
            className="particle fx"
            cx={cx}
            cy={cy}
            r={unit * (i % 3 ? 1 : 1.6)}
            fill={color}
            vectorEffect="non-scaling-stroke"
            style={{ "--dx": `${dx * unit}px`, "--dy": `${dy * unit}px`, animationDelay: `${0.15 + i * 0.02}s` } as CSSProperties}
          />
        ))}
      </svg>
      <p className="grab fx">grab this one!</p>
    </>
  );
}
