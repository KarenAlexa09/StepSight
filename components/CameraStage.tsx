"use client";

import { tr, useT } from "../lib/i18n";
import { useEffect, useImperativeHandle, useRef, useState, type CSSProperties, type Ref } from "react";
import { maskTransform, toShot, type Shot } from "../lib/image";
import type { Motion } from "../lib/manual";
import type { Box, Match } from "../lib/sam";
import { getSettings } from "../lib/settings";
import { play } from "../lib/sound";
import { cut, follow, toGray, TRACK_WIDTH, type Patch } from "../lib/track";

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

const DIRECTIONS: Record<string, [number, number]> = { up: [0, -1], down: [0, 1], left: [-1, 0], right: [1, 0] };

// Flow: after "grab this one", the camera goes live again and these follow the part and its base.
type Anchor = { width: number; height: number; scale: number; label: string; lostAt: number; items: { match: Match; dest: boolean; patch: Patch; x0: number; y0: number; seen: boolean }[] };

const LOST_MS = 2500;
const LOST = 45;
const CLIP_MAX_MS = 8000;
const CLIP_TYPE = () => (typeof MediaRecorder === "undefined" ? "" : (["video/mp4;codecs=avc1", "video/mp4"].find((t) => MediaRecorder.isTypeSupported(t)) ?? ""));

type Snapshot = Shot & {
  matches: Match[];
  dest: Match | null;
  motion: Motion | null;
  label: string;
  key: number;
  reference: Uint8ClampedArray | null;
};

export type CameraHandle = {
  find: (target: string, motion?: Motion) => Promise<number>;
  capture: () => Shot | null;
  loadPhoto: (file: File) => void;
  replay: () => boolean;
};

function difference(a: Uint8ClampedArray, b: Uint8ClampedArray) {
  let sum = 0;
  for (let i = 0; i < a.length; i += 4) sum += Math.abs(a[i] + a[i + 1] + a[i + 2] - b[i] - b[i + 1] - b[i + 2]) / 3;
  return sum / (a.length / 4);
}

const center = (m: Match) => [(m.bounds.left + m.bounds.right) / 2, (m.bounds.top + m.bounds.bottom) / 2] as const;

const named = () => getSettings().lang === "en";

function labelOf(motion: Motion | undefined) {
  if (motion?.type === "connect" && motion.to) return named() ? tr("Attach to the {to}", { to: motion.to }) : tr("Attach it here");
  if (motion?.type === "move" && motion.direction) return tr("Move it {dir}", { dir: tr(motion.direction) });
  if (motion?.type === "remove") return tr("Take this off");
  return tr("This one");
}

function vectorOf(s: Snapshot): [number, number] | null {
  const m = s.motion;
  if (!m || m.type === "none") return null;
  const [cx, cy] = center(s.matches[0]);
  const span = Math.min(s.width, s.height) * 0.28;
  if (m.type === "connect") return s.dest ? [center(s.dest)[0] - cx, center(s.dest)[1] - cy] : null;
  const dir = DIRECTIONS[m.direction];
  if (dir) return [dir[0] * span, dir[1] * span];
  if (m.type === "remove") {
    const away: [number, number] = [cx - s.width / 2, cy - s.height / 2];
    const length = Math.hypot(...away) || 1;
    return length < span * 0.2 ? [0, -span] : [(away[0] / length) * span, (away[1] / length) * span];
  }
  return null;
}

function cropOf(s: Snapshot, vec: [number, number] | null) {
  const first = s.matches[0].bounds;
  const [cx, cy] = center(s.matches[0]);
  const xs = [first.left, first.right, ...(s.dest ? [s.dest.bounds.left, s.dest.bounds.right] : []), ...(vec ? [cx + vec[0]] : [])];
  const ys = [first.top, first.bottom, ...(s.dest ? [s.dest.bounds.top, s.dest.bounds.bottom] : []), ...(vec ? [cy + vec[1]] : [])];
  const left = Math.min(...xs);
  const right = Math.max(...xs);
  const top = Math.min(...ys);
  const bottom = Math.max(...ys);
  const pad = Math.max(right - left, bottom - top, 40) * 0.45;
  const x = Math.max(0, left - pad);
  const y = Math.max(0, top - pad);
  return `${x} ${y} ${Math.min(s.width, right + pad) - x} ${Math.min(s.height, bottom + pad) - y}`;
}

const reach = (box: Box, ux: number, uy: number) =>
  Math.min(ux ? (box.right - box.left) / 2 / Math.abs(ux) : Infinity, uy ? (box.bottom - box.top) / 2 / Math.abs(uy) : Infinity);

function Arrow({ from, vec, unit, src, dst }: { from: readonly [number, number]; vec: [number, number]; unit: number; src: Box; dst?: Box }) {
  const length = Math.hypot(vec[0], vec[1]) || 1;
  const [ux, uy] = [vec[0] / length, vec[1] / length];
  const gap = unit * 1.5;
  const begin = reach(src, ux, uy) + gap;
  const end = length - (dst ? reach(dst, ux, uy) + gap : 0);
  if (end - begin < unit * 4) return null;
  const [x, y] = [from[0] + ux * begin, from[1] + uy * begin];
  const [tx, ty] = [from[0] + ux * end, from[1] + uy * end];
  const angle = Math.atan2(uy, ux);
  const head = unit * 5;
  const point = (a: number) => `${tx - head * Math.cos(angle + a)},${ty - head * Math.sin(angle + a)}`;
  return (
    <g className="trail">
      <path d={`M${x} ${y} L${tx} ${ty}`} className="trail-line" vectorEffect="non-scaling-stroke" />
      <polygon points={`${tx},${ty} ${point(0.5)} ${point(-0.5)}`} className="trail-head" vectorEffect="non-scaling-stroke" />
    </g>
  );
}

export default function CameraStage({
  ref,
  live,
  autoTarget,
  resetKey = 0,
  demo,
  onStatus,
  onSettle,
  anchored = false,
}: {
  ref: Ref<CameraHandle>;
  live: boolean;
  autoTarget: string;
  resetKey?: number;
  demo?: string;
  onStatus: (status: string) => void;
  onSettle?: (clip?: Blob) => void;
  anchored?: boolean;
}) {
  const t = useT();
  const videoRef = useRef<HTMLVideoElement>(null);
  const photoRef = useRef<HTMLImageElement>(null);
  const sampler = useRef<CanvasRenderingContext2D | null>(null);
  const lastSample = useRef<Uint8ClampedArray | null>(null);
  const steadyTicks = useRef(0);
  const movedTicks = useRef(0);
  const active = useRef(false);
  const settle = useRef(onSettle);
  settle.current = onSettle;
  const busy = useRef(false);
  const [photo, setPhoto] = useState<string | null>(null);
  const [cameraError, setCameraError] = useState(false);
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null);
  const [memo, setMemo] = useState<Snapshot | null>(null);
  const [searching, setSearching] = useState(false);
  const [moving, setMoving] = useState(false);
  const [anchor, setAnchor] = useState<Anchor | null>(null);
  const tracker = useRef<CanvasRenderingContext2D | null>(null);
  const recorder = useRef<{ rec: MediaRecorder; chunks: Blob[]; at: number } | null>(null);

  useEffect(() => {
    let stream: MediaStream | undefined;
    if (demo) return;
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

  useEffect(() => {
    setSnapshot(null);
    setMemo(null);
    setAnchor(null);
    active.current = false;
  }, [resetKey]);

  // The live video, or the photo in demos and uploads (where nothing moves, so the outline just stays put).
  function trackFrame() {
    const img = photo ? photoRef.current : null;
    const video = img ? null : videoRef.current;
    const [w, h] = img ? [img.naturalWidth, img.naturalHeight] : [video?.videoWidth ?? 0, video?.videoHeight ?? 0];
    if (!w || !h) return null;
    const height = Math.round((TRACK_WIDTH * h) / w);
    if (!tracker.current || tracker.current.canvas.height !== height) {
      const canvas = document.createElement("canvas");
      canvas.width = TRACK_WIDTH;
      canvas.height = height;
      tracker.current = canvas.getContext("2d", { willReadFrequently: true });
    }
    tracker.current!.drawImage((img ?? video)!, 0, 0, TRACK_WIDTH, height);
    return toGray(tracker.current!.getImageData(0, 0, TRACK_WIDTH, height).data, TRACK_WIDTH, height);
  }

  // AR: no frozen picture; outlines go straight onto the live video and follow the parts.
  function startAnchor(snap: Snapshot) {
    const frame = trackFrame();
    if (!frame) return false;
    const scale = TRACK_WIDTH / snap.width;
    const items = [{ match: snap.matches[0], dest: false }, ...(snap.dest ? [{ match: snap.dest, dest: true }] : [])].flatMap(({ match, dest }) => {
      const b = match.bounds;
      const patch = cut(frame, { left: b.left * scale, top: b.top * scale, right: b.right * scale, bottom: b.bottom * scale });
      return patch ? [{ match, dest, patch, x0: patch.x, y0: patch.y, seen: true }] : [];
    });
    if (!items.length) return false;
    setAnchor({ width: snap.width, height: snap.height, scale, label: snap.label, lostAt: 0, items });
    return true;
  }

  useEffect(() => {
    if (!anchor) return;
    const id = setInterval(() => {
      const frame = trackFrame();
      if (!frame) return;
      setAnchor((a) => {
        if (!a) return a;
        for (const item of a.items) {
          const found = follow(frame, item.patch);
          item.seen = found.error < LOST;
          if (item.seen) {
            item.patch.x = found.x;
            item.patch.y = found.y;
          }
        }
        const lost = !a.items[0].seen;
        if (!lost) a.lostAt = 0;
        else if (!a.lostAt) a.lostAt = Date.now();
        else if (Date.now() - a.lostAt > LOST_MS) return null;
        return { ...a };
      });
    }, 100);
    return () => clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [anchor !== null]);

  // The clip of the hands at work, from the first big move to the moment things go still; SAM watches it.
  function startClip() {
    const type = CLIP_TYPE();
    const stream = videoRef.current?.srcObject;
    if (!type || !(stream instanceof MediaStream)) return;
    if (recorder.current && Date.now() - recorder.current.at < CLIP_MAX_MS) return;
    recorder.current?.rec.stop();
    const rec = new MediaRecorder(stream, { mimeType: type, videoBitsPerSecond: 1_000_000 });
    const clip = { rec, chunks: [] as Blob[], at: Date.now() };
    rec.ondataavailable = (e) => e.data.size && clip.chunks.push(e.data);
    rec.start();
    recorder.current = clip;
  }

  function stopClip(): Promise<Blob | undefined> {
    const clip = recorder.current;
    recorder.current = null;
    if (!clip || clip.rec.state === "inactive") return Promise.resolve(undefined);
    return new Promise((resolve) => {
      clip.rec.onstop = () => resolve(new Blob(clip.chunks, { type: clip.rec.mimeType.split(";")[0] }));
      clip.rec.stop();
    });
  }

  useEffect(() => () => recorder.current?.rec.stop(), []);

  useEffect(() => {
    if (!demo) return;
    setSnapshot(null);
    setAnchor(null);
    setPhoto(demo);
  }, [demo]);

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

  async function segment(shot: Shot, prompt: string) {
    const res = await fetch("/api/segment", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ image: shot.image, prompt, width: shot.width, height: shot.height }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error);
    return data as { matches: Match[]; via: string; ms: number };
  }

  async function find(target: string, motion?: Motion) {
    if (busy.current) return 0;
    setSnapshot(null);
    setAnchor(null);
    const shot = capture();
    if (!shot) {
      onStatus(photo ? t("Image isn't ready yet") : t("Camera isn't ready yet"));
      return 0;
    }
    const reference = photo ? null : sample();
    busy.current = true;
    setSearching(true);
    setMoving(false);
    onStatus(named() ? t("Looking for {target}…", { target }) : t("Looking for the part…"));
    play("whoosh");
    try {
      const wantsDest = motion?.type === "connect" && motion.to;
      const [data, destData] = await Promise.all([
        segment(shot, target),
        wantsDest ? segment(shot, motion.to).catch(() => null) : null,
      ]);
      if (data.matches.length === 0) {
        onStatus(named() ? t("No {target} here", { target }) : t("I can't see that part here"));
        return 0;
      }
      const next: Snapshot = {
        ...shot,
        matches: data.matches,
        dest: destData?.matches[0] ?? null,
        motion: motion && motion.type !== "none" ? motion : null,
        label: labelOf(motion),
        key: Date.now(),
        reference,
      };
      setMemo(next);
      onStatus(t("Found it"));
      if (anchored && startAnchor(next)) {
        play("boop");
        return data.matches.length;
      }
      setSnapshot(next);
      return data.matches.length;
    } catch (error) {
      onStatus(error instanceof Error && error.message ? t(error.message) : t("Something went wrong"));
      return 0;
    } finally {
      busy.current = false;
      setSearching(false);
    }
  }

  function loadPhoto(file: File) {
    setSnapshot(null);
    setPhoto(URL.createObjectURL(file));
    onStatus(t("Photo loaded"));
  }

  function replay() {
    if (!memo) return false;
    setSnapshot({ ...memo, key: Date.now(), reference: null });
    return true;
  }

  useImperativeHandle(ref, () => ({ find, capture, loadPhoto, replay }));

  const hadSnapshot = useRef(false);
  useEffect(() => {
    if (hadSnapshot.current && !snapshot && memo) play("tuck");
    hadSnapshot.current = !!snapshot;
  }, [snapshot, memo]);

  useEffect(() => {
    if (photo || cameraError) return;
    const id = setInterval(() => {
      const current = sample();
      if (!current) return;
      const previous = lastSample.current;
      lastSample.current = current;

      if (snapshot?.reference) {
        // A shaky hand moves the frame a little all the time; only a big, sustained move means t("new spot").
        const moved = Date.now() - snapshot.key > MIN_SNAPSHOT_MS && difference(snapshot.reference, current) > MOVED;
        movedTicks.current = moved ? movedTicks.current + 1 : 0;
        if (movedTicks.current >= MOVED_TICKS) {
          movedTicks.current = 0;
          steadyTicks.current = 0;
          active.current = true;
          setSnapshot(null);
          setMoving(true);
          onStatus(t("Hold steady…"));
        }
        return;
      }

      const change = previous ? difference(previous, current) : 0;
      if (change > MOVED) {
        active.current = true;
        if (settle.current) startClip();
      }
      steadyTicks.current = previous && change < STEADY ? steadyTicks.current + 1 : 0;
      if (steadyTicks.current >= STEADY_TICKS) {
        steadyTicks.current = 0;
        setMoving(false);
        // shortcut: any big move then stillness counts as "hands out", so moving the phone also triggers a check; compare against the step's first frame if that misfires.
        if (settle.current && active.current) {
          active.current = false;
          stopClip().then((clip) => settle.current?.(clip));
          return;
        }
        if (live && !anchor) find(autoTarget);
      }
    }, 250);
    return () => clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [photo, cameraError, snapshot, live, autoTarget, anchor !== null]);

  const memoVec = memo ? vectorOf(memo) : null;

  return (
    <div className={`stage fill${snapshot ? " frozen" : ""}`}>
      {photo ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img ref={photoRef} src={photo} alt={t("Your uploaded photo")} className="media photo" />
      ) : (
        <video ref={videoRef} autoPlay playsInline muted className="media" style={{ opacity: snapshot ? 0 : 1 }} />
      )}
      {snapshot && !photo && (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={snapshot.image} alt={t("Snapshot of your table")} className="media" />
      )}
      {anchor && !snapshot && (
        <svg className="anchor" viewBox={`0 0 ${anchor.width} ${anchor.height}`} preserveAspectRatio="xMidYMid slice" aria-hidden="true">
          {anchor.items.map((item) => {
            const dx = (item.patch.x - item.x0) / anchor.scale;
            const dy = (item.patch.y - item.y0) / anchor.scale;
            const unit = Math.max(anchor.width, anchor.height) / 100;
            return (
              <g key={item.dest ? "dest" : "part"} transform={`translate(${dx} ${dy})`} style={{ opacity: item.seen ? 1 : 0 }}>
                {item.dest ? <DestBox match={item.match} unit={unit} /> : <Brackets match={item.match} unit={unit} label={anchor.label} below={item.match.bounds.top < anchor.height * 0.2} />}
              </g>
            );
          })}
          {anchor.items.length > 1 && anchor.items.every((item) => item.seen) && (
            <line
              className="ar-link"
              x1={center(anchor.items[0].match)[0] + (anchor.items[0].patch.x - anchor.items[0].x0) / anchor.scale}
              y1={center(anchor.items[0].match)[1] + (anchor.items[0].patch.y - anchor.items[0].y0) / anchor.scale}
              x2={center(anchor.items[1].match)[0] + (anchor.items[1].patch.x - anchor.items[1].x0) / anchor.scale}
              y2={center(anchor.items[1].match)[1] + (anchor.items[1].patch.y - anchor.items[1].y0) / anchor.scale}
              vectorEffect="non-scaling-stroke"
            />
          )}
        </svg>
      )}
      {searching && <span className="scan" aria-hidden="true" />}
      {snapshot && <FoundIt key={snapshot.key} snapshot={snapshot} />}
      {snapshot && (
        <button type="button" className="back-live" onClick={() => setSnapshot(null)}>
          {photo ? t("Close") : t("Back to camera")}
        </button>
      )}
      {memo && !snapshot && !anchored && (
        <button
          type="button"
          className="memo"
          aria-label={`Replay: ${memo.label}`}
          onClick={replay}
        >
          <svg viewBox={cropOf(memo, memoVec)} preserveAspectRatio="xMidYMid slice" aria-hidden="true">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <image href={memo.image} width={memo.width} height={memo.height} />
            {memo.matches.map((m) => (
              <path key={m.id} d={m.path} transform={maskTransform(m)} className="mask" vectorEffect="non-scaling-stroke" />
            ))}
            {memo.dest && <DestBox match={memo.dest} unit={Math.max(memo.width, memo.height) / 100} />}
            {memoVec && (
              <Arrow
                from={center(memo.matches[0])}
                vec={memoVec}
                unit={Math.max(memo.width, memo.height) / 100}
                src={memo.matches[0].bounds}
                dst={memo.motion?.type === "connect" ? memo.dest?.bounds : undefined}
              />
            )}
          </svg>
          <span>▶ {memo.label}</span>
        </button>
      )}
      {moving && !snapshot && <p className="steady">{t("Hold steady…")}</p>}
      {cameraError && !snapshot && (
        <label className="hint upload">
          {photo ? <u>{t("Upload another photo")}</u> : <>{t("No camera here.")} <u>{t("Upload a photo")}</u></>}
          <input
            type="file"
            accept="image/*"
            onChange={(e) => {
              if (e.target.files?.[0]) loadPhoto(e.target.files[0]);
              e.target.value = "";
            }}
          />
        </label>
      )}
    </div>
  );
}

// AR corner brackets around the part, with its label; steadier to look at than a raw mask edge.
function Brackets({ match, unit, label, below }: { match: Match; unit: number; label: string; below: boolean }) {
  const { left, top, right, bottom } = match.bounds;
  const pad = unit;
  const [x1, y1, x2, y2] = [left - pad, top - pad, right + pad, bottom + pad];
  const arm = Math.max(unit * 3, Math.min(x2 - x1, y2 - y1) * 0.25);
  const corners = `M${x1} ${y1 + arm}V${y1}H${x1 + arm}M${x2 - arm} ${y1}H${x2}V${y1 + arm}M${x2} ${y2 - arm}V${y2}H${x2 - arm}M${x1 + arm} ${y2}H${x1}V${y2 - arm}`;
  return (
    <>
      <rect className="ar-fill" x={x1} y={y1} width={x2 - x1} height={y2 - y1} rx={unit * 2} />
      <path className="ar-corners" d={corners} vectorEffect="non-scaling-stroke" />
      {label && (
        <text className="ar-label" x={x1} y={below ? y2 + unit * 5 : y1 - unit * 1.5} fontSize={unit * 4}>
          {label}
        </text>
      )}
    </>
  );
}

function DestBox({ match, unit }: { match: Match; unit: number }) {
  const { left, top, right, bottom } = match.bounds;
  const pad = unit;
  return (
    <rect className="dest" x={left - pad} y={top - pad} width={right - left + pad * 2} height={bottom - top + pad * 2} rx={pad} vectorEffect="non-scaling-stroke" />
  );
}

function FoundIt({ snapshot }: { snapshot: Snapshot }) {
  const tx = useT();
  const { width, height, matches, image, key, dest, motion, label } = snapshot;
  const first = matches[0];
  const { left, top, right, bottom } = first.bounds;
  const [cx, cy] = center(first);
  const unit = Math.max(width, height) / 100;
  const scale = Math.max(1, Math.min(2.2, (width * 0.6) / (right - left), (height * 0.45) / (bottom - top)));
  const vec = vectorOf(snapshot);
  const connects = motion?.type === "connect" && !!dest && !!vec;
  const sx = width / 2;
  const sy = height * 0.42;
  const reach = Math.max(width, height) * 0.5;
  const lift = {
    "--dx": `${sx - cx}px`,
    "--dy": `${sy - cy}px`,
    "--s": scale,
    transformOrigin: `${cx}px ${cy}px`,
  } as CSSProperties;
  const travel = vec && ({ "--vx": `${vec[0]}px`, "--vy": `${vec[1]}px` } as CSSProperties);
  const pad = unit * 1.5;
  const arm = Math.max(Math.min(right - left, bottom - top) * 0.3, unit * 3);
  const [l, t, r, b] = [left - unit * 2, top - unit * 2, right + unit * 2, bottom + unit * 2];
  const corners = [
    `M${l},${t + arm} V${t} H${l + arm}`,
    `M${r - arm},${t} H${r} V${t + arm}`,
    `M${l},${b - arm} V${b} H${l + arm}`,
    `M${r - arm},${b} H${r} V${b - arm}`,
  ];

  useEffect(() => {
    const timers = [setTimeout(() => play("ding"), 0), setTimeout(() => play("pop"), 450)];
    if (vec) timers.push(setTimeout(() => play("swoosh"), 2300));
    if (connects) timers.push(setTimeout(() => play("snap"), 3500));
    return () => timers.forEach(clearTimeout);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  return (
    <>
      <span className="flash fx" aria-hidden="true" />
      {connects && <span className="snap-fx" aria-hidden="true" />}
      <svg className="media overlay" viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="xMidYMid slice" aria-hidden="true">
        <defs>
          <clipPath id={`cut-${key}`}>
            <path d={first.path} transform={maskTransform(first)} />
          </clipPath>
          <radialGradient id={`spot-${key}`} cx={sx} cy={sy} r={reach * 0.78} gradientUnits="userSpaceOnUse">
            <stop offset="0.3" stopColor="#141414" stopOpacity="0" />
            <stop offset="1" stopColor="#141414" stopOpacity="0.72" />
          </radialGradient>
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
        <g className="reticle fx" style={{ transformOrigin: `${cx}px ${cy}px` }}>
          {corners.map((d) => (
            <path key={d} d={d} vectorEffect="non-scaling-stroke" />
          ))}
        </g>
        <rect className="spot fx" width={width} height={height} fill={`url(#spot-${key})`} />
        <g className="rays fx" style={{ transformOrigin: `${sx}px ${sy}px` }}>
          {Array.from({ length: 10 }, (_, i) => {
            const a0 = (i * 36 * Math.PI) / 180;
            const a1 = a0 + 0.24;
            return (
              <polygon
                key={i}
                points={`${sx},${sy} ${sx + reach * Math.cos(a0)},${sy + reach * Math.sin(a0)} ${sx + reach * Math.cos(a1)},${sy + reach * Math.sin(a1)}`}
              />
            );
          })}
        </g>
        <g className="lift fx" style={lift}>
          <image href={image} width={width} height={height} clipPath={`url(#cut-${key})`} />
          <path d={first.path} transform={maskTransform(first)} className="cut-outline" vectorEffect="non-scaling-stroke" />
        </g>
        {dest && (
          <g className="late-in">
            <DestBox match={dest} unit={unit} />
          </g>
        )}
        {vec && (
          <>
            <g className="late-in">
              <Arrow from={[cx, cy]} vec={vec} unit={unit} src={first.bounds} dst={connects ? dest?.bounds : undefined} />
            </g>
            <g className={`travel fx ${motion?.type ?? ""}`} style={travel ?? undefined}>
              <image href={image} width={width} height={height} clipPath={`url(#cut-${key})`} />
              <path d={first.path} transform={maskTransform(first)} className="cut-outline" vectorEffect="non-scaling-stroke" />
            </g>
          </>
        )}
        {connects &&
          dest &&
          [0, 0.12, 0.24].map((delay) => (
            <circle
              key={delay}
              className="shock fx"
              cx={center(dest)[0]}
              cy={center(dest)[1]}
              r={unit * 4}
              vectorEffect="non-scaling-stroke"
              style={{ animationDelay: `${3.5 + delay}s` }}
            />
          ))}
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
      <p className="grab fx">{tx("grab this one!")}</p>
      {connects && <p className="click-fx fx">{tx("CLICK!")}</p>}
      <p className="action-chip">{label}</p>
    </>
  );
}
