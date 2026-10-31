"use client";

import { useT } from "../../lib/i18n";
import { useRef, useState } from "react";
import AskBar from "../../components/AskBar";
import CameraStage, { type CameraHandle } from "../../components/CameraStage";
import Timber from "../../components/Timber";
import { useTimber } from "../../components/useTimber";
import type { Intent } from "../../lib/spark";

export default function FindPage() {
  const t = useT();
  const camera = useRef<CameraHandle>(null);
  const [status, setStatus] = useState("Point the camera and ask for anything");
  const [target, setTarget] = useState("");
  const [live, setLive] = useState(false);
  const timber = useTimber(onIntent);

  function onIntent(intent: Intent) {
    timber.say(intent.reply);
    if (intent.action === "find" && intent.target) {
      setTarget(intent.target);
      camera.current?.find(intent.target);
    }
  }

  return (
    <main className="screen c-step c-find">
      <div className="c-cam">
        <CameraStage ref={camera} live={live && !!target} autoTarget={target} onStatus={setStatus} />
        <div className="c-cam-top">
          <AskBar timber={timber} placeholder={t('"Where is the vacuum cleaner?"')} />
        </div>
      </div>

      <section className="c-sheet">
        <div className="c-ask">
          <Timber pose={target ? "point" : "think"} size={56} move="none" className="c-flip" />
          <div className="c-grow" role="status">
            <h1 className="c-h1" style={{ fontSize: 20, lineHeight: "26px" }}>
              {timber.thinking ? t("Timber is thinking…") : target ? t("Looking for: {x}", { x: target }) : t("What are you looking for?")}
            </h1>
            <p className="c-muted" style={{ fontSize: 14 }}>
              {timber.reply || t(status)}
            </p>
          </div>
        </div>
        <div className="c-chips" style={{ justifyContent: "flex-start" }}>
          <button type="button" className="c-chip" aria-pressed={live} onClick={() => setLive((v) => !v)} disabled={!target}>
            {live && <span className="c-live-dot" aria-hidden="true" />}
            {live ? t("Live") : target ? t("Live") : t("Live (ask first)")}
          </button>
          <label className="c-chip">
            {t("Photo")}
            <input type="file" accept="image/*" onChange={(e) => e.target.files?.[0] && camera.current?.loadPhoto(e.target.files[0])} />
          </label>
        </div>
        {live && <p className="c-muted" style={{ fontSize: 13 }}>{t("Hold the phone still for a second and Timber looks again.")}</p>}
      </section>
    </main>
  );
}
