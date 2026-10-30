"use client";

import { useT } from "../../lib/i18n";
import Link from "next/link";
import { useRef, useState } from "react";
import AskBar from "../../components/AskBar";
import CameraStage, { type CameraHandle } from "../../components/CameraStage";
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
    <main className="screen paper">
      <header className="top">
        <Link href="/" className="round" aria-label={t("Home")}>
          ←
        </Link>
        <span className="chip">{t("Find anything")}</span>
      </header>

      <CameraStage ref={camera} live={live && !!target} autoTarget={target} onStatus={setStatus} />
      <p className="status" role="status">
        {t(status)}
      </p>

      <AskBar timber={timber} placeholder={t('"Where is the vacuum cleaner?"')} />

      <div className="row">
        <button
          type="button"
          className="secondary"
          aria-pressed={live}
          onClick={() => setLive((v) => !v)}
          disabled={!target}
        >
          {live ? t("Stop live") : target ? t("Live") : t("Live (ask first)")}
        </button>
        <label className="secondary upload">
          {t("Photo")}
          <input type="file" accept="image/*" onChange={(e) => e.target.files?.[0] && camera.current?.loadPhoto(e.target.files[0])} />
        </label>
      </div>
      {live && <p className="tip">{t("Hold the phone still for a second and Timber looks again.")}</p>}
    </main>
  );
}
