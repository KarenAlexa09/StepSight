"use client";

import { tr, useT } from "../../lib/i18n";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { demoFinal, demoPhoto } from "../../lib/demo";
import BuildMap, { type MapItem } from "../../components/BuildMap";
import CameraStage, { type CameraHandle } from "../../components/CameraStage";
import HelpSheet from "../../components/HelpSheet";
import SourceTag from "../../components/SourceTag";
import Timber from "../../components/Timber";
import { preloadVoice, useTimber } from "../../components/useTimber";
import { prepareAnimations, useAnimation } from "../../lib/anim";
import { cropBox, thumb, type Shot } from "../../lib/image";
import type { Manual, Part, Step } from "../../lib/manual";
import {
  addReplayFrame,
  level,
  loadManual,
  loadProgress,
  saveProgress,
  XP_DO,
  XP_FIRST_TRY,
  XP_STEP,
  type Progress,
} from "../../lib/progress";
import { getSettings } from "../../lib/settings";
import { play } from "../../lib/sound";
import type { Check, Intent } from "../../lib/spark";

type Phase = "work" | "checking" | "correct" | "fix";

const partPrompt = (p: Part) => (p.color.trim() ? `${p.color.trim().toLowerCase()} piece` : p.name);
const kindOf = (s: Step) => s.kind ?? "verify";
const targetOf = (s: Step) => s.target?.trim() || (s.parts[0] ? partPrompt(s.parts[0]) : "");
// The map numbers each part by the step that uses it; the first step's base gets "B".
function mapItems(m: Manual): MapItem[] {
  const items: MapItem[] = [];
  const seen = new Set<string>();
  m.steps.forEach((s, i) => {
    const prompt = targetOf(s);
    if (!prompt || seen.has(prompt.toLowerCase())) return;
    seen.add(prompt.toLowerCase());
    items.push({ badge: String(i + 1), prompt, text: s.instruction });
  });
  const base = m.steps[0]?.motion?.to?.trim();
  if (base && !seen.has(base.toLowerCase())) items.unshift({ badge: "B", prompt: base, text: tr("Base: everything goes on this") });
  return items.slice(0, 12);
}

const partLabel = (p: Part) => `${p.quantity}× ${p.color} ${p.name}`.replace("  ", " ");
const AUTO_MS = 1600;
const AUTO_SLOW_MS = 2800;

function kicker(s: Step, fix: boolean) {
  const type = s.motion?.type;
  if (type === "connect") return tr("CONNECT");
  if (type === "move") return tr("MOVE");
  if (type === "remove") return tr("TAKE OFF");
  return { do: tr("DO IT"), find: tr("FIND IT"), verify: fix ? tr("CHECK IT") : tr("BUILD") }[kindOf(s)];
}

const HAZARD_TEXT = {
  none: "",
  electric: tr("Power is the risk here. Unplug it before anything else."),
  gas: tr("Gas is the risk here. Turn it off before anything else."),
  sharp: tr("Sharp edges. Take your time and keep your fingers clear."),
  heavy: tr("This is heavy. Get a second pair of hands before you lift."),
};

export default function BuildPage() {
  const t = useT();
  const router = useRouter();
  const camera = useRef<CameraHandle>(null);
  const advanceTimer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const [manual, setManual] = useState<Manual | null>(null);
  const [progress, setProgress] = useState<Progress | null>(null);
  const [target, setTarget] = useState("");
  const [status, setStatus] = useState("Point the camera at your build");
  const [phase, setPhase] = useState<Phase>("work");
  const [check, setCheck] = useState<Check | null>(null);
  const [earned, setEarned] = useState({ xp: 0, firstTry: false });
  const [ticked, setTicked] = useState<number[]>([]);
  const [help, setHelp] = useState(false);
  const [demoAfter, setDemoAfter] = useState(false);
  const [piece, setPiece] = useState<string | null>(null);
  const [simple, setSimple] = useState("");
  const [empty, setEmpty] = useState(false);
  const [held, setHeld] = useState(false);
  const [watching, setWatching] = useState(true);

  const step = manual && progress ? manual.steps[progress.step] : undefined;
  const anim = useAnimation(manual, progress?.step ?? 0);
  const timber = useTimber(onIntent, step && { instruction: step.instruction, parts: step.parts.map(partLabel) });

  useEffect(() => () => clearTimeout(advanceTimer.current), []);

  // Demos have no live camera to watch, so Flow plays them on a timer: light up the part, then check.
  useEffect(() => {
    if (!manual?.demo || !progress?.flow || !step || kindOf(step) !== "verify") return;
    if ((manual.prep?.length && !progress.prepDone) || !progress.mapped || (phase !== "work" && phase !== "fix")) return;
    const lit = phase === "work" ? setTimeout(() => show(), 700) : undefined;
    const check = setTimeout(() => verify(), phase === "work" ? 6500 : 3500);
    return () => {
      clearTimeout(lit);
      clearTimeout(check);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase, progress?.step, progress?.prepDone, progress?.mapped, manual]);

  useEffect(() => {
    const m = loadManual();
    if (!m) {
      setEmpty(true);
      return;
    }
    const p = loadProgress();
    p.step = Math.min(p.step, m.steps.length - 1);
    setManual(m);
    setProgress(p);
    prepareAnimations(m);
    preloadVoice(m.steps.slice(p.step).map((s) => s.instruction));
    setTarget(targetOf(m.steps[p.step]));
    if (m.mode === "fix") setStatus("Point the camera at what you're fixing");
  }, [router]);

  function show(t = target) {
    play("boop");
    camera.current?.find(t, step && t === targetOf(step) ? step.motion : undefined);
  }

  function update(next: Progress) {
    setProgress(next);
    saveProgress(next);
  }

  function goTo(index: number, speak = true, from = progress) {
    if (!manual || !from) return;
    const i = Math.max(0, Math.min(index, manual.steps.length - 1));
    const s = manual.steps[i];
    update({ ...from, step: i, triedThisStep: false });
    setTarget(targetOf(s));
    setPhase("work");
    setDemoAfter(false);
    setPiece(null);
    setCheck(null);
    setSimple("");
    setHelp(false);
    setHeld(false);
    setWatching(true);
    setStatus(t("Step {i} of {n}", { i: i + 1, n: manual.steps.length }));
    if (speak) timber.say(s.instruction);
  }

  function celebrateLevel(before: number, gained: number) {
    if (level(before).name !== level(before + gained).name) setTimeout(() => play("level"), 900);
  }

  function proceed(from: Progress) {
    clearTimeout(advanceTimer.current);
    if (!manual) return;
    if (from.step >= manual.steps.length - 1) {
      update({ ...from, finishedAt: Date.now() });
      router.push("/done");
      return;
    }
    goTo(from.step + 1, true, from);
  }

  async function findPiece(shot: Shot, prompt: string) {
    try {
      const res = await fetch("/api/segment", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ image: shot.image, prompt, width: shot.width, height: shot.height }),
      });
      const data = await res.json();
      if (res.ok && data.matches?.[0]) setPiece(await cropBox(shot.image, data.matches[0].bounds));
    } catch {}
  }

  // Flow: SAM watches the clip of the hands; if the part clearly ended up on its base, that's the check.
  // Otherwise Spark looks for how far the build got, so building ahead skips steps; only then the usual one-step check.
  async function settleCheck(clip?: Blob) {
    if (!step || !progress || !manual) return;
    const to = step.motion?.type === "connect" ? step.motion.to?.trim() : "";
    const passed = (reply: string, skip = 0) =>
      verify({ done: true, problem: "", fix: "", reply, seen: "", confidence: "high" }, true, skip);
    setPhase("checking");
    setStatus(t("Timber is checking your build…"));
    if (clip && to && targetOf(step)) {
      try {
        const form = new FormData();
        form.append("video", clip, "clip.mp4");
        form.append("part", targetOf(step));
        form.append("base", to);
        const res = await fetch("/api/track", { method: "POST", body: form });
        const data = await res.json();
        if (res.ok && data.placed) return passed(t("Solid. Next one."));
      } catch {}
    }
    const rest = manual.steps.slice(progress.step, progress.step + 5);
    const shot = rest.length > 1 ? camera.current?.capture() : null;
    if (shot) {
      try {
        const res = await fetch("/api/ahead", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ image: shot.image, steps: rest.map((s) => ({ instruction: s.instruction, check: s.check })) }),
        });
        const { done } = await res.json();
        if (res.ok && done > 1) return passed(t("You're ahead of me: I saw {n} steps done.", { n: done }), done - 1);
        if (res.ok && done === 1) return passed(t("Solid. Next one."));
      } catch {}
    }
    verify(undefined, true);
  }

  async function verify(known?: Check, force = false, skip = 0) {
    if (!step || !progress) return;
    if (phase === "checking" && !force) return;
    setPhase("checking");
    setPiece(null);
    setStatus(t("Timber is checking your build…"));
    if (manual?.demo) {
      setDemoAfter(true);
      await new Promise((r) => setTimeout(r, 600));
    }
    const shot = camera.current?.capture();
    if (!shot) {
      setPhase("work");
      setStatus(t("No picture yet. Upload a photo of it first."));
      return;
    }
    try {
      let result = known;
      if (!result) {
        const res = await fetch("/api/verify", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            image: shot.image,
            step: { instruction: step.instruction, check: step.check, parts: step.parts.map(partLabel) },
            lang: getSettings().lang,
          }),
        });
        result = (await res.json()) as Check;
        if (!res.ok) throw new Error((result as unknown as { error: string }).error);
      }
      setCheck(result);
      setStatus(result.done ? t("Step checked") : t("Needs a fix"));
      if (!result.done) timber.say(result.fix || result.reply);
      if (result.done) {
        thumb(shot.image, 560).then(addReplayFrame);
        const firstTry = !progress.triedThisStep;
        const xp = (XP_STEP + (firstTry ? XP_FIRST_TRY : 0)) * (skip + 1);
        setEarned({ xp, firstTry });
        const next = {
          ...progress,
          step: progress.step + skip,
          xp: progress.xp + xp,
          stars: progress.stars + (firstTry ? skip + 1 : 0),
          streak: firstTry ? progress.streak + skip + 1 : 0,
        };
        update(next);
        play("success");
        celebrateLevel(progress.xp, xp);
        setPhase("correct");
        advanceTimer.current = setTimeout(() => proceed(next), getSettings().slow ? AUTO_SLOW_MS : AUTO_MS);
      } else {
        update({ ...progress, mistakes: progress.mistakes + 1, streak: 0, triedThisStep: true });
        play("oops");
        setPhase("fix");
        if (targetOf(step)) findPiece(shot, targetOf(step));
      }
    } catch (error) {
      setPhase("work");
      setStatus(error instanceof Error && error.message ? t(error.message) : t("Couldn't check. Try again."));
    }
  }

  function completeDo() {
    if (!progress || !step) return;
    const next = { ...progress, xp: progress.xp + XP_DO };
    setStatus(`+${XP_DO} xp`);
    play("tuck");
    celebrateLevel(progress.xp, XP_DO);
    if (progress.step >= (manual?.steps.length ?? 0) - 1) {
      update({ ...next, finishedAt: Date.now() });
      router.push("/done");
      return;
    }
    goTo(progress.step + 1, true, next);
  }

  function startSteps() {
    if (!progress || !manual) return;
    window.scrollTo(0, 0);
    update({ ...progress, prepDone: true });
    timber.say(manual.steps[progress.step].instruction);
  }

  function advance() {
    if (!manual || !progress) return;
    if (progress.step >= manual.steps.length - 1) {
      update({ ...progress, finishedAt: Date.now() });
      router.push("/done");
      return;
    }
    goTo(progress.step + 1);
  }

  async function explain() {
    if (!step) return;
    setSimple("…");
    try {
      const res = await fetch("/api/ask", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          said: "Explain this step in two very short, simple sentences for a total beginner.",
          step: { instruction: step.instruction, parts: step.parts.map(partLabel) },
        }),
      });
      const intent = await res.json();
      if (!res.ok) throw new Error(intent.error);
      setSimple(intent.reply);
      timber.say(intent.reply);
    } catch {
      setSimple(t("Do what the card says, one small move at a time."));
    }
  }

  function again() {
    setHelp(false);
    if (anim.image) {
      setPhase("work");
      return setWatching(true);
    }
    if (!camera.current?.replay()) show();
  }

  function onIntent(intent: Intent) {
    if (intent.action === "next") {
      timber.say(intent.reply);
      if (step && kindOf(step) !== "verify") completeDo();
      else verify();
    } else if (intent.action === "back") {
      goTo((progress?.step ?? 0) - 1);
    } else if (intent.action === "find" && intent.target) {
      setTarget(intent.target);
      timber.say(intent.reply);
      show(intent.target);
    } else if (intent.action === "repeat" && step) {
      timber.say(step.instruction);
    } else {
      timber.say(intent.reply);
    }
  }

  if (empty) {
    return (
      <main className="screen paper">
        <header className="top">
          <Link href="/" className="round" aria-label={t("Home")}>
            ←
          </Link>
          <span className="chip">{t("Projects")}</span>
        </header>
        <div className="hero">
          <h1 className="title big">{t("No project yet")}</h1>
          <Timber pose="reading" size={96} />
        </div>
        <Link href="/#ask" className="primary">
          {t("Start one")}
        </Link>
      </main>
    );
  }

  if (!manual || !progress || !step) {
    return (
      <main className="screen paper build v3" aria-busy="true">
        <header className="top">
          <Link href="/" className="round" aria-label={t("Home")}>
            ✕
          </Link>
        </header>
        <div className="stage-wrap">
          <div className="stage" />
        </div>
      </main>
    );
  }

  const total = manual.steps.length;
  const kind = kindOf(step);
  const done = kind === "verify" ? () => verify() : completeDo;

  const hazardous = Boolean(manual.hazard && manual.hazard !== "none");
  const locked = phase === "checking" || phase === "correct" || timber.thinking;
  const flow = Boolean(progress.flow) && kind === "verify";
  const showAnim = !flow && watching && phase === "work" && Boolean(anim.image || anim.drawing);
  const upNext = progress.flow ? manual.steps.slice(progress.step + 1, progress.step + 3) : [];

  if (manual.prep?.length && !progress.prepDone) {
    return (
      <main className="screen c">
        <header className="c-top">
          <Link href="/" className="c-back" aria-label={t("Home")}>
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M15 6l-6 6 6 6" />
            </svg>
          </Link>
        </header>
        <div className="c-ask">
          <div className="c-grow">
            <p className="kicker">{t("BEFORE YOU START · {n} STEPS", { n: total })}</p>
            <h1 className="c-h1" style={{ marginTop: 6 }}>
              {manual.title}
            </h1>
          </div>
          <Timber pose="reading" size={72} move="none" />
        </div>
        <SourceTag manual={manual} />
        {hazardous && (
          <p className="c-safety" role="alert">
            <b>{t("Safety first.")}</b> {HAZARD_TEXT[manual.hazard!]}
          </p>
        )}
        <div className="c-prep">
          {manual.prep.map((item, i) => (
            <label key={i}>
              <input
                type="checkbox"
                checked={ticked.includes(i)}
                onChange={() => setTicked((t) => (t.includes(i) ? t.filter((n) => n !== i) : [...t, i]))}
              />
              <span>{item}</span>
            </label>
          ))}
        </div>
        <p className="c-muted" style={{ fontSize: 13 }}>
          {t("Some steps need no photo: just do them and tap Done. I'll only check with a camera when it helps.")}
        </p>
        <div className="c-grow" />
        <div className="c-sticky">
          <button type="button" className="c-btn" onClick={startSteps} disabled={hazardous && !ticked.includes(0)}>
            {hazardous && !ticked.includes(0) ? t("Tick the first item to start") : ticked.length === manual.prep.length ? t("Ready, let's go") : t("Start anyway")}
          </button>
        </div>
      </main>
    );
  }

  const items = progress.flow && !progress.mapped ? mapItems(manual) : [];
  if (items.length) {
    return (
      <BuildMap
        manual={manual}
        items={items}
        photo={manual.demo ? demoPhoto(manual.demo, 0, false, false) : undefined}
        finished={manual.demo ? demoFinal(manual.demo) : undefined}
        onStart={() => {
          update({ ...progress, mapped: true });
          timber.say(step.instruction);
        }}
      />
    );
  }

  const icon = { viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: 2.2, strokeLinecap: "round", strokeLinejoin: "round", "aria-hidden": true } as const;
  const sheetTone = phase === "correct" ? " ok" : phase === "fix" ? " fix" : "";

  return (
    <main className="screen build c-step">
      <div className="c-cam">
        <CameraStage
          ref={camera}
          live={flow && phase === "work"}
          autoTarget={target}
          onSettle={flow && (phase === "work" || phase === "fix") ? settleCheck : undefined}
          anchored={flow}
          resetKey={progress.step}
          // While "Almost." shows, keep the mistake photo; the fixed one only appears on the re-check.
          demo={manual?.demo ? demoPhoto(manual.demo!, progress.step, demoAfter, progress.triedThisStep && phase !== "fix") : undefined}
          onStatus={setStatus}
        />
        {showAnim && (
          <div className="c-anim">
            {anim.image ? (
              <div className="c-anim-frame">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={anim.image} alt={t("Animation of this step: {step}", { step: step.instruction })} />
              </div>
            ) : (
              <div className="c-anim-wait" role="status">
                <Timber pose="reading" size={72} move="none" />
                {t("Timber is drawing this step…")}
                <span className="c-dots" aria-hidden="true"><i /><i /><i /></span>
              </div>
            )}
          </div>
        )}
        {phase === "checking" && <span className="scan" aria-hidden="true" />}

        <div className="c-cam-top">
          <span className="c-segs" aria-hidden="true">
            {Array.from({ length: total }, (_, i) => (
              <span key={i} className={i < progress.step ? "done" : i === progress.step ? "now" : ""} />
            ))}
          </span>
          <div className="c-cam-bar">
            <Link href="/" className="c-glass" aria-label={t("Home")}>
              <svg {...icon} width="20" height="20">
                <path d="M6 6l12 12M18 6L6 18" />
              </svg>
            </Link>
            <span className="c-cam-label">{progress.flow ? t("FLOW · STEP {n} OF {total}", { n: progress.step + 1, total }) : t("STEP {n} OF {total}", { n: progress.step + 1, total })}</span>
            <button
              type="button"
              className={`c-glass${timber.listening ? " on" : ""}`}
              aria-label={timber.listening ? t("Stop listening") : t("Talk to Timber")}
              aria-pressed={timber.listening}
              onClick={timber.listen}
              disabled={phase === "checking" || phase === "correct" || timber.thinking}
            >
              <svg {...icon} width="20" height="20">
                <rect x="9" y="3" width="6" height="11" rx="3" />
                <path d="M5 11a7 7 0 0 0 14 0M12 18v3" />
              </svg>
            </button>
          </div>
        </div>

        {!showAnim && !flow && phase !== "correct" && (
          <div className="c-cam-bottom">
            {anim.image ? (
              <button type="button" className="c-pill" onClick={() => setWatching(true)}>
                <svg {...icon} width="16" height="16">
                  <path d="M3 12a9 9 0 1 0 3-6.7L3 8" />
                  <path d="M3 3v5h5" />
                </svg>
                {t("Watch again")}
              </button>
            ) : (
              <span />
            )}
            {(phase === "work" || phase === "fix") && (target || phase === "fix") && (
              <button
                type="button"
                className="c-pill"
                onClick={() => {
                  setPhase("work");
                  show();
                }}
              >
                <svg {...icon} width="16" height="16" strokeWidth={2.4}>
                  <circle cx="12" cy="12" r="3" />
                  <path d="M12 3v4M12 17v4M3 12h4M17 12h4" />
                </svg>
                {t("Show me")}
              </button>
            )}
          </div>
        )}
      </div>

      <section key={`${progress.step}-${phase}`} className={`c-sheet${sheetTone}`} aria-live="polite">
        {phase === "correct" ? (
          <div
            className="c-ask"
            role="status"
            onClick={() => {
              clearTimeout(advanceTimer.current);
              setHeld(true);
            }}
          >
            <Timber pose="thumbs" size={76} move="hop" />
            <div className="c-grow">
              <h1 className="c-h1">{t("Well done!")}</h1>
              <p className="c-sheet-text">{check?.reply || t("Looks just right.")}</p>
              <p className="c-sheet-meta">
                +{earned.xp} xp · {earned.firstTry ? t("first try") : t("fixed it")}
              </p>
            </div>
          </div>
        ) : phase === "fix" ? (
          <div className="c-ask" role="alert">
            <Timber pose="oops" size={76} />
            <div className="c-grow">
              <h1 className="c-h1">{t("Almost.")}</h1>
              <p className="c-sheet-text">{check?.problem}</p>
              {check?.fix && <p className="c-muted">{check.fix}</p>}
            </div>
            {piece && (
              <figure className="c-piece">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={piece} alt={t("Close-up of the {name}", { name: targetOf(step) })} />
                <figcaption>{t("this one")}</figcaption>
              </figure>
            )}
          </div>
        ) : (
          <div className="c-ask">
            <div className="c-grow">
              <p className="kicker">
                {kicker(step, manual.mode === "fix")}
                {step.page > 0 && ` · p. ${step.page}`}
              </p>
              <h1 className="c-h1">{step.instruction}</h1>
              {!showAnim && phase === "work" && status && <p className="c-muted">{t(status)}</p>}
              {phase === "checking" && <p className="c-muted">{t("Timber is checking your build…")}</p>}
            </div>
            <Timber pose={phase === "checking" ? "think" : "point"} size={64} move="none" className="c-flip" />
          </div>
        )}

        {(timber.listening || timber.thinking || timber.heard) && (
          <p className="heard" role="status">
            {timber.listening ? timber.live || t("Listening…") : timber.thinking ? t("Timber is thinking…") : `“${timber.heard}”`}
            {timber.reply && !timber.thinking && !timber.listening && <b className="reply">Timber: {timber.reply}</b>}
          </p>
        )}

        <div className="c-grow" />
        {flow && (phase === "work" || phase === "fix") ? (
          <>
            <p className="c-muted" role="status">
              {t("Hands out when it's on. I'll check by myself.")}
            </p>
            {upNext.length > 0 && (
              <ol className="c-next" aria-label={t("Up next")}>
                {upNext.map((s) => (
                  <li key={s.number}>{s.instruction}</li>
                ))}
              </ol>
            )}
          </>
        ) : (
        <button
          type="button"
          className={`cta c-btn${phase === "correct" && !held ? " auto" : ""}`}
          onClick={showAnim ? (kind === "verify" ? () => setWatching(false) : done) : phase === "correct" ? () => proceed(progress) : done}
          disabled={phase === "checking" || timber.thinking}
        >
          {!showAnim && phase !== "correct" && phase !== "checking" && kind === "verify" && <span className="c-shutter" aria-hidden="true" />}
          {showAnim
            ? kind === "verify"
              ? t("Done, show the camera")
              : t("Done")
            : phase === "checking"
              ? t("Checking…")
              : phase === "correct"
                ? progress.step >= total - 1
                  ? t("Finish")
                  : t("Next step →")
                : phase === "fix"
                  ? t("Check again")
                  : kind === "verify"
                    ? t("Check my step")
                    : t("Done")}
        </button>
        )}
        {phase !== "correct" && (
          <div className="c-sheet-links">
            <button type="button" className="c-link" onClick={() => setHelp(true)} disabled={locked}>
              {t("I'm lost")}
            </button>
            {flow && (
              <button type="button" className="c-link" onClick={() => verify()} disabled={locked}>
                {t("Check now")}
              </button>
            )}
            <button type="button" className="c-link" onClick={advance} disabled={step.safety || locked}>
              {step.safety ? t("Safety step") : t("Skip step")}
            </button>
          </div>
        )}
      </section>

      {help && (
        <HelpSheet
          manual={manual}
          step={step}
          simple={simple}
          timber={timber}
          canBack={progress.step > 0}
          onClose={() => setHelp(false)}
          onAgain={again}
          onSimple={explain}
          onBack={() => goTo(progress.step - 1)}
          onSkip={advance}
        />
      )}
    </main>
  );
}
