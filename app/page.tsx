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

const AUTO_SEND_MS = 1600;
const EXAMPLES = ["Build a Kallax shelf", "My bike chain fell off", "Set up a coffee machine"];
const BARS = [10, 22, 34, 18, 40, 28, 14, 36, 24, 44, 16, 30, 20, 38, 12, 26, 32, 18, 10];

const svg = { viewBox: "0 0 24 24", fill: "none", strokeLinecap: "round", strokeLinejoin: "round", "aria-hidden": true } as const;

export default function Home() {
  const t = useT();
  const router = useRouter();
  const { lang } = useSettings();
  const [manual, setManual] = useState<Manual | null>(null);
  const [progress, setProgress] = useState<Progress | null>(null);
  const [text, setText] = useState("");
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);
  const [opening, setOpening] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  useEffect(() => {
    setManual(loadManual());
    setProgress(loadProgress());
    if (location.hash === "#ask") input.current?.focus();
    return () => clearTimeout(timer.current);
  }, []);

  function go(intent: Intent) {
    clearTimeout(timer.current);
    sendIntent(intent);
    router.push("/manual");
  }

  const dictation = useDictation(
    (said) => {
      setError("");
      setText(said);
      setPending(true);
      timer.current = setTimeout(() => go({ text: said }), AUTO_SEND_MS);
    },
    setError,
    8000,
  );

  function edit() {
    clearTimeout(timer.current);
    setPending(false);
    input.current?.focus();
  }

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

  const xp = progress?.xp ?? 0;
  const { name } = level(xp);
  const steps = manual?.steps.length ?? 0;
  const current = Math.min((progress?.step ?? 0) + 1, steps);
  const finished = Boolean(progress?.finishedAt);
  const busy = dictation.listening || dictation.transcribing;

  return (
    <main className="screen paper home">
      <header className="top">
        <span className="brand">StepSight</span>
        <span className="row">
          <button
            type="button"
            className="chip lang"
            aria-label={lang === "en" ? "Language: English. Switch to Spanish" : "Idioma: español. Cambiar a inglés"}
            onClick={() => setSettings({ lang: lang === "en" ? "es" : "en" })}
          >
            {lang === "en" ? "EN" : "ES"}
          </button>
          <span className="chip hi">★ {xp} xp</span>
        </span>
      </header>

      <section className="greet">
        <div className="greet-timber">
          <Timber pose={name === t("Apprentice") ? "wave" : "hardhat"} move="none" size={124} />
        </div>
        <p className="hand">{dictation.listening ? t("Go ahead…") : opening ? t("One sec…") : t("Hi there, {name}!", { name: t(name).toLowerCase() })}</p>
        <h1 className="title big">{dictation.listening ? t("I’m listening") : dictation.transcribing ? t("Hearing you…") : opening ? t("Opening your photo…") : t("What do you need?")}</h1>

        {dictation.listening ? (
          <div className="ask-wave" aria-hidden="true">
            {BARS.map((h, i) => (
              <span key={i} style={{ height: h, animationDelay: `${i * 70}ms` }} />
            ))}
          </div>
        ) : (
          <form className="ask-field" onSubmit={onSubmit}>
            <label className="ask-cam" aria-label={t("Use a photo")} aria-busy={opening}>
              <svg {...svg} width="24" height="24" stroke="currentColor" strokeWidth="2.2">
                <path d="M4 8h3l2-3h6l2 3h3v11H4z" />
                <circle cx="12" cy="13" r="3.5" />
              </svg>
              <input type="file" accept="image/*" capture="environment" onChange={(e) => onPhoto(e.target.files?.[0])} />
            </label>
            <input
              ref={input}
              type="text"
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder={t("Type it, or tap the mic…")}
              aria-label={t("What do you need?")}
              maxLength={300}
              disabled={dictation.transcribing}
            />
            <button type="submit" className="ask-send" aria-label={t("Send")} disabled={!text.trim()}>
              <svg {...svg} width="22" height="22" stroke="currentColor" strokeWidth="2.6">
                <path d="M5 12h14M13 6l6 6-6 6" />
              </svg>
            </button>
          </form>
        )}

        <button type="button" className={`ask-mic${dictation.listening ? " stop" : ""}`} onClick={dictation.toggle} disabled={dictation.transcribing}>
          {dictation.listening ? (
            <>
              <span className="ask-stop" />
              {t("Stop")}
            </>
          ) : (
            <>
              <svg {...svg} width="24" height="24" stroke="currentColor" strokeWidth="2.4">
                <rect x="9" y="3" width="6" height="12" rx="3" />
                <path d="M5 11a7 7 0 0 0 14 0M12 18v3" />
              </svg>
              {t("Tell Timber")}
            </>
          )}
        </button>
      </section>

      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}

      {pending && !busy && (
        <section className="continue" aria-live="polite">
          <span className="kicker">{t("I HEARD")}</span>
          <h2 className="folder-title">{text}</h2>
          <div className="ask-actions">
            <button type="button" className="secondary" onClick={edit}>
              {t("Edit")}
            </button>
            <button type="button" className="cta auto" onClick={() => go({ text })}>
              <span>{t("Send now")}</span>
            </button>
          </div>
        </section>
      )}

      {!pending && !busy && (
        <>
          <section>
            <p className="kicker">{t("OR TRY ONE")}</p>
            <div className="chips">
              {EXAMPLES.map((example) => (
                <button key={example} type="button" className="ask-chip" onClick={() => go({ text: t(example) })}>
                  {t(example)}
                </button>
              ))}
              <button
                type="button"
                className="ask-chip dashed"
                onClick={() => {
                  startDemo();
                  router.push("/build");
                }}
              >
                {t("Try the demo")}
              </button>
              <button
                type="button"
                className="ask-chip dashed"
                onClick={() => {
                  startDemo("lamp");
                  router.push("/build");
                }}
              >
                {t("Try the repair demo")}
              </button>
            </div>
          </section>

          {manual && (
            <Link href={finished ? "/done" : "/build"} className="continue-row">
              <span>
                <span className="kicker">{t(finished ? "CONTINUE · DONE" : "CONTINUE · STEP {n} OF {total}", { n: current, total: steps })}</span>
                <span className="folder-title">{manual.title}</span>
              </span>
              <span className="ask-send" aria-hidden="true">
                <svg {...svg} width="22" height="22" stroke="currentColor" strokeWidth="2.6">
                  <path d="M5 12h14M13 6l6 6-6 6" />
                </svg>
              </span>
            </Link>
          )}
        </>
      )}
    </main>
  );
}
