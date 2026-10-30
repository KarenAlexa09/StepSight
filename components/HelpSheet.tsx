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

  return (
    <div className="help-wrap" role="dialog" aria-modal="true" aria-label={t("Help")}>
      <button type="button" className="help-dim" aria-label={t("Close help")} tabIndex={-1} onClick={onClose} />
      <div ref={sheet} tabIndex={-1} className="help-sheet">
        <span className="grabber" aria-hidden="true" />
        <div className="row-between">
          <h2 className="title">{t("No worries. What helps?")}</h2>
          <Timber pose="think" size={64} />
        </div>

        <button type="button" className="opt hi" onClick={onAgain}>
          <span className="num">1</span>
          <span className="opt-text">
            <span className="ot">{t("Show me again")}</span>
            <span className="os">{t("Watch the animation one more time.")}</span>
          </span>
          <span aria-hidden="true">▶</span>
        </button>

        <div className="opt col">
          <button type="button" className="opt-inner" onClick={onSimple}>
            <span className="num">2</span>
            <span className="opt-text">
              <span className="ot">{t("Say it simpler")}</span>
              <span className="os">{t("Timber explains it with easy words.")}</span>
            </span>
          </button>
          {simple && <p className="hand simple">{simple}</p>}
        </div>

        {pageUrl && (
          <a className="opt" href={pageUrl} target="_blank" rel="noreferrer">
            <span className="num">3</span>
            <span className="opt-text">
              <span className="ot">{t("Show the manual page")}</span>
              <span className="os">Opens page {step.page} of your manual.</span>
            </span>
          </a>
        )}

        <div className="opt col">
          <button type="button" className="opt-inner" onClick={() => setAsking((a) => !a)}>
            <span className="num">{pageUrl ? 4 : 3}</span>
            <span className="opt-text">
              <span className="ot">{t("Ask Timber")}</span>
              <span className="os">{t("Talk or type your question.")}</span>
            </span>
          </button>
          {asking && <AskBar timber={timber} placeholder={t("Type your question")} />}
        </div>

        <div className="switches">
          <div className="seg" role="group" aria-label={t("Language")}>
            {(["en", "es"] as const).map((l) => (
              <button key={l} type="button" aria-pressed={settings.lang === l} onClick={() => setSettings({ lang: l })}>
                {l === "en" ? "English" : "Español"}
              </button>
            ))}
          </div>
          {SWITCHES.map(([key, label]) => (
            <button
              key={key}
              type="button"
              role="switch"
              aria-checked={settings[key]}
              className="sw"
              onClick={() => setSettings({ [key]: !settings[key] })}
            >
              <span>{t(label)}</span>
              <span className={`tg${settings[key] ? " on" : ""}`} aria-hidden="true" />
            </button>
          ))}
        </div>

        <div className="help-foot">
          <button type="button" className="link" onClick={onBack} disabled={!canBack}>
            {t("← Go back a step")}
          </button>
          <button type="button" className="link" onClick={onSkip} disabled={step.safety}>
            {step.safety ? t("Safety step: can't skip") : t("Skip this step →")}
          </button>
        </div>
        <button type="button" className="secondary" onClick={onClose}>
          {t("Back to building")}
        </button>
      </div>
    </div>
  );
}
