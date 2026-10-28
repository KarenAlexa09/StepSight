"use client";

import Link from "next/link";
import { useEffect, useRef, useState, type FormEvent } from "react";
import Timber from "../../components/Timber";
import { fileToShot } from "../../lib/image";
import type { Manual, Mode } from "../../lib/manual";
import { clearManual, clearReplay, freshProgress, loadManual, saveManual, saveProgress } from "../../lib/progress";

const POLL_MS = 3000;
const GIVE_UP_MS = 8 * 60 * 1000;

type Phase = "idle" | "reading" | "done";
type Way = "photo" | "name" | "link";

const WAYS: [Way, string][] = [
  ["photo", "Photo"],
  ["name", "Name"],
  ["link", "Link"],
];

const EXAMPLE: Record<Mode, string> = {
  build: "IKEA Kallax shelf",
  fix: "bike chain slipped off",
};

export default function ManualPage() {
  const [mode, setMode] = useState<Mode>("build");
  const [way, setWay] = useState<Way>("photo");
  const [text, setText] = useState("");
  const [phase, setPhase] = useState<Phase>("idle");
  const [manual, setManual] = useState<Manual | null>(null);
  const [identified, setIdentified] = useState("");
  const [error, setError] = useState("");
  const [elapsed, setElapsed] = useState(0);
  const cancelled = useRef(false);

  useEffect(() => {
    const saved = loadManual();
    if (saved) {
      setManual(saved);
      setPhase("done");
    }
    return () => {
      cancelled.current = true;
    };
  }, []);

  async function start(body: Record<string, string>) {
    setError("");
    setIdentified("");
    setPhase("reading");
    setElapsed(0);
    const started = Date.now();
    try {
      const res = await fetch("/api/manual", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...body, mode }),
      });
      const { id, identified: what, error } = await res.json();
      if (!res.ok) throw new Error(error);
      if (what) setIdentified(what);

      while (!cancelled.current && Date.now() - started < GIVE_UP_MS) {
        await new Promise((r) => setTimeout(r, POLL_MS));
        setElapsed(Math.round((Date.now() - started) / 1000));
        const poll = await fetch(`/api/manual?id=${id}`);
        const data = await poll.json();
        if (!poll.ok) throw new Error(data.error);
        if (data.status === "failed") throw new Error("Timber couldn't find good instructions. Try another name or link.");
        if (data.status === "done") {
          const done: Manual = { ...data.manual, mode };
          setManual(done);
          setPhase("done");
          saveManual(done);
          saveProgress(freshProgress());
          clearReplay();
          return;
        }
      }
      if (!cancelled.current) throw new Error("This is taking too long. Try again.");
    } catch (e) {
      setPhase("idle");
      setError(e instanceof Error && e.message ? e.message : "Something went wrong");
    }
  }

  async function onPhoto(file: File | undefined) {
    if (!file) return;
    try {
      start({ image: (await fileToShot(file)).image });
    } catch {
      setError("Couldn't open that photo.");
    }
  }

  function onSubmit(event: FormEvent) {
    event.preventDefault();
    start(way === "link" ? { url: text } : { query: text });
  }

  function startOver() {
    clearManual();
    setManual(null);
    setText("");
    setPhase("idle");
  }

  const busy = phase === "reading";

  return (
    <main className="screen paper">
      <header className="top">
        <Link href="/" className="round" aria-label="Home">
          ←
        </Link>
        <span className="chip">{phase === "done" ? "Plan ready" : "New project"}</span>
      </header>

      {phase !== "done" && (
        <div className="controls">
          <div className="hero">
            <h1 className="title big">
              What are we <mark>{mode === "build" ? "building" : "fixing"}</mark>?
            </h1>
            <Timber pose={busy ? "reading" : "wave"} size={96} />
          </div>

          <div className="seg" role="group" aria-label="Project type">
            {(["build", "fix"] as Mode[]).map((m) => (
              <button key={m} type="button" aria-pressed={mode === m} disabled={busy} onClick={() => setMode(m)}>
                {m === "build" ? "Build something" : "Fix something"}
              </button>
            ))}
          </div>

          <div className="seg" role="group" aria-label="How to start">
            {WAYS.map(([w, label]) => (
              <button key={w} type="button" aria-pressed={way === w} disabled={busy} onClick={() => setWay(w)}>
                {label}
              </button>
            ))}
          </div>

          {way === "photo" ? (
            <label className={`primary upload${busy ? " off" : ""}`}>
              Take a photo of it
              <input type="file" accept="image/*" capture="environment" disabled={busy} onChange={(e) => onPhoto(e.target.files?.[0])} />
            </label>
          ) : (
            <form className="controls" onSubmit={onSubmit}>
              <label className="field">
                <span>{way === "name" ? "What is it?" : "Link to the manual's PDF"}</span>
                <input
                  type={way === "link" ? "url" : "text"}
                  value={text}
                  onChange={(e) => setText(e.target.value)}
                  placeholder={way === "name" ? EXAMPLE[mode] : "https://…/manual.pdf"}
                  maxLength={way === "link" ? 500 : 120}
                  required
                  disabled={busy}
                />
              </label>
              <button type="submit" className="primary" disabled={busy}>
                {busy ? "Working…" : way === "name" ? "Find instructions" : "Read manual"}
              </button>
            </form>
          )}

          <p className="tip">
            {way === "photo" && "Timber figures out what it is and finds the instructions."}
            {way === "name" && "Timber searches the web for the official manual or a reliable guide."}
            {way === "link" && "Timber reads the PDF page by page."}
          </p>

          {error && (
            <p className="error" role="alert">
              {error}
            </p>
          )}
          {busy && (
            <p className="reading" role="status">
              {identified ? `Looks like: ${identified}. ` : ""}Timber is on it · {elapsed} s
              <br />
              <span className="tip">This takes 1–3 minutes. Keep this screen open.</span>
            </p>
          )}
        </div>
      )}

      {phase === "done" && manual && (
        <>
          <p className="hand">{manual.mode === "fix" ? "Got a plan to fix it!" : "Manual read! Here's the plan:"}</p>
          <h1 className="title">{manual.title}</h1>
          <p className="tip">{manual.steps.length} steps</p>
          <ol className="steps">
            {manual.steps.map((step) => (
              <li key={step.number}>
                <div className="step-head">
                  <span className="step-num">{step.number}</span>
                  <span>{step.instruction}</span>
                  {step.page > 0 && <span className="step-page">p. {step.page}</span>}
                </div>
                {step.parts.length > 0 && (
                  <div className="parts">
                    {step.parts.map((p, i) => (
                      <span key={i} className="part">
                        {p.quantity}× {p.color} {p.name}
                      </span>
                    ))}
                  </div>
                )}
              </li>
            ))}
          </ol>
          <div className="row sticky">
            <button type="button" className="secondary" onClick={startOver}>
              New
            </button>
            {manual.mode !== "fix" && (
              <Link className="secondary" href="/parts">
                Check parts
              </Link>
            )}
            <Link className="primary" href="/build">
              Start
            </Link>
          </div>
        </>
      )}
    </main>
  );
}
