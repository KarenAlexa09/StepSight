"use client";

import { useT } from "../../lib/i18n";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, type FormEvent } from "react";
import SourceTag from "../../components/SourceTag";
import Timber from "../../components/Timber";
import { useDictation } from "../../components/useDictation";
import { useTimber } from "../../components/useTimber";
import { prepareAnimations } from "../../lib/anim";
import { fileToShot } from "../../lib/image";
import { takeIntent, type Intent } from "../../lib/intent";
import type { Manual, Mode, ReadEvent } from "../../lib/manual";
import { clearManual, clearReplay, freshProgress, loadManual, saveManual, saveProgress } from "../../lib/progress";
import { getSettings } from "../../lib/settings";
import type { Turn, Understood } from "../../lib/spark";

type Phase = "understanding" | "ask" | "confirm" | "unclear" | "reading" | "done";
type Activity = { text: string; host?: string };

const MAX_QUESTIONS = 4;

const isLink = (text: string) => /^https:\/\/\S+$/.test(text);
const queryOf = (u: Understood) => (u.query.trim() || (u.mode === "fix" && u.issue ? `${u.name}: ${u.issue}` : u.name)).slice(0, 120);
const post = (url: string, body: unknown) =>
  fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
const hostOf = (url: string) => {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return "";
  }
};

const svg = { viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: 2, strokeLinecap: "round", strokeLinejoin: "round", "aria-hidden": true } as const;

export default function ManualPage() {
  const t = useT();
  const router = useRouter();
  const [phase, setPhase] = useState<Phase>("understanding");
  const [intent, setIntent] = useState<Intent>({});
  const [understood, setUnderstood] = useState<Understood | null>(null);
  const [target, setTarget] = useState<{ name: string; mode: Mode; generic?: boolean } | null>(null);
  const [manual, setManual] = useState<Manual | null>(null);
  const [error, setError] = useState("");
  const [activity, setActivity] = useState<Activity[]>([]);
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

  async function read(body: Record<string, string>, mode: Mode, name: string, generic = false, retried = false) {
    setError("");
    setTarget({ name, mode, generic });
    retry.current = () => read(body, mode, name, generic);
    setPhase("reading");
    setActivity([{ text: t("Got it: {name}", { name }) }]);
    try {
      const res = await post("/api/manual", { ...body, mode, lang: getSettings().lang });
      if (!res.ok || !res.body) throw new Error((await res.json().catch(() => ({}))).error);
      let buffer = "";
      let last: ReadEvent | null = null;
      // getReader, not for-await: some Safari versions can't iterate a stream.
      const reader = res.body.pipeThrough(new TextDecoderStream()).getReader();
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        if (cancelled.current) return void reader.cancel();
        buffer += value;
        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";
        for (const line of lines.filter(Boolean)) {
          const event: ReadEvent = JSON.parse(line);
          last = event;
          if (event.type === "search") setActivity((a) => [...a, { text: t("Searched “{q}”", { q: event.query }) }]);
          if (event.type === "open") setActivity((a) => [...a, { text: t("Reading"), host: hostOf(event.url) }]);
        }
      }
      if (last?.type === "done") {
        const done: Manual = { ...last.manual, mode, pdf: body.url };
        setManual(done);
        setPhase("done");
        saveManual(done);
        saveProgress(freshProgress());
        clearReplay();
        prepareAnimations(done);
        return;
      }
      if (!retried) return read(body, mode, name, generic, true);
      throw new Error(t("Timber couldn't find good instructions. Try another name or link."));
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

  function onReply(event: FormEvent) {
    event.preventDefault();
    answer(reply);
  }

  const busy = dictation.listening || dictation.transcribing;
  const shown: Understood = understood ?? { name: "", mode: "build", issue: "", clear: false, ready: false, question: "", options: [], model: "", needsModel: false, query: "" };
  const asked = chat.filter((turn) => turn.role === "timber").length;
  const question = [...chat].reverse().find((turn) => turn.role === "timber")?.text ?? "";
  const lastYou = [...chat].reverse().find((turn) => turn.role === "you")?.text ?? "";

  const back = (
    <Link href="/" className="c-back" aria-label={t("Home")}>
      <svg {...svg} width="22" height="22">
        <path d="M15 6l-6 6 6 6" />
      </svg>
    </Link>
  );

  const photoChip = (
    <label className="c-chip">
      <svg {...svg} width="16" height="16">
        <path d="M4 8h3l2-3h6l2 3h3v11H4z" />
        <circle cx="12" cy="13" r="3.5" />
      </svg>
      {t("Send a photo")}
      <input type="file" accept="image/*" capture="environment" disabled={thinking || busy} onChange={(e) => onPhoto(e.target.files?.[0])} />
    </label>
  );

  const listening = (
    <>
      <p className={`c-live${dictation.live ? "" : " wait"}`} key={dictation.live.split(" ").length}>
        {dictation.live || (dictation.transcribing ? t("Reading what you said…") : t("I’m listening"))}
      </p>
      {dictation.listening ? (
        <span className="c-wave" aria-hidden="true">
          <span /><span /><span /><span /><span /><span /><span />
        </span>
      ) : (
        <span className="c-dots" aria-hidden="true"><i /><i /><i /></span>
      )}
    </>
  );

  return (
    <main className="screen c">
      {phase === "understanding" && (
        <>
          <header className="c-top">{back}</header>
          <div className="c-stage" role="status">
            <Timber pose="think" size={96} />
            <p className="c-live wait">{t("Taking a look…")}</p>
            <span className="c-dots" aria-hidden="true"><i /><i /><i /></span>
          </div>
        </>
      )}

      {phase === "ask" && (
        <>
          <header className="c-top">
            {back}
            <span className="c-dashes" aria-label={t("Question {n}", { n: asked })}>
              {Array.from({ length: Math.max(asked, 3) }, (_, i) => (
                <span key={i} className={i < asked ? "on" : ""} />
              ))}
            </span>
            <span style={{ width: 34 }} />
          </header>
          {lastYou && <p className="c-bubble">{t(lastYou)}</p>}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          {intent.image && !lastYou && <img className="wiz-photo small" src={intent.image} alt={t("Your photo")} />}
          <div className="c-ask">
            <Timber pose="think" size={64} />
            <h1 className="c-h1" style={{ fontSize: 26, lineHeight: "32px" }} aria-live="polite">
              {question}
            </h1>
          </div>

          <div className="c-stage" role="status">
            {busy ? listening : thinking ? <span className="c-dots" aria-label={t("Timber is thinking…")}><i /><i /><i /></span> : null}
          </div>

          {!thinking && !busy && (
            <div className="c-chips">
              {options.slice(0, 3).map((option) => (
                <button key={option} type="button" className="c-chip" onClick={() => answer(option)}>
                  {option}
                </button>
              ))}
              {!understood?.model.trim() && photoChip}
            </div>
          )}
          {understood?.name && !thinking && !busy && !options.some((o) => /generic|genéric/i.test(o)) && (
            <button type="button" className="c-link" style={{ alignSelf: "center" }} onClick={() => search(understood)}>
              {understood.needsModel && !understood.model.trim() ? t("Skip, use a generic guide") : t("Search with what I have")}
            </button>
          )}
          {error && (
            <p className="error" role="alert">
              {error}
            </p>
          )}

          <form className="c-bar" onSubmit={onReply}>
            <input
              type="text"
              value={reply}
              onChange={(e) => setReply(e.target.value)}
              placeholder={dictation.listening ? t("Listening… it sends when you stop") : t("Type or tap the mic")}
              aria-label={t("Type your answer")}
              maxLength={300}
              disabled={thinking || busy}
            />
            {reply.trim() ? (
              <button type="submit" className="c-icon" aria-label={t("Send")} disabled={thinking}>
                <svg {...svg} width="20" height="20" strokeWidth={2.4}>
                  <path d="M5 12h14M13 6l6 6-6 6" />
                </svg>
              </button>
            ) : (
              <button
                type="button"
                className="c-icon"
                aria-label={dictation.listening ? t("Stop listening") : t("Talk to Timber")}
                onClick={dictation.toggle}
                disabled={thinking || dictation.transcribing}
              >
                {dictation.listening ? (
                  <span className="c-stop" />
                ) : (
                  <svg {...svg} width="20" height="20">
                    <rect x="9" y="3" width="6" height="12" rx="3" />
                    <path d="M5 11a7 7 0 0 0 14 0M12 18v3" />
                  </svg>
                )}
              </button>
            )}
          </form>
        </>
      )}

      {phase === "confirm" && intent.image && (
        <>
          <header className="c-top">{back}</header>
          <h1 className="c-h1">{t("Is this it?")}</h1>
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
            <div className="c-seg" role="group" aria-label={t("Project type")}>
              {(["build", "fix"] as Mode[]).map((m) => (
                <button key={m} type="button" aria-pressed={shown.mode === m} onClick={() => setUnderstood({ ...shown, mode: m })}>
                  {m === "build" ? t("Build it") : t("Fix it")}
                </button>
              ))}
            </div>
            <button type="button" className="c-link" onClick={() => setRenaming(true)}>
              {t("Not this? Change it")}
            </button>
          </div>
          <div className="c-grow" />
          <button type="button" className="c-btn" disabled={busy || !shown.name.trim()} onClick={() => search(shown)}>
            {t("Yes, find the manual →")}
          </button>
        </>
      )}

      {phase === "unclear" && (
        <>
          <header className="c-top">{back}</header>
          <div className="c-ask">
            <Timber pose="oops" size={72} />
            <h1 className="c-h1">{error ? t("That didn’t work") : t("I can’t tell what it is")}</h1>
          </div>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          {intent.image && !error && <img className="wiz-photo blur" src={intent.image} alt={t("Your photo, hard to see")} />}
          <p className="c-muted" role="alert">
            {error || t("Get a bit closer and add more light, or just tell me what it is.")}
          </p>
          <div className="c-stage">{busy && listening}</div>
          {error && retry.current && (
            <button type="button" className="c-btn" onClick={retry.current} disabled={busy}>
              {t("Try again")}
            </button>
          )}
          <div className="c-chips">
            {photoChip}
            <button type="button" className="c-chip" onClick={dictation.toggle} disabled={dictation.transcribing}>
              {dictation.listening ? t("Stop") : t("Tell Timber")}
            </button>
            <Link href="/#ask" className="c-chip">
              {t("Type it")}
            </Link>
          </div>
        </>
      )}

      {phase === "reading" && target && (
        <>
          <header className="c-top">
            <span className="c-muted" style={{ fontSize: 13 }}>
              {target.name} · {target.mode === "fix" ? t("Fix") : t("Build")}
              {target.generic && ` · ${t("generic guide")}`}
            </span>
            <Link href="/" className="c-link">
              {t("Cancel")}
            </Link>
          </header>
          <div className="c-radar" aria-hidden="true">
            <i />
            <i />
            <i />
            <span className="c-book">
              <b />
              <b />
              <em />
            </span>
            <Timber pose="reading" size={84} move="none" />
          </div>
          <h1 className="c-h1 c-center" style={{ fontSize: 28 }}>
            {intent.text && isLink(intent.text) ? t("Reading your manual") : t("Looking for your guide")}
          </h1>
          <ul className="c-log" role="status" aria-live="polite">
            {activity.slice(-4).map((a, i) => (
              <li key={activity.length - 4 + i}>
                <svg className="c-check" {...svg} width="18" height="18" strokeWidth={2.4}>
                  <path d="M5 12.5l4.5 4.5L19 7.5" />
                </svg>
                <svg className="c-spin" {...svg} width="18" height="18" strokeWidth={2.4}>
                  <path d="M12 3a9 9 0 1 1-9 9" />
                </svg>
                <span>
                  {a.text} {a.host && <span className="c-host">{a.host}</span>}
                </span>
              </li>
            ))}
          </ul>
          <div className="c-grow" />
          <p className="c-muted c-center" style={{ fontSize: 13 }}>
            {t("Usually under a minute. Keep this screen open.")}
          </p>
        </>
      )}

      {phase === "done" && manual && (
        <>
          <header className="c-top">
            {back}
            <button type="button" className="c-link" onClick={startOver}>
              {t("Start another")}
            </button>
          </header>
          <div className="c-ask">
            <div className="c-grow">
              <p className="kicker">{t("YOUR PLAN · {n} STEPS", { n: manual.steps.length })}</p>
              <h1 className="c-h1" style={{ marginTop: 6 }}>
                {manual.title}
              </h1>
            </div>
            <Timber pose="thumbs" size={72} />
          </div>
          <SourceTag manual={manual} />
          {manual.prep && manual.prep.length > 0 && (
            <p className="c-muted">
              <b style={{ color: "var(--ink)" }}>{t("Before you start:")}</b> {manual.prep.join(" · ")}
            </p>
          )}
          <ol className="c-steps">
            {manual.steps.map((step, i) => (
              <li key={step.number} style={{ animationDelay: `${i * 120}ms` }}>
                <span className={`c-num${step.safety ? " hi" : ""}`}>{step.number}</span>
                <span className="c-grow">
                  {step.instruction}
                  {step.parts.length > 0 && (
                    <span className="c-muted" style={{ display: "block", fontSize: 13 }}>
                      {step.parts.map((p) => `${p.quantity}× ${p.color} ${p.name}`).join(" · ")}
                    </span>
                  )}
                </span>
                {step.page > 0 && <span className="c-muted" style={{ fontSize: 12 }}>p. {step.page}</span>}
              </li>
            ))}
          </ol>
          <div className="c-sticky">
            {manual.mode !== "fix" && (
              <Link className="c-btn ghost" href="/parts">
                {t("Check parts")}
              </Link>
            )}
            <Link className="c-btn" href="/build">
              {t("Start")}
              <svg {...svg} width="20" height="20" strokeWidth={2.4}>
                <path d="M5 12h14M13 6l6 6-6 6" />
              </svg>
            </Link>
          </div>
        </>
      )}
    </main>
  );
}
