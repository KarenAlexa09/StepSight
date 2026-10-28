"use client";

import { useEffect, useImperativeHandle, useRef, useState, type CSSProperties, type Ref } from "react";
import { maskTransform, toShot, type Shot } from "../lib/image";
import type { Match } from "../lib/sam";

const SAMPLE_WIDTH = 32;
const SAMPLE_HEIGHT = 24;
// shortcut: thresholds set by eye; recalibrate on the demo phone and lighting.
const MOVED = 30;
const MOVED_TICKS = 6;
const MIN_SNAPSHOT_MS = 4000;
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

type Snapshot = Shot & { matches: Match[]; key: number; reference: Uint8ClampedArray | null };

export type CameraHandle = {
  find: (target: string) => Promise<number>;
  capture: () => Shot | null;
  loadPhoto: (file: File) => void;
};

function difference(a: Uint8ClampedArray, b: Uint8ClampedArray) {
  let sum = 0;
  for (let i = 0; i < a.length; i += 4) sum += Math.abs(a[i] + a[i + 1] + a[i + 2] - b[i] - b[i + 1] - b[i + 2]) / 3;
  return sum / (a.length / 4);
}

export default function CameraStage({
  ref,
  live,
  autoTarget,
  onStatus,
}: {
  ref: Ref<CameraHandle>;
  live: boolean;
  autoTarget: string;
  onStatus: (status: string) => void;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const photoRef = useRef<HTMLImageElement>(null);
  const sampler = useRef<CanvasRenderingContext2D | null>(null);
  const lastSample = useRef<Uint8ClampedArray | null>(null);
  const steadyTicks = useRef(0);
  const movedTicks = useRef(0);
  const busy = useRef(false);
  const [photo, setPhoto] = useState<string | null>(null);
  const [cameraError, setCameraError] = useState(false);
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null);
  const [searching, setSearching] = useState(false);
  const [moving, setMoving] = useState(false);

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
    return toShot(source, width, height);
  }

  async function find(target: string) {
    if (busy.current) return 0;
    setSnapshot(null);
    const shot = capture();
    if (!shot) {
      onStatus(photo ? "Image isn't ready yet" : "Camera isn't ready yet");
      return 0;
    }
    const reference = photo ? null : sample();
    busy.current = true;
    setSearching(true);
    setMoving(false);
    onStatus(`Looking for ${target}…`);
    try {
      const res = await fetch("/api/segment", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ image: shot.image, prompt: target, width: shot.width, height: shot.height }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      const seconds = (data.ms / 1000).toFixed(1);
      if (data.matches.length === 0) {
        onStatus(`No ${target} here · ${seconds} s`);
        return 0;
      }
      setSnapshot({ ...shot, matches: data.matches, key: Date.now(), reference });
      onStatus(`${data.via === "sam" ? "Found it" : "Found it, looked closer"} · ${seconds} s`);
      return data.matches.length;
    } catch (error) {
      onStatus(error instanceof Error && error.message ? error.message : "Something went wrong");
      return 0;
    } finally {
      busy.current = false;
      setSearching(false);
    }
  }

  function loadPhoto(file: File) {
    setSnapshot(null);
    setPhoto(URL.createObjectURL(file));
    onStatus("Photo loaded");
  }

  useImperativeHandle(ref, () => ({ find, capture, loadPhoto }));

  useEffect(() => {
    if (photo || cameraError) return;
    const id = setInterval(() => {
      const current = sample();
      if (!current) return;
      const previous = lastSample.current;
      lastSample.current = current;

      if (snapshot?.reference) {
        // A shaky hand moves the frame a little all the time; only a big, sustained move means "new spot".
        const moved = Date.now() - snapshot.key > MIN_SNAPSHOT_MS && difference(snapshot.reference, current) > MOVED;
        movedTicks.current = moved ? movedTicks.current + 1 : 0;
        if (movedTicks.current >= MOVED_TICKS) {
          movedTicks.current = 0;
          steadyTicks.current = 0;
          setSnapshot(null);
          setMoving(true);
          onStatus("Hold steady…");
        }
        return;
      }

      steadyTicks.current = previous && difference(previous, current) < STEADY ? steadyTicks.current + 1 : 0;
      if (steadyTicks.current >= STEADY_TICKS) {
        steadyTicks.current = 0;
        setMoving(false);
        if (live) find(autoTarget);
      }
    }, 250);
    return () => clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [photo, cameraError, snapshot, live, autoTarget]);

  return (
    <div className={`stage fill${snapshot ? " frozen" : ""}`}>
      {photo ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img ref={photoRef} src={photo} alt="Your uploaded photo" className="media" />
      ) : (
        <video ref={videoRef} autoPlay playsInline muted className="media" style={{ opacity: snapshot ? 0 : 1 }} />
      )}
      {snapshot && !photo && (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={snapshot.image} alt="Snapshot of your table" className="media" />
      )}
      {searching && <span className="scan" aria-hidden="true" />}
      {snapshot && <FoundIt key={snapshot.key} snapshot={snapshot} />}
      {snapshot && !photo && (
        <button type="button" className="back-live" onClick={() => setSnapshot(null)}>
          Back to camera
        </button>
      )}
      {moving && !snapshot && <p className="steady">Hold steady…</p>}
      {cameraError && !photo && (
        <label className="hint upload">
          No camera here. <u>Upload a photo</u>
          <input type="file" accept="image/*" onChange={(e) => e.target.files?.[0] && loadPhoto(e.target.files[0])} />
        </label>
      )}
    </div>
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
      <svg className="media overlay" viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="xMidYMid slice" aria-hidden="true">
        <defs>
          <clipPath id={`cut-${key}`}>
            <path d={first.path} transform={maskTransform(first)} />
          </clipPath>
        </defs>
        {matches.map((m) => (
          <path key={m.id} d={m.path} transform={maskTransform(m)} className="mask late" vectorEffect="non-scaling-stroke" />
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
