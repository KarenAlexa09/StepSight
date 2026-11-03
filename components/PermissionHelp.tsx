"use client";

import { useEffect, useState } from "react";
import { useT } from "../lib/i18n";
import { onPermissionHelp, type Device } from "../lib/permission";
import Timber from "./Timber";

type Browser = "ios-chrome" | "ios-safari" | "android" | "desktop";

function browserOf(): Browser {
  const ua = navigator.userAgent;
  if (/iPhone|iPad|iPod/.test(ua)) return /CriOS/.test(ua) ? "ios-chrome" : "ios-safari";
  return /Android/.test(ua) ? "android" : "desktop";
}

// Web pages can't open the phone's settings, so the sheet spells out where the switch is for this browser.
const STEPS: Record<Browser, string[]> = {
  "ios-chrome": [
    "Tap the icon on the left of the address bar (a camera, a lock or two sliders).",
    "Set {device} to Allow for this site.",
    "If it isn't there: open the iPhone Settings app, tap Chrome and turn on {device}.",
    "Reload this page and tap the mic again.",
  ],
  "ios-safari": [
    "Tap aA on the left of the address bar.",
    "Tap Website Settings.",
    "Set {device} to Allow.",
    "Come back here and tap Try again.",
  ],
  android: [
    "Tap the icon on the left of the address bar.",
    "Tap Permissions.",
    "Turn on {device}.",
    "Tap Try again.",
  ],
  desktop: [
    "Click the icon on the left of the address bar.",
    "Set {device} to Allow.",
    "Reload the page.",
  ],
};

export default function PermissionHelp() {
  const t = useT();
  const [device, setDevice] = useState<Device | null>(null);
  const [browser, setBrowser] = useState<Browser>("desktop");
  const [note, setNote] = useState("");
  const [code, setCode] = useState("");

  useEffect(
    () =>
      onPermissionHelp((d, reason) => {
        setBrowser(browserOf());
        setNote("");
        setCode(reason ?? "");
        setDevice(d);
      }),
    [],
  );

  useEffect(() => {
    if (!device) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setDevice(null);
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [device]);

  if (!device) return null;
  const name = device === "microphone" ? t("Microphone") : t("Camera");

  async function retry() {
    try {
      const stream = await navigator.mediaDevices.getUserMedia(device === "microphone" ? { audio: true } : { video: true });
      stream.getTracks().forEach((track) => track.stop());
      setDevice(null);
      // The camera only starts on load, so reload once it's allowed.
      if (device === "camera") location.reload();
    } catch (error) {
      setCode(error instanceof Error ? error.name : "");
      setNote(t("Still blocked. Check the steps above, then try again or reload."));
    }
  }

  return (
    <div className="help-wrap" role="dialog" aria-modal="true" aria-label={t("Turn on the {device}", { device: name.toLowerCase() })}>
      <button type="button" className="help-dim" aria-label={t("Close")} tabIndex={-1} onClick={() => setDevice(null)} />
      <div className="help-sheet c-help c-perm">
        <span className="grabber" aria-hidden="true" />
        <div className="c-ask">
          <Timber pose="think" size={60} move="none" />
          <h2 className="c-h1" style={{ fontSize: 24, lineHeight: "30px" }}>
            {device === "microphone" ? t("Timber can't hear you yet") : t("Timber can't see yet")}
          </h2>
        </div>
        <p className="c-muted">{t("Your browser is blocking the {device}. Here's how to turn it on:", { device: name.toLowerCase() })}</p>
        <ol className="c-perm-steps">
          {STEPS[browser].map((step) => (
            <li key={step}>{t(step, { device: name })}</li>
          ))}
        </ol>
        {note && (
          <p className="c-muted" role="alert">
            {note}
          </p>
        )}
        <button type="button" className="c-btn" onClick={retry}>
          {t("Try again")}
        </button>
        {code && <p className="c-perm-code">{t("Browser says: {code}", { code })}</p>}
        <div className="c-perm-links">
          <button type="button" className="c-link" onClick={() => location.reload()}>
            {t("Reload the page")}
          </button>
          <button type="button" className="c-link" onClick={() => setDevice(null)}>
            {t("Not now")}
          </button>
        </div>
      </div>
    </div>
  );
}
