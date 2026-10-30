"use client";

import { useT } from "../../lib/i18n";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import SourceTag from "../../components/SourceTag";
import Timber from "../../components/Timber";
import { useDictation } from "../../components/useDictation";
import { useTimber } from "../../components/useTimber";
import { fileToShot } from "../../lib/image";
import { takeIntent, type Intent } from "../../lib/intent";
import type { Manual, Mode } from "../../lib/manual";
import { clearManual, clearReplay, freshProgress, loadManual, saveManual, saveProgress } from "../../lib/progress";
import { getSettings } from "../../lib/settings";
import type { Turn, Understood } from "../../lib/spark";

const POLL_MS = 3000;
const GIVE_UP_MS = 8 * 60 * 1000;

type Phase = "understanding" | "ask" | "confirm" | "unclear" | "reading" | "done";

const MAX_QUESTIONS = 4;

const isLink = (text: string) => /^https:\/\/\S+$/.test(text);
const queryOf = (u: Understood) => (u.query.trim() || (u.mode === "fix" && u.issue ? `${u.name}: ${u.issue}` : u.name)).slice(0, 120);
const post = (url: string, body: unknown) =>
  fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });

export default function ManualPage() {
  const t = useT();
  const router = useRouter();
  const [phase, setPhase] = useState<Phase>("understanding");
  const [intent, setIntent] = useState<Intent>({});
  const [understood, setUnderstood] = useState<Understood | null>(null);
  const [target, setTarget] = useState<{ name: string; mode: Mode; generic?: boolean } | null>(null);
  const [manual, setManual] = useState<Manual | null>(null);
  const [error, setError] = useState("");
  const [elapsed, setElapsed] = useState(0);
  const [renaming, setRenaming] = useState(false);
  const [chat, setChat] = useState<Turn[]>([]);
  const [options, setOptions] = useState<string[]>([]);
  const [reply, setReply] = useState("");
  const [thinking, setThinking] = useState(false);
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
        ? t("Can't reach the server. Check your connection and try again.")
        : e instanceof Error && e.message
          ? t(e.message)
          : t("Something went wrong"),
    );
    setPhase("unclear");
  }

  async function run(next: Intent, talk: Turn[] = []) {
    setIntent(next);
    setError("");
    retry.current = null;
    const said = next.text?.trim() ?? "";
    if (isLink(said)) return read({ url: said }, "build", said);
    if (talk.length) setThinking(true);
    else setPhase("understanding");
    try {
      const res = await post("/api/understand", { ...next, history: talk.slice(0, -1), lang: getSettings().lang });
      const data: Understood & { error?: string } = await res.json();
      if (!res.ok) throw new Error(data.error);
      setUnderstood(data);
      setThinking(false);
      const asked = talk.filter((turn) => turn.role === "timber").length;
      const question = data.question || (!data.ready && data.needsModel && !data.model.trim() ? t("What brand and model is it? A photo of the label works too.") : "");
      const asking = !data.ready && question && asked < MAX_QUESTIONS;
      if (!asking && (!data.clear || !data.name.trim())) return setPhase("unclear");
      if (asking) {
        const before = talk.length ? talk : said ? [{ role: "you" as const, text: said }] : [];
        setChat([...before, { role: "timber", text: question }]);
        setOptions(data.options);
        setReply("");
        setPhase("ask");
        timber.say(question);
        return;
      }
      if (next.image && !said && !talk.length) return setPhase("confirm");
      search(data);
    } catch (e) {
      setThinking(false);
      fail(e);
    }
  }

  function answer(text: string) {
    const said = text.trim();
    if (!said || thinking) return;
    setOptions([]);
    setReply("");
    const talk: Turn[] = [...chat, { role: "you", text: said }];
    setChat(talk);
    run({ image: intent.image, text: said }, talk);
  }

  function search(u: Understood) {
    read({ query: queryOf(u) }, u.mode, u.name, u.needsModel && (!u.model.trim() || /generic/i.test(u.model)));
  }

  async function read(body: Record<string, string>, mode: Mode, name: string, generic = false) {
    setError("");
    setTarget({ name, mode, generic });
    retry.current = () => read(body, mode, name, generic);
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
          if (++misses >= 3) throw new TypeError(t("Lost the connection"));
          continue;
        }
        misses = 0;
        const data = await poll.json();
        if (!poll.ok) throw new Error(data.error);
        if (data.status === "failed") throw new Error(t("Timber couldn't find good instructions. Try another name or link."));
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
      if (!cancelled.current) throw new Error(t("This is taking too long. Try again."));
    } catch (e) {
      if (!cancelled.current) fail(e);
    }
  }

  const timber = useTimber(() => {});
  const dictation = useDictation((said) => (phase === "ask" ? answer(said) : run({ ...intent, text: said })), setError, 8000);

  async function onPhoto(file: File | undefined) {
    if (!file) return;
    try {
      const image = (await fileToShot(file)).image;
      if (phase !== "ask") return run({ image });
      const talk: Turn[] = [...chat, { role: "you", text: "(sent a photo)" }];
      setChat(talk);
      setOptions([]);
      run({ image, text: "" }, talk);
    } catch {
      setError(t("Couldn't open that photo."));
    }
  }

  function startOver() {
    clearManual();
    router.push("/");
  }

  const busy = dictation.listening || dictation.transcribing;
  const shown: Understood = understood ?? { name: "", mode: "build", issue: "", clear: false, ready: false, question: "", options: [], model: "", needsModel: false, query: "" };

  const head = (
    <header className="top">
      <Link href="/" className="round" aria-label={t("Home")}>
        ←
      </Link>
      <span className="chip">{phase === "done" ? t("Plan ready") : t("New project")}</span>
    </header>
  );

  const voice = (
    <button type="button" className="secondary" onClick={dictation.toggle} disabled={dictation.transcribing}>
      {dictation.listening ? t("Stop") : dictation.transcribing ? t("Hearing you…") : t("Tell Timber")}
    </button>
  );

  return (
    <main className="screen paper">
      {head}

      {phase === "understanding" && (
        <div className="controls">
          <div className="hero">
            <h1 className="title big">{t("Taking a look…")}</h1>
            <Timber pose="reading" size={96} />
          </div>
          <p className="reading" role="status">
            {t("Timber is figuring out what you need.")} <span className="dots" aria-hidden="true"><i /><i /><i /></span>
          </p>
          <span className="busy-bar" aria-hidden="true" />
        </div>
      )}

      {phase === "ask" && (
        <div className="controls">
          <div className="hero">
            <h1 className="title big">{t("Tell me a bit more")}</h1>
            <Timber pose="think" size={96} />
          </div>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          {intent.image && <img className="wiz-photo small" src={intent.image} alt={t("Your photo")} />}
          <div className="chat" role="log" aria-live="polite">
            {chat.map((turn, i) => (
              <p key={i} className={`bubble ${turn.role}`}>
                {turn.role === "you" ? t(turn.text) : turn.text}
              </p>
            ))}
            {thinking && (
              <p className="bubble timber" role="status" aria-label={t("Timber is thinking…")}>
                <span className="dots" aria-hidden="true"><i /><i /><i /></span>
              </p>
            )}
          </div>
          {!thinking && options.length > 0 && (
            <div className="chips">
              {options.map((option) => (
                <button key={option} type="button" className="ask-chip" disabled={busy} onClick={() => answer(option)}>
                  {option}
                </button>
              ))}
            </div>
          )}
          <form
            className="ask-field"
            onSubmit={(e) => {
              e.preventDefault();
              answer(reply);
            }}
          >
            <input
              type="text"
              value={reply}
              onChange={(e) => setReply(e.target.value)}
              placeholder={dictation.listening ? t("Listening…") : t("Type your answer")}
              aria-label={t("Type your answer")}
              maxLength={300}
              disabled={thinking || dictation.transcribing}
            />
            <button
              type="button"
              className={`ask-send mic${dictation.listening ? " on" : ""}`}
              aria-label={dictation.listening ? t("Stop listening") : t("Talk to Timber")}
              onClick={dictation.toggle}
              disabled={thinking || dictation.transcribing}
            >
              <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <rect x="9" y="3" width="6" height="12" rx="3" />
                <path d="M5 11a7 7 0 0 0 14 0M12 18v3" />
              </svg>
            </button>
            <button type="submit" className="ask-send" aria-label={t("Send")} disabled={!reply.trim() || thinking}>
              <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M5 12h14M13 6l6 6-6 6" />
              </svg>
            </button>
          </form>
          {!understood?.model.trim() && (
            <label className="secondary upload">
              {t("Send a photo (label or product)")}
              <input type="file" accept="image/*" capture="environment" disabled={thinking || busy} onChange={(e) => onPhoto(e.target.files?.[0])} />
            </label>
          )}
          {dictation.transcribing && (
            <p className="reading" role="status">
              {t("Reading what you said…")} <span className="dots" aria-hidden="true"><i /><i /><i /></span>
            </p>
          )}
          {understood?.name && !options.some((o) => /generic|genéric/i.test(o)) && (
            <button type="button" className="secondary" disabled={thinking || busy} onClick={() => search(understood)}>
              {understood.needsModel && !understood.model.trim() ? t("Skip, use a generic guide") : t("Search with what I have")}
            </button>
          )}
        </div>
      )}

      {phase === "confirm" && intent.image && (
        <div className="controls">
          <h1 className="title big">{t("Is this it?")}</h1>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img className="wiz-photo" src={intent.image} alt={t("Your photo")} />
          <div className="wiz-card">
            <span className="kicker">{t("I THINK IT’S")}</span>
            {renaming ? (
              <input
                className="wiz-name"
                value={shown.name}
                maxLength={80}
                aria-label={t("What is it?")}
                autoFocus
                onChange={(e) => setUnderstood({ ...shown, name: e.target.value })}
              />
            ) : (
              <h2 className="folder-title">{shown.name}</h2>
            )}
            <div className="seg" role="group" aria-label={t("Project type")}>
              {(["build", "fix"] as Mode[]).map((m) => (
                <button key={m} type="button" aria-pressed={shown.mode === m} onClick={() => setUnderstood({ ...shown, mode: m })}>
                  {m === "build" ? t("Build it") : t("Fix it")}
                </button>
              ))}
            </div>
            <button type="button" className="link" onClick={() => setRenaming(true)}>
              {t("Not this? Change it")}
            </button>
          </div>
          <button
            type="button"
            className="primary"
            disabled={busy || !shown.name.trim()}
            onClick={() => search(shown)}
          >
            {t("Yes, find the manual →")}
          </button>
          {voice}
        </div>
      )}

      {phase === "unclear" && (
        <div className="controls">
          <div className="hero">
            <h1 className="title big">{error ? t("That didn’t work") : t("I can’t tell what it is")}</h1>
            <Timber pose="reading" size={96} />
          </div>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          {intent.image && !error && <img className="wiz-photo blur" src={intent.image} alt={t("Your photo, hard to see")} />}
          <p className="wiz-note" role="alert">
            {error || t("Get a bit closer and add more light, or just tell me what it is.")}
          </p>
          {error && retry.current && (
            <button type="button" className="primary" onClick={retry.current} disabled={busy}>
              {t("Try again")}
            </button>
          )}
          <label className={`${error && retry.current ? "secondary" : "primary"} upload`}>
            {t("Retake the photo")}
            <input type="file" accept="image/*" capture="environment" disabled={busy} onChange={(e) => onPhoto(e.target.files?.[0])} />
          </label>
          {voice}
          <Link href="/#ask" className="secondary">
            {t("Type it")}
          </Link>
        </div>
      )}

      {phase === "reading" && target && (
        <div className="controls">
          <div className="hero">
            <h1 className="title big">{t("Searching for your manual")}</h1>
            <Timber pose="reading" size={96} />
          </div>
          <div className="wiz-card">
            <span className="kicker">{t("I UNDERSTOOD")}</span>
            <h2 className="folder-title">{target.name}</h2>
            <span className="chip">{target.mode === "fix" ? t("FIX") : t("BUILD")}</span>
            {target.generic && <span className="chip">{t("GENERIC GUIDE")}</span>}
            <Link href="/#ask" className="link">
              {t("Not this? Change it")}
            </Link>
          </div>
          <span className="busy-bar" aria-hidden="true" />
          <p className="reading">
            <span role="status">{t("Searching the web and reading it")}</span> <span className="dots" aria-hidden="true"><i /><i /><i /></span>
            <span aria-hidden="true"> · {elapsed < 60 ? `${elapsed} s` : `${Math.floor(elapsed / 60)} min ${elapsed % 60} s`}</span>
            <br />
            <span className="tip">{t("This takes 1–3 minutes. Keep this screen open.")}</span>
          </p>
          <Link href="/" className="secondary">
            {t("Cancel")}
          </Link>
        </div>
      )}

      {phase === "done" && manual && (
        <>
          <p className="hand">{manual.mode === "fix" ? t("Got a plan to fix it!") : t("Manual read! Here's the plan:")}</p>
          <h1 className="title">{manual.title}</h1>
          <SourceTag manual={manual} />
          <p className="tip">{t("{n} steps", { n: manual.steps.length })}</p>
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
              {t("New")}
            </button>
            {manual.mode !== "fix" && (
              <Link className="secondary" href="/parts">
                {t("Check parts")}
              </Link>
            )}
            <Link className="primary" href="/build">
              {t("Start")}
            </Link>
          </div>
        </>
      )}
    </main>
  );
}
