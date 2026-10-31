"use client";

import { useT } from "../lib/i18n";
import { useEffect, useRef, useState } from "react";
import type { Manual, Step } from "../lib/manual";
import { setSettings, useSettings, type Settings } from "../lib/settings";
import AskBar from "./AskBar";
import Timber from "./Timber";
import type { useTimber } from "./useTimber";

type Switch = Exclude<keyof Settings, "lang">;

const SWITCHES: [Switch, string][] = [
  ["sound", "Sound"],
  ["captions", "Captions for sounds"],
  ["vibration", "Vibration"],
  ["slow", "Slower animations"],
  ["big", "Bigger text"],
];

export default function HelpSheet({
  manual,
  step,
  simple,
  timber,
  canBack,
  onClose,
  onAgain,
  onSimple,
  onBack,
  onSkip,
}: {
  manual: Manual;
  step: Step;
  simple: string;
  timber: ReturnType<typeof useTimber>;
  canBack: boolean;
  onClose: () => void;
  onAgain: () => void;
  onSimple: () => void;
  onBack: () => void;
  onSkip: () => void;
}) {
  const t = useT();
  const settings = useSettings();
  const [asking, setAsking] = useState(false);
  const pageUrl = manual.pdf && step.page > 0 ? `${manual.pdf}#page=${step.page}` : null;
  const sheet = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const opener = document.activeElement as HTMLElement | null;
    sheet.current?.focus();
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("keydown", onKey);
      opener?.focus();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const icon = { viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: 2, strokeLinecap: "round", strokeLinejoin: "round", "aria-hidden": true } as const;

  return (
    <div className="help-wrap" role="dialog" aria-modal="true" aria-label={t("Help")}>
      <button type="button" className="help-dim" aria-label={t("Close help")} tabIndex={-1} onClick={onClose} />
      <div ref={sheet} tabIndex={-1} className="help-sheet c-help">
        <span className="grabber" aria-hidden="true" />
        <div className="c-ask">
          <Timber pose="think" size={60} move="none" />
          <h2 className="c-h1" style={{ fontSize: 26, lineHeight: "32px" }}>
            {t("No worries. What helps?")}
          </h2>
        </div>

        <div className="c-opts">
          <button type="button" className="c-opt" onClick={onAgain}>
            <span className="c-opt-icon hi">
              <svg {...icon} width="20" height="20">
                <path d="M3 12a9 9 0 1 0 3-6.7L3 8" />
                <path d="M3 3v5h5" />
              </svg>
            </span>
            <span className="c-grow">
              <b>{t("Show me again")}</b>
              <small>{t("Watch the animation one more time.")}</small>
            </span>
          </button>

          <button type="button" className="c-opt" onClick={onSimple}>
            <span className="c-opt-icon">
              <svg {...icon} width="20" height="20">
                <path d="M4 6h16M4 12h10M4 18h7" />
              </svg>
            </span>
            <span className="c-grow">
              <b>{t("Say it simpler")}</b>
              <small>{simple || t("Timber explains it with easy words.")}</small>
            </span>
          </button>

          {pageUrl && (
            <a className="c-opt" href={pageUrl} target="_blank" rel="noreferrer">
              <span className="c-opt-icon">
                <svg {...icon} width="20" height="20">
                  <path d="M6 3h9l4 4v14H6z" />
                  <path d="M14 3v5h5" />
                </svg>
              </span>
              <span className="c-grow">
                <b>{t("Show the manual page")}</b>
                <small>{t("Page {n} of the PDF", { n: step.page })}</small>
              </span>
            </a>
          )}

          <button type="button" className="c-opt" onClick={() => setAsking((a) => !a)} aria-expanded={asking}>
            <span className="c-opt-icon">
              <svg {...icon} width="20" height="20">
                <rect x="9" y="3" width="6" height="12" rx="3" />
                <path d="M5 11a7 7 0 0 0 14 0M12 18v3" />
              </svg>
            </span>
            <span className="c-grow">
              <b>{t("Ask Timber")}</b>
              <small>{t("Talk or type your question.")}</small>
            </span>
          </button>
          {asking && <AskBar timber={timber} placeholder={t("Type your question")} />}
        </div>

        <div className="c-toggles">
          {SWITCHES.map(([key, label]) => (
            <button key={key} type="button" aria-pressed={settings[key]} onClick={() => setSettings({ [key]: !settings[key] })}>
              {t(label)}
            </button>
          ))}
          <button type="button" aria-label={t("Language")} onClick={() => setSettings({ lang: settings.lang === "es" ? "en" : "es" })}>
            {settings.lang === "es" ? "ES → EN" : "EN → ES"}
          </button>
        </div>

        <div className="c-sheet-links">
          <button type="button" className="c-link" onClick={onBack} disabled={!canBack}>
            {t("← Go back a step")}
          </button>
          <button type="button" className="c-link" onClick={onSkip} disabled={step.safety}>
            {step.safety ? t("Safety step: can't skip") : t("Skip this step →")}
          </button>
        </div>
        <button type="button" className="c-btn" onClick={onClose}>
          {t("Back to the step")}
        </button>
      </div>
    </div>
  );
}
