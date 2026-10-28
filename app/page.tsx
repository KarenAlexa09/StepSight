"use client";

import Link from "next/link";
import { useEffect, useRef, useState, type CSSProperties, type FormEvent } from "react";
import { maskTransform, toShot, type Shot } from "../lib/image";
import { MANUAL_KEY, type Manual } from "../lib/manual";
import type { Match } from "../lib/sam";
import { recordingToWav } from "../lib/wav";

const STEP_KEY = "stepsight.step";
const SAMPLE_WIDTH = 32;
const SAMPLE_HEIGHT = 24;
// shortcut: thresholds set by eye; recalibrate on the demo phone and lighting.
const MOVED = 30;
const MOVED_TICKS = 6;
const MIN_SNAPSHOT_MS = 4000;
const STEADY = 6;
const STEADY_TICKS = 4;
const MAX_RECORDING_MS = 4000;

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
type Command = "next" | "back" | "find" | "repeat";

function difference(a: Uint8ClampedArray, b: Uint8ClampedArray) {
  let sum = 0;
  for (let i = 0; i < a.length; i += 4) sum += Math.abs(a[i] + a[i + 1] + a[i + 2] - b[i] - b[i + 1] - b[i + 2]) / 3;
  return sum / (a.length / 4);
}

function toCommand(transcript: string): Command | null {
  const t = transcript.toLowerCase();
  if (/\b(next|done|ready|finished)\b/.test(t)) return "next";
  if (/\b(back|previous)\b/.test(t)) return "back";
  if (/\b(where|find|show|which)\b/.test(t)) return "find";
  if (/\b(repeat|again|what)\b/.test(t)) return "repeat";
  return null;
}

const partPrompt = (color: string) => `${color.trim().toLowerCase()} piece`;

export default function Home() {
  const videoRef = useRef<HTMLVideoElement>(null);
  const photoRef = useRef<HTMLImageElement>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const recorder = useRef<MediaRecorder | null>(null);
  const sampler = useRef<CanvasRenderingContext2D | null>(null);
  const lastSample = useRef<Uint8ClampedArray | null>(null);
  const steadyTicks = useRef(0);
  const movedTicks = useRef(0);
  const busy = useRef(false);
  const [photo, setPhoto] = useState<string | null>(null);
  const [cameraError, setCameraError] = useState(false);
  const [prompt, setPrompt] = useState("red piece");
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null);
  const [searching, setSearching] = useState(false);
  const [moving, setMoving] = useState(false);
  const [status, setStatus] = useState("Point the camera at your parts");
  const [live, setLive] = useState(false);
  const [manual, setManual] = useState<Manual | null>(null);
  const [stepIndex, setStepIndex] = useState(0);
  const [muted, setMuted] = useState(false);
  const [listening, setListening] = useState(false);

  const step = manual?.steps[stepIndex];

  useEffect(() => {
    try {
      const saved = localStorage.getItem(MANUAL_KEY);
      if (saved) {
        const m: Manual = JSON.parse(saved);
        const i = Math.min(Number(localStorage.getItem(STEP_KEY)) || 0, m.steps.length - 1);
        setManual(m);
        setStepIndex(i);
        const color = m.steps[i]?.parts[0]?.color;
        if (color) setPrompt(partPrompt(color));
        setStatus(`Step ${i + 1} of ${m.steps.length}`);
      }
    } catch {}
    const part = new URLSearchParams(window.location.search).get("find");
    if (part) setPrompt(part.slice(0, 80));
  }, []);

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

  async function say(text: string) {
    if (muted) return;
    try {
      const res = await fetch("/api/speak", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text }),
      });
      if (!res.ok) return;
      audioRef.current?.pause();
      audioRef.current = new Audio(URL.createObjectURL(await res.blob()));
      await audioRef.current.play();
    } catch {}
  }

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

  async function find(target = prompt) {
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
    setStatus(`Looking for ${target}…`);
    try {
      const res = await fetch("/api/segment", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ image: shot.image, prompt: target }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      const seconds = (data.ms / 1000).toFixed(1);
      if (data.matches.length === 0) {
        setStatus(`No match · ${seconds} s`);
        if (manual) say(`I can't see a ${target} yet. Try moving closer.`);
        return;
      }
      setSnapshot({ ...shot, matches: data.matches, key: Date.now(), reference });
      setStatus(`Found ${data.matches.length > 1 ? data.matches.length : "it"} · ${seconds} s`);
      if (manual) say("There it is. Grab this one.");
    } catch (error) {
      setLive(false);
      setStatus(error instanceof Error && error.message ? error.message : "Something went wrong");
    } finally {
      busy.current = false;
      setSearching(false);
    }
  }

  function goTo(index: number) {
    if (!manual) return;
    const i = Math.max(0, Math.min(index, manual.steps.length - 1));
    const next = manual.steps[i];
    setStepIndex(i);
    setSnapshot(null);
    setPrompt(partPrompt(next.parts[0]?.color ?? "red"));
    setStatus(`Step ${i + 1} of ${manual.steps.length}`);
    try {
      localStorage.setItem(STEP_KEY, String(i));
    } catch {}
    say(next.instruction);
  }

  function run(command: Command) {
    if (command === "next") goTo(stepIndex + 1);
    if (command === "back") goTo(stepIndex - 1);
    if (command === "find") find();
    if (command === "repeat" && step) say(step.instruction);
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
        setStatus("Thinking…");
        try {
          const form = new FormData();
          form.append("audio", await recordingToWav(new Blob(chunks, { type: rec.mimeType })), "command.wav");
          const res = await fetch("/api/transcribe", { method: "POST", body: form });
          const data = await res.json();
          if (!res.ok) throw new Error(data.error);
          const command = toCommand(data.transcript);
          setStatus(data.transcript ? `Heard "${data.transcript}"` : "Didn't catch that");
          if (command) run(command);
          else say('Try "next", "back", "where is it" or "repeat".');
        } catch (error) {
          setStatus(error instanceof Error && error.message ? error.message : "Couldn't hear that");
        }
      };
      rec.start();
      setListening(true);
      setStatus("Listening…");
      setTimeout(() => rec.state === "recording" && rec.stop(), MAX_RECORDING_MS);
    } catch {
      setStatus("Allow the microphone to talk to Timber");
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
        // A shaky hand moves the frame a little all the time; only a big, sustained move means "new spot".
        const moved = Date.now() - snapshot.key > MIN_SNAPSHOT_MS && difference(snapshot.reference, current) > MOVED;
        movedTicks.current = moved ? movedTicks.current + 1 : 0;
        if (movedTicks.current >= MOVED_TICKS) {
          movedTicks.current = 0;
          steadyTicks.current = 0;
          setSnapshot(null);
          setMoving(true);
          setStatus("Hold steady…");
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
    setStatus(manual ? "Photo loaded. Tap Show me" : "Photo loaded. Name a part and tap Find");
  }

  function onSubmit(event: FormEvent) {
    event.preventDefault();
    find();
  }

  const photoInput = <input type="file" accept="image/*" onChange={(e) => onPhoto(e.target.files?.[0])} />;
  const liveButton = (
    <button type="button" className="secondary" aria-pressed={live} onClick={() => setLive((v) => !v)} disabled={!!photo}>
      {live ? "Stop" : "Live"}
    </button>
  );

  return (
    <main className="screen">
      <header className="top">
        <Link href="/manual" className="brand">
          StepSight
        </Link>
        <span className="chip" role="status">
          {status}
        </span>
      </header>

      {manual && step && (
        <span className="progress" aria-hidden="true">
          <span style={{ width: `${((stepIndex + 1) / manual.steps.length) * 100}%` }} />
        </span>
      )}

      <div className={`stage fill${snapshot ? " frozen" : ""}`}>
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
        {snapshot && !photo && (
          <button type="button" className="back-live" onClick={() => setSnapshot(null)}>
            Back to camera
          </button>
        )}
        {moving && !snapshot && <p className="steady">Hold steady…</p>}
        {cameraError && !photo && <p className="hint">No camera here. Upload a photo instead.</p>}
      </div>

      {manual && step ? (
        <section className="controls">
          <div className="step-card">
            <span className="step-count">
              Step {stepIndex + 1} / {manual.steps.length} · p. {step.page}
            </span>
            <h1 className="instruction">{step.instruction}</h1>
            <div className="targets">
              {step.parts.map((p, i) => {
                const target = partPrompt(p.color);
                return (
                  <button
                    key={i}
                    type="button"
                    className="part"
                    aria-pressed={prompt === target}
                    onClick={() => {
                      setPrompt(target);
                      find(target);
                    }}
                  >
                    {p.quantity}× {p.color} {p.name}
                  </button>
                );
              })}
            </div>
          </div>
          <div className="row">
            <button
              type="button"
              className="secondary mic"
              aria-label={listening ? "Stop listening" : "Talk to Timber"}
              aria-pressed={listening}
              onClick={listen}
            >
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <rect x="9" y="3" width="6" height="11" rx="3" />
                <path d="M5 11a7 7 0 0 0 14 0M12 18v3" />
              </svg>
            </button>
            <button type="button" className="primary" onClick={() => find()}>
              Show me
            </button>
            {liveButton}
          </div>
          <div className="row">
            <button type="button" className="secondary" onClick={() => goTo(stepIndex - 1)} disabled={stepIndex === 0}>
              ← Back
            </button>
            <button type="button" className="secondary" aria-pressed={!muted} onClick={() => setMuted((m) => !m)}>
              {muted ? "Sound off" : "Sound on"}
            </button>
            <button
              type="button"
              className="secondary"
              onClick={() => goTo(stepIndex + 1)}
              disabled={stepIndex === manual.steps.length - 1}
            >
              Next →
            </button>
          </div>
          <label className="tip upload">
            Use a photo instead
            {photoInput}
          </label>
        </section>
      ) : (
        <form className="controls" onSubmit={onSubmit}>
          <label className="field">
            <span>Part to find</span>
            <input value={prompt} onChange={(e) => setPrompt(e.target.value)} maxLength={80} required />
          </label>
          <div className="row">
            <button type="submit" className="primary">
              Find
            </button>
            {liveButton}
            <label className="secondary upload">
              Photo
              {photoInput}
            </label>
          </div>
          <Link className="tip" href="/manual">
            Add a manual for step-by-step help
          </Link>
        </form>
      )}
      {live && <p className="tip">Hold the phone still for a second to search.</p>}
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
      <svg
        className="media overlay"
        viewBox={`0 0 ${width} ${height}`}
        preserveAspectRatio="xMidYMid slice"
        aria-hidden="true"
      >
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
