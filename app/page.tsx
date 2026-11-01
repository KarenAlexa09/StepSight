"use client";

import { useT } from "../lib/i18n";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, type FormEvent } from "react";
import Timber from "../components/Timber";
import { useDictation } from "../components/useDictation";
import { startDemo } from "../lib/demo";
import { fileToShot } from "../lib/image";
import { sendIntent, type Intent } from "../lib/intent";
import type { Manual } from "../lib/manual";
import { level, loadManual, loadProgress, type Progress } from "../lib/progress";
import { setSettings, useSettings } from "../lib/settings";


const svg = { viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: 2, strokeLinecap: "round", strokeLinejoin: "round", "aria-hidden": true } as const;

export default function Home() {
  const t = useT();
  const router = useRouter();
  const { lang } = useSettings();
  const [manual, setManual] = useState<Manual | null>(null);
  const [progress, setProgress] = useState<Progress | null>(null);
  const [text, setText] = useState("");
  const [typing, setTyping] = useState(false);
  const [error, setError] = useState("");
  const [opening, setOpening] = useState(false);
  const input = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setManual(loadManual());
    setProgress(loadProgress());
    if (location.hash === "#ask") setTyping(true);
  }, []);

  useEffect(() => {
    if (typing) input.current?.focus();
  }, [typing]);

  function go(intent: Intent) {
    sendIntent(intent);
    router.push("/manual");
  }

  const dictation = useDictation(
    (said) => {
      setError("");
      setText(said);
      go({ text: said });
    },
    setError,
    8000,
  );

  function onSubmit(event: FormEvent) {
    event.preventDefault();
    if (text.trim()) go({ text: text.trim() });
  }

  async function onPhoto(file: File | undefined) {
    if (!file) return;
    setError("");
    setOpening(true);
    try {
      go({ image: (await fileToShot(file)).image, text: text.trim() || undefined });
    } catch {
      setError(t("Couldn't open that photo."));
      setOpening(false);
    }
  }

  const { name } = level(progress?.xp ?? 0);
  const steps = manual?.steps.length ?? 0;
  const current = Math.min((progress?.step ?? 0) + 1, steps);
  const finished = Boolean(progress?.finishedAt);
  const busy = dictation.listening || dictation.transcribing || opening;

  return (
    <main className="screen home c">
      <header className="c-top">
        <span className="brand">StepSight</span>
        <div className="c-seg" role="group" aria-label={t("Language")}>
          {(["es", "en"] as const).map((l) => (
            <button key={l} type="button" aria-pressed={lang === l} disabled={busy} onClick={() => setSettings({ lang: l })}>
              {l.toUpperCase()}
            </button>
          ))}
        </div>
      </header>

      <Timber pose={name === "Apprentice" ? "wave" : "hardhat"} size={112} className="c-hero-timber" />
      <h1 className="c-h1 c-center">{t("What do you need to fix or build?")}</h1>

      {dictation.listening || dictation.transcribing || opening ? (
        <div className="c-stage" role="status">
          <p className={`c-live${dictation.live ? "" : " wait"}`} key={dictation.live.split(" ").length}>
            {dictation.live || (opening ? t("Opening your photo…") : dictation.transcribing ? t("Reading what you said…") : t("I’m listening"))}
          </p>
          {dictation.listening ? (
            <span className="c-wave" aria-hidden="true">
              <span /><span /><span /><span /><span /><span /><span />
            </span>
          ) : (
            <span className="c-dots" aria-hidden="true"><i /><i /><i /></span>
          )}
          {dictation.listening && (
            <button type="button" className="c-icon" aria-label={t("Stop listening")} onClick={dictation.toggle}>
              <span className="c-stop" />
            </button>
          )}
        </div>
      ) : (
        <>
          <div className="c-home-actions">
            <label className="c-side" aria-label={t("Use a photo")}>
              <svg {...svg} width="22" height="22">
                <path d="M4 8h3l2-3h6l2 3h3v11H4z" />
                <circle cx="12" cy="13" r="3.5" />
              </svg>
              <input type="file" accept="image/*" capture="environment" aria-label={t("Use a photo")} onChange={(e) => onPhoto(e.target.files?.[0])} />
            </label>
            <button type="button" className="c-mic" aria-label={t("Talk to Timber")} onClick={dictation.toggle}>
              <svg {...svg} width="30" height="30">
                <rect x="9" y="3" width="6" height="12" rx="3" />
                <path d="M5 11a7 7 0 0 0 14 0M12 18v3" />
              </svg>
            </button>
            <button type="button" className="c-side" aria-label={t("Type it")} aria-pressed={typing} onClick={() => setTyping(!typing)}>
              <svg {...svg} width="22" height="22">
                <rect x="3" y="6" width="18" height="12" rx="2" />
                <path d="M7 10h.01M11 10h.01M15 10h.01M8 14h8" />
              </svg>
            </button>
          </div>
          {typing ? (
            <form className="c-bar" onSubmit={onSubmit}>
              <input
                ref={input}
                type="text"
                value={text}
                onChange={(e) => setText(e.target.value)}
                placeholder={t("Type it…")}
                aria-label={t("What do you need?")}
                maxLength={300}
              />
              <button type="submit" className="c-icon" aria-label={t("Send")} disabled={!text.trim()}>
                <svg {...svg} width="20" height="20" strokeWidth={2.4}>
                  <path d="M5 12h14M13 6l6 6-6 6" />
                </svg>
              </button>
            </form>
          ) : (
            <p className="c-muted c-center">{t("Say it, show it or type it")}</p>
          )}
        </>
      )}

      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}

      <div className="c-grow" />

      {!busy && (
        <>
          {manual && (
            <Link href={finished ? "/done" : "/build"} className="c-resume">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              {manual.demo ? <img src={`/demo/anim-${manual.demo}-1.jpg`} alt="" /> : <Timber pose="reading" size={52} move="none" />}
              <span className="c-grow">
                <span className="kicker">{t(finished ? "CONTINUE · DONE" : "CONTINUE · STEP {n} OF {total}", { n: current, total: steps })}</span>
                <span style={{ display: "block", fontSize: 16, fontWeight: 500, margin: "2px 0 8px" }}>{manual.title}</span>
                <span className="c-track">
                  <span style={{ width: `${finished ? 100 : Math.round(((current - 1) / Math.max(steps, 1)) * 100)}%` }} />
                </span>
              </span>
              <svg {...svg} width="20" height="20">
                <path d="M9 6l6 6-6 6" />
              </svg>
            </Link>
          )}
          <div className="c-chips">
            <button
              type="button"
              className="c-chip"
              onClick={() => {
                startDemo("lamp");
                router.push("/build");
              }}
            >
              {t("Try the repair demo")}
            </button>
            <button
              type="button"
              className="c-chip"
              onClick={() => {
                startDemo();
                router.push("/build");
              }}
            >
              {t("Try the demo")}
            </button>
            <button
              type="button"
              className="c-chip"
              onClick={() => {
                startDemo("tower", true);
                router.push("/build");
              }}
            >
              {t("Try AR")}
            </button>
          </div>
        </>
      )}
    </main>
  );
}
