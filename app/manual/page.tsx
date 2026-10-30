"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import SourceTag from "../../components/SourceTag";
import Timber from "../../components/Timber";
import { useDictation } from "../../components/useDictation";
import { fileToShot } from "../../lib/image";
import { takeIntent, type Intent } from "../../lib/intent";
import type { Manual, Mode } from "../../lib/manual";
import { clearManual, clearReplay, freshProgress, loadManual, saveManual, saveProgress } from "../../lib/progress";
import { getSettings } from "../../lib/settings";
import type { Understood } from "../../lib/spark";

const POLL_MS = 3000;
const GIVE_UP_MS = 8 * 60 * 1000;

type Phase = "understanding" | "confirm" | "unclear" | "reading" | "done";

const isLink = (text: string) => /^https:\/\/\S+$/.test(text);
const queryOf = (u: Understood) => (u.mode === "fix" && u.issue ? `${u.name}: ${u.issue}` : u.name).slice(0, 120);
const post = (url: string, body: unknown) =>
  fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });

export default function ManualPage() {
  const router = useRouter();
  const [phase, setPhase] = useState<Phase>("understanding");
  const [intent, setIntent] = useState<Intent>({});
  const [understood, setUnderstood] = useState<Understood | null>(null);
  const [target, setTarget] = useState<{ name: string; mode: Mode } | null>(null);
  const [manual, setManual] = useState<Manual | null>(null);
  const [error, setError] = useState("");
  const [elapsed, setElapsed] = useState(0);
  const [renaming, setRenaming] = useState(false);
  const cancelled = useRef(false);
  const started = useRef(false);
  const retry = useRef<(() => void) | null>(null);

  useEffect(() => {
    cancelled.current = false;
    if (!started.current) {
      started.current = true;
      const next = takeIntent();
      const saved = loadManual();
      if (next) run(next);
      else if (saved) {
        setManual(saved);
        setPhase("done");
      } else router.replace("/");
    }
    return () => {
      cancelled.current = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    window.scrollTo(0, 0);
  }, [phase]);

  useEffect(() => {
    if (phase !== "reading") return;
    const since = Date.now();
    const id = setInterval(() => setElapsed(Math.round((Date.now() - since) / 1000)), 1000);
    return () => clearInterval(id);
  }, [phase]);

  function fail(e: unknown) {
    setError(
      e instanceof TypeError
        ? "Can't reach the server. Check your connection and try again."
        : e instanceof Error && e.message
          ? e.message
          : "Something went wrong",
    );
    setPhase("unclear");
  }

  async function run(next: Intent) {
    setIntent(next);
    setError("");
    retry.current = null;
    const said = next.text?.trim() ?? "";
    if (isLink(said)) return read({ url: said }, "build", said);
    setPhase("understanding");
    try {
      const res = await post("/api/understand", next);
      const data: Understood & { error?: string } = await res.json();
      if (!res.ok) throw new Error(data.error);
      setUnderstood(data);
      if (!data.clear || !data.name.trim()) return setPhase("unclear");
      if (next.image && !said) return setPhase("confirm");
      read({ query: queryOf(data) }, data.mode, data.name);
    } catch (e) {
      fail(e);
    }
  }

  async function read(body: Record<string, string>, mode: Mode, name: string) {
    setError("");
    setTarget({ name, mode });
    retry.current = () => read(body, mode, name);
    setPhase("reading");
    setElapsed(0);
    const started = Date.now();
    let misses = 0;
    try {
      const res = await post("/api/manual", { ...body, mode, lang: getSettings().lang });
      const { id, error } = await res.json();
      if (!res.ok) throw new Error(error);

      while (!cancelled.current && Date.now() - started < GIVE_UP_MS) {
        await new Promise((r) => setTimeout(r, POLL_MS));
        const poll = await fetch(`/api/manual?id=${id}`).catch(() => null);
        if (!poll) {
          if (++misses >= 3) throw new TypeError("Lost the connection");
          continue;
        }
        misses = 0;
        const data = await poll.json();
        if (!poll.ok) throw new Error(data.error);
        if (data.status === "failed") throw new Error("Timber couldn't find good instructions. Try another name or link.");
        if (data.status === "done") {
          const done: Manual = { ...data.manual, mode, pdf: body.url };
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
      if (!cancelled.current) fail(e);
    }
  }

  const dictation = useDictation((said) => run({ ...intent, text: said }), setError, 8000);

  async function onPhoto(file: File | undefined) {
    if (!file) return;
    try {
      run({ image: (await fileToShot(file)).image });
    } catch {
      setError("Couldn't open that photo.");
    }
  }

  function startOver() {
    clearManual();
    router.push("/");
  }

  const busy = dictation.listening || dictation.transcribing;
  const shown = understood ?? { name: "", mode: "build" as Mode, issue: "", clear: false };

  const head = (
    <header className="top">
      <Link href="/" className="round" aria-label="Home">
        ←
      </Link>
      <span className="chip">{phase === "done" ? "Plan ready" : "New project"}</span>
    </header>
  );

  const voice = (
    <button type="button" className="secondary" onClick={dictation.toggle} disabled={dictation.transcribing}>
      {dictation.listening ? "Stop" : dictation.transcribing ? "Hearing you…" : "Tell Timber"}
    </button>
  );

  return (
    <main className="screen paper">
      {head}

      {phase === "understanding" && (
        <div className="controls">
          <div className="hero">
            <h1 className="title big">Taking a look…</h1>
            <Timber pose="reading" size={96} />
          </div>
          <p className="reading" role="status">
            Timber is figuring out what you need.
          </p>
        </div>
      )}

      {phase === "confirm" && intent.image && (
        <div className="controls">
          <h1 className="title big">Is this it?</h1>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img className="wiz-photo" src={intent.image} alt="Your photo" />
          <div className="wiz-card">
            <span className="kicker">I THINK IT’S</span>
            {renaming ? (
              <input
                className="wiz-name"
                value={shown.name}
                maxLength={80}
                aria-label="What is it?"
                autoFocus
                onChange={(e) => setUnderstood({ ...shown, name: e.target.value })}
              />
            ) : (
              <h2 className="folder-title">{shown.name}</h2>
            )}
            <div className="seg" role="group" aria-label="Project type">
              {(["build", "fix"] as Mode[]).map((m) => (
                <button key={m} type="button" aria-pressed={shown.mode === m} onClick={() => setUnderstood({ ...shown, mode: m })}>
                  {m === "build" ? "Build it" : "Fix it"}
                </button>
              ))}
            </div>
            <button type="button" className="link" onClick={() => setRenaming(true)}>
              Not this? Change it
            </button>
          </div>
          <button
            type="button"
            className="primary"
            disabled={busy || !shown.name.trim()}
            onClick={() => read({ query: queryOf(shown) }, shown.mode, shown.name)}
          >
            Yes, find the manual →
          </button>
          {voice}
        </div>
      )}

      {phase === "unclear" && (
        <div className="controls">
          <div className="hero">
            <h1 className="title big">{error ? "That didn’t work" : "I can’t tell what it is"}</h1>
            <Timber pose="reading" size={96} />
          </div>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          {intent.image && !error && <img className="wiz-photo blur" src={intent.image} alt="Your photo, hard to see" />}
          <p className="wiz-note" role="alert">
            {error || "Get a bit closer and add more light, or just tell me what it is."}
          </p>
          {error && retry.current && (
            <button type="button" className="primary" onClick={retry.current}>
              Try again
            </button>
          )}
          <label className={`${error && retry.current ? "secondary" : "primary"} upload`}>
            Retake the photo
            <input type="file" accept="image/*" capture="environment" onChange={(e) => onPhoto(e.target.files?.[0])} />
          </label>
          {voice}
          <Link href="/#ask" className="secondary">
            Type it
          </Link>
        </div>
      )}

      {phase === "reading" && target && (
        <div className="controls">
          <div className="hero">
            <h1 className="title big">Finding your manual</h1>
            <Timber pose="reading" size={96} />
          </div>
          <div className="wiz-card">
            <span className="kicker">I UNDERSTOOD</span>
            <h2 className="folder-title">{target.name}</h2>
            <span className="chip">{target.mode === "fix" ? "FIX" : "BUILD"}</span>
            <Link href="/#ask" className="link">
              Not this? Change it
            </Link>
          </div>
          <p className="reading">
            <span role="status">Reading it now</span>
            <span aria-hidden="true"> · {elapsed < 60 ? `${elapsed} s` : `${Math.floor(elapsed / 60)} min ${elapsed % 60} s`}</span>
            <br />
            <span className="tip">This takes 1–3 minutes. Keep this screen open.</span>
          </p>
          <Link href="/" className="secondary">
            Cancel
          </Link>
        </div>
      )}

      {phase === "done" && manual && (
        <>
          <p className="hand">{manual.mode === "fix" ? "Got a plan to fix it!" : "Manual read! Here's the plan:"}</p>
          <h1 className="title">{manual.title}</h1>
          <SourceTag manual={manual} />
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
