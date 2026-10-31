"use client";

import { useEffect, useState } from "react";
import type { Manual } from "./manual";
import { getItem, setItem } from "./store";

const MAX_AT_ONCE = 4;
const MAX_STEPS = 10; // a 40-step PDF would cost 40 images

const cache = new Map<string, string>();
const pending = new Set<string>();
const listeners = new Set<() => void>();
const notify = () => listeners.forEach((fn) => fn());
const keyOf = (m: Manual, i: number) => `stepsight.anim.${m.title}.${i}.${m.steps[i].instruction.length}`;

const loads = new Map<string, Promise<string | undefined>>();

// Strips live in IndexedDB so every finished project keeps its manual; read once into memory, then sync.
function load(key: string) {
  if (cache.has(key)) return Promise.resolve(cache.get(key));
  if (!loads.has(key)) {
    loads.set(
      key,
      getItem<string>(key).then((saved) => {
        if (saved) {
          cache.set(key, saved);
          notify();
        }
        return saved;
      }),
    );
  }
  return loads.get(key)!;
}

function stored(key: string) {
  if (!cache.has(key)) load(key);
  return cache.get(key);
}

// One-time: strips used to sit in localStorage and could fill it up; they're redrawn on demand.
try {
  if (typeof localStorage !== "undefined") Object.keys(localStorage).forEach((k) => k.startsWith("stepsight.anim.") && localStorage.removeItem(k));
} catch {}

// Halves the 2.5 MP strip: plenty for a phone and 4x less to store.
function shrink(dataUrl: string): Promise<string> {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement("canvas");
      canvas.width = 1200;
      canvas.height = Math.round((img.height / img.width) * 1200);
      canvas.getContext("2d")!.drawImage(img, 0, 0, canvas.width, canvas.height);
      resolve(canvas.toDataURL("image/jpeg", 0.8));
    };
    img.onerror = () => resolve(dataUrl);
    img.src = dataUrl;
  });
}

async function draw(m: Manual, i: number) {
  const key = keyOf(m, i);
  pending.add(key);
  notify();
  try {
    const step = m.steps[i];
    const res = await fetch("/api/animate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title: m.title, instruction: step.instruction, target: step.target }),
    });
    const data = await res.json();
    if (!res.ok) return;
    const image = await shrink(data.image);
    cache.set(key, image);
    setItem(key, image);
  } catch {
  } finally {
    pending.delete(key);
    notify();
  }
}

// Starts drawing the steps right after the plan is ready, so step 1 is usually done before you get there.
export async function prepareAnimations(m: Manual) {
  if (m.demo) return; // demos ship their strips in /public/demo
  const keys = m.steps.slice(0, MAX_STEPS).map((_, i) => keyOf(m, i));
  const have = await Promise.all(keys.map(load));
  const todo = keys.map((_, i) => i).filter((i) => !have[i] && !pending.has(keys[i]));
  const next = async (): Promise<void> => {
    const i = todo.shift();
    if (i === undefined) return;
    await draw(m, i);
    return next();
  };
  await Promise.all(Array.from({ length: MAX_AT_ONCE }, next));
}

export function useAnimation(m: Manual | null, i: number) {
  const [, tick] = useState(0);
  useEffect(() => {
    const fn = () => tick((n) => n + 1);
    listeners.add(fn);
    return () => void listeners.delete(fn);
  }, []);
  if (!m?.steps[i]) return { image: undefined, drawing: false };
  if (m.demo) return { image: `/demo/anim-${m.demo}-${i + 1}.jpg`, drawing: false };
  const key = keyOf(m, i);
  return { image: stored(key), drawing: pending.has(key) };
}
