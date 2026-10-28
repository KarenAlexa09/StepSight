"use client";

import Link from "next/link";
import { useEffect, useRef, useState, type FormEvent } from "react";
import Timber from "../../components/Timber";
import type { Manual } from "../../lib/manual";
import { clearManual, clearReplay, freshProgress, loadManual, saveManual, saveProgress } from "../../lib/progress";

const POLL_MS = 3000;
const GIVE_UP_MS = 8 * 60 * 1000;

type Phase = "idle" | "reading" | "done";

export default function ManualPage() {
  const [url, setUrl] = useState("");
  const [phase, setPhase] = useState<Phase>("idle");
  const [manual, setManual] = useState<Manual | null>(null);
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

  async function read(event: FormEvent) {
    event.preventDefault();
    setError("");
    setPhase("reading");
    setElapsed(0);
    const started = Date.now();
    try {
      const res = await fetch("/api/manual", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url }),
      });
      const { id, error } = await res.json();
      if (!res.ok) throw new Error(error);

      while (!cancelled.current && Date.now() - started < GIVE_UP_MS) {
        await new Promise((r) => setTimeout(r, POLL_MS));
        setElapsed(Math.round((Date.now() - started) / 1000));
        const poll = await fetch(`/api/manual?id=${id}`);
        const data = await poll.json();
        if (!poll.ok) throw new Error(data.error);
        if (data.status === "failed") throw new Error("Timber couldn't read that manual. Try another link.");
        if (data.status === "done") {
          setManual(data.manual);
          setPhase("done");
          saveManual(data.manual);
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

  function startOver() {
    clearManual();
    setManual(null);
    setPhase("idle");
  }


  return (
    <main className="screen paper">
      <header className="top">
        <Link href="/" className="round" aria-label="Home">
          ←
        </Link>
        <span className="chip">{phase === "done" ? "Manual ready" : "New project"}</span>
      </header>

      {phase !== "done" && (
        <form className="controls" onSubmit={read}>
          <div className="hero">
            <h1 className="title big">
              Paste the <mark>manual</mark>
            </h1>
            <Timber size={96} className={phase === "reading" ? "bob" : ""} />
          </div>
          <label className="field">
            <span>Link to the manual&apos;s PDF</span>
            <input
              type="url"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder="https://www.lego.com/cdn/…/6450121.pdf"
              required
              disabled={phase === "reading"}
            />
          </label>
          <button type="submit" className="primary" disabled={phase === "reading"}>
            {phase === "reading" ? "Reading…" : "Read manual"}
          </button>
          {error && (
            <p className="error" role="alert">
              {error}
            </p>
          )}
          {phase === "reading" && (
            <p className="reading" role="status">
              Timber is reading your manual · {elapsed} s
              <br />
              <span className="tip">Big manuals take 2–3 minutes. Keep this screen open.</span>
            </p>
          )}
        </form>
      )}

      {phase === "done" && manual && (
        <>
          <p className="hand">Manual read! Here&apos;s the plan:</p>
          <h1 className="title">{manual.title}</h1>
          <p className="tip">
            {manual.steps.length} steps · {new Set(manual.steps.map((s) => s.page)).size} pages
          </p>
          <ol className="steps">
            {manual.steps.map((step) => (
              <li key={step.number}>
                <div className="step-head">
                  <span className="step-num">{step.number}</span>
                  <span>{step.instruction}</span>
                  <span className="step-page">p. {step.page}</span>
                </div>
                <div className="parts">
                  {step.parts.map((p, i) => (
                    <span key={i} className="part">
                      {p.quantity}× {p.color} {p.name}
                    </span>
                  ))}
                </div>
              </li>
            ))}
          </ol>
          <div className="row sticky">
            <button type="button" className="secondary" onClick={startOver}>
              New
            </button>
            <Link className="secondary" href="/parts">
              Check parts
            </Link>
            <Link className="primary" href="/build">
              Start building
            </Link>
          </div>
        </>
      )}
    </main>
  );
}
