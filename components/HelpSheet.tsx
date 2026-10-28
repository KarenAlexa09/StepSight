"use client";

import { useState } from "react";
import type { Manual, Step } from "../lib/manual";
import { setSettings, useSettings, type Settings } from "../lib/settings";
import AskBar from "./AskBar";
import Timber from "./Timber";
import type { useTimber } from "./useTimber";

const SWITCHES: [keyof Settings, string][] = [
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
  const settings = useSettings();
  const [asking, setAsking] = useState(false);
  const pageUrl = manual.pdf && step.page > 0 ? `${manual.pdf}#page=${step.page}` : null;

  return (
    <div className="help-wrap" role="dialog" aria-label="Help">
      <button type="button" className="help-dim" aria-label="Close help" onClick={onClose} />
      <div className="help-sheet">
        <span className="grabber" aria-hidden="true" />
        <div className="row-between">
          <h2 className="title">No worries. What helps?</h2>
          <Timber pose="think" size={64} />
        </div>

        <button type="button" className="opt hi" onClick={onAgain}>
          <span className="num">1</span>
          <span className="opt-text">
            <span className="ot">Show me again</span>
            <span className="os">Watch the animation one more time.</span>
          </span>
          <span aria-hidden="true">▶</span>
        </button>

        <div className="opt col">
          <button type="button" className="opt-inner" onClick={onSimple}>
            <span className="num">2</span>
            <span className="opt-text">
              <span className="ot">Say it simpler</span>
              <span className="os">Timber explains it with easy words.</span>
            </span>
          </button>
          {simple && <p className="hand simple">{simple}</p>}
        </div>

        {pageUrl && (
          <a className="opt" href={pageUrl} target="_blank" rel="noreferrer">
            <span className="num">3</span>
            <span className="opt-text">
              <span className="ot">Show the manual page</span>
              <span className="os">Opens page {step.page} of your manual.</span>
            </span>
          </a>
        )}

        <div className="opt col">
          <button type="button" className="opt-inner" onClick={() => setAsking((a) => !a)}>
            <span className="num">{pageUrl ? 4 : 3}</span>
            <span className="opt-text">
              <span className="ot">Ask Timber</span>
              <span className="os">Talk or type your question.</span>
            </span>
          </button>
          {asking && <AskBar timber={timber} placeholder="Type your question" />}
        </div>

        <div className="switches">
          {SWITCHES.map(([key, label]) => (
            <button
              key={key}
              type="button"
              role="switch"
              aria-checked={settings[key]}
              className="sw"
              onClick={() => setSettings({ [key]: !settings[key] })}
            >
              <span>{label}</span>
              <span className={`tg${settings[key] ? " on" : ""}`} aria-hidden="true" />
            </button>
          ))}
        </div>

        <div className="help-foot">
          <button type="button" className="link" onClick={onBack} disabled={!canBack}>
            ← Go back a step
          </button>
          <button type="button" className="link" onClick={onSkip}>
            Skip this step →
          </button>
        </div>
        <button type="button" className="secondary" onClick={onClose}>
          Back to building
        </button>
      </div>
    </div>
  );
}
