"use client";

import { useT } from "../../lib/i18n";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import Timber from "../../components/Timber";
import { fileToShot, thumb } from "../../lib/image";
import { sendIntent } from "../../lib/intent";
import { getSettings } from "../../lib/settings";
import type { Understood } from "../../lib/spark";
import { addThing, loadThings, removeThing, type Thing } from "../../lib/things";

export default function ThingsPage() {
  const t = useT();
  const router = useRouter();
  const [things, setThings] = useState<Thing[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => setThings(loadThings()), []);

  // One photo of the label (or the product): Muse Spark reads brand and model.
  async function add(file: File | undefined) {
    if (!file) return;
    setError("");
    setBusy(true);
    try {
      const { image } = await fileToShot(file);
      const [res, photo] = await Promise.all([
        fetch("/api/understand", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ image, text: "What product is this? Read the brand and model from the label if there is one.", lang: getSettings().lang }),
        }),
        thumb(image, 240),
      ]);
      const data: Understood & { error?: string } = await res.json();
      if (!res.ok) throw new Error(data.error);
      if (!data.name.trim() || /unknown/i.test(data.name)) throw new Error(t("Couldn't tell what it is. Get closer to the label and try again."));
      setThings(addThing({ name: data.name.trim(), model: data.model.trim(), photo }));
    } catch (e) {
      setError(e instanceof Error && e.message ? t(e.message) : t("Something went wrong"));
    } finally {
      setBusy(false);
    }
  }

  function help(thing: Thing) {
    sendIntent({ text: t("I need help with my {name}", { name: thing.model || thing.name }) });
    router.push("/manual");
  }

  return (
    <main className="screen c">
      <header className="c-top">
        <span className="c-muted" style={{ fontSize: 13 }}>
          {t("{n} saved", { n: things.length })}
        </span>
      </header>
      <div className="c-ask" style={{ justifyContent: "space-between" }}>
        <div>
          <h1 className="c-h1" style={{ fontSize: 34, lineHeight: "40px" }}>
            {t("My things")}
          </h1>
          <p className="c-muted">{t("What you have at home. Tap one when it needs help.")}</p>
        </div>
        <Timber pose="point" size={64} move="none" className="c-flip" />
      </div>

      <label className={`c-add${busy ? " busy" : ""}`} aria-busy={busy}>
        <span className="c-opt-icon hi">
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M4 8h3l2-3h6l2 3h3v11H4z" />
            <circle cx="12" cy="13" r="3.5" />
          </svg>
        </span>
        <span className="c-grow">
          <b>{busy ? t("Reading the label…") : t("Add with a photo of the label")}</b>
          <small>{busy ? <span className="c-dots" aria-hidden="true"><i /><i /><i /></span> : t("Timber finds the brand and model.")}</small>
        </span>
        <input type="file" accept="image/*" capture="environment" disabled={busy} onChange={(e) => add(e.target.files?.[0])} />
      </label>

      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}

      {things.length === 0 ? (
        <p className="c-muted c-center" style={{ marginTop: 24 }}>
          {t("Nothing here yet. Things you ask Timber about show up here too.")}
        </p>
      ) : (
        <div className="c-gallery">
          {things.map((thing) => (
            <div key={thing.id} className="c-card">
              <button type="button" className="c-card-photo" onClick={() => help(thing)} aria-label={t("Get help with {name}", { name: thing.name })}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                {thing.photo ? <img src={thing.photo} alt="" /> : <Timber pose="think" size={80} move="none" />}
                <span className="c-tag">{t("Help")}</span>
              </button>
              <b>{thing.name}</b>
              <span className="c-row-between" style={{ margin: 0 }}>
                <small>{thing.model || t("No model yet")}</small>
                <button type="button" className="c-link" style={{ padding: "4px 0", fontSize: 12 }} onClick={() => setThings(removeThing(thing.id))}>
                  {t("Remove")}
                </button>
              </span>
            </div>
          ))}
        </div>
      )}
    </main>
  );
}
