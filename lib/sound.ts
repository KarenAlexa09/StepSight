import { getSettings } from "./settings";

export type SoundId = "boop" | "whoosh" | "ding" | "pop" | "swoosh" | "snap" | "tuck" | "success" | "oops" | "level";

const INFO: Record<SoundId, { label: string; buzz?: number[] }> = {
  boop: { label: "♪ boop", buzz: [8] },
  whoosh: { label: "♪ whoosh" },
  ding: { label: "♪ ding ≋", buzz: [12] },
  pop: { label: "♪ pop ✦", buzz: [10] },
  swoosh: { label: "♪ swoosh" },
  snap: { label: "♪ click ≋", buzz: [28] },
  tuck: { label: "♪ tuck" },
  success: { label: "♪ solid! ≋", buzz: [14, 40, 14] },
  oops: { label: "♪ almost ≋", buzz: [30, 60, 30] },
  level: { label: "♪ level up ≋", buzz: [20, 40, 20, 40, 60] },
};

let ctx: AudioContext | null = null;
const listeners = new Set<(label: string) => void>();

function audio() {
  if (!ctx) ctx = new AudioContext();
  if (ctx.state === "suspended") void ctx.resume();
  return ctx;
}

if (typeof window !== "undefined") window.addEventListener("pointerdown", () => audio(), { once: true });

export const onSound = (listener: (label: string) => void) => {
  listeners.add(listener);
  return () => void listeners.delete(listener);
};

const volume = () => (getSettings().quiet ? 0.4 : 1);

function tone(freq: number, at: number, dur: number, type: OscillatorType, gain: number, endFreq?: number) {
  const c = audio();
  const t = c.currentTime + at;
  const osc = c.createOscillator();
  const amp = c.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, t);
  if (endFreq) osc.frequency.exponentialRampToValueAtTime(endFreq, t + dur);
  amp.gain.setValueAtTime(0.0001, t);
  amp.gain.exponentialRampToValueAtTime(Math.max(0.0002, gain * volume()), t + 0.012);
  amp.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  osc.connect(amp).connect(c.destination);
  osc.start(t);
  osc.stop(t + dur + 0.03);
}

function noise(at: number, dur: number, from: number, to: number, gain: number) {
  const c = audio();
  const t = c.currentTime + at;
  const length = Math.floor(c.sampleRate * dur);
  const buffer = c.createBuffer(1, length, c.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < length; i++) data[i] = Math.random() * 2 - 1;
  const source = c.createBufferSource();
  source.buffer = buffer;
  const filter = c.createBiquadFilter();
  filter.type = "bandpass";
  filter.Q.value = 1.4;
  filter.frequency.setValueAtTime(from, t);
  filter.frequency.exponentialRampToValueAtTime(to, t + dur);
  const amp = c.createGain();
  amp.gain.setValueAtTime(0.0001, t);
  amp.gain.exponentialRampToValueAtTime(Math.max(0.0002, gain * volume()), t + dur * 0.35);
  amp.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  source.connect(filter).connect(amp).connect(c.destination);
  source.start(t);
  source.stop(t + dur + 0.03);
}

const VOICES: Record<SoundId, () => void> = {
  boop: () => tone(520, 0, 0.09, "sine", 0.2, 720),
  whoosh: () => noise(0, 0.6, 300, 2600, 0.16),
  ding: () => {
    tone(988, 0, 0.35, "sine", 0.22);
    tone(1480, 0.02, 0.25, "sine", 0.1);
  },
  pop: () => {
    tone(420, 0, 0.12, "sine", 0.32, 140);
    [1900, 2500, 3100, 2200, 3400].forEach((f, i) => tone(f, 0.1 + i * 0.045, 0.07, "triangle", 0.07));
  },
  swoosh: () => noise(0, 0.45, 2200, 500, 0.12),
  snap: () => {
    tone(170, 0, 0.1, "sine", 0.38, 60);
    tone(1800, 0, 0.018, "square", 0.1);
    tone(1320, 0.03, 0.13, "sine", 0.14);
  },
  tuck: () => tone(620, 0, 0.07, "sine", 0.14, 380),
  success: () => [523, 659, 784, 1047].forEach((f, i) => tone(f, i * 0.07, i === 3 ? 0.4 : 0.14, "sine", 0.2)),
  oops: () => {
    tone(392, 0, 0.17, "triangle", 0.16, 330);
    tone(330, 0.15, 0.22, "triangle", 0.14, 262);
  },
  level: () => {
    [392, 523, 659, 784].forEach((f, i) => tone(f, i * 0.09, 0.22, "sine", 0.2));
    [523, 659, 784, 1047].forEach((f) => tone(f, 0.4, 0.6, "sine", 0.12));
  },
};

export function play(id: SoundId) {
  const settings = getSettings();
  const { label, buzz } = INFO[id];
  if (settings.sound) {
    try {
      VOICES[id]();
    } catch {}
  }
  if (settings.vibration && buzz && "vibrate" in navigator) navigator.vibrate(buzz);
  if (settings.captions) listeners.forEach((listener) => listener(label));
}
