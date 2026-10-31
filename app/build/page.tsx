"use client";

import { tr, useT } from "../../lib/i18n";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import ActionIcon from "../../components/ActionIcon";
import { demoPhoto } from "../../lib/demo";
import CameraStage, { type CameraHandle } from "../../components/CameraStage";
import HelpSheet from "../../components/HelpSheet";
import SourceTag from "../../components/SourceTag";
import Timber from "../../components/Timber";
import { useTimber } from "../../components/useTimber";
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
import { getSettings, setSettings, useSettings } from "../../lib/settings";
import { play } from "../../lib/sound";
import type { Check, Intent } from "../../lib/spark";

type Phase = "work" | "checking" | "correct" | "fix";

const partPrompt = (p: Part) => (p.color.trim() ? `${p.color.trim().toLowerCase()} piece` : p.name);
const kindOf = (s: Step) => s.kind ?? "verify";
const targetOf = (s: Step) => s.target?.trim() || (s.parts[0] ? partPrompt(s.parts[0]) : "");
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
  const settings = useSettings();
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

  async function verify() {
    if (!step || !progress) return;
    if (phase === "checking") return;
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
      const res = await fetch("/api/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          image: shot.image,
          step: { instruction: step.instruction, check: step.check, parts: step.parts.map(partLabel) },
          lang: getSettings().lang,
        }),
      });
      const result: Check = await res.json();
      if (!res.ok) throw new Error((result as unknown as { error: string }).error);
      setCheck(result);
      setStatus(result.done ? t("Step checked") : t("Needs a fix"));
      if (!result.done) timber.say(result.fix || result.reply);
      if (result.done) {
        thumb(shot.image, 560).then(addReplayFrame);
        const firstTry = !progress.triedThisStep;
        const xp = XP_STEP + (firstTry ? XP_FIRST_TRY : 0);
        setEarned({ xp, firstTry });
        const next = {
          ...progress,
          xp: progress.xp + xp,
          stars: progress.stars + (firstTry ? 1 : 0),
          streak: firstTry ? progress.streak + 1 : 0,
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
  const done = kind === "verify" ? verify : completeDo;

  const hazardous = Boolean(manual.hazard && manual.hazard !== "none");
  const locked = phase === "checking" || phase === "correct" || timber.thinking;
  const showAnim = watching && phase === "work" && Boolean(anim.image || anim.drawing);

  if (manual.prep?.length && !progress.prepDone) {
    return (
      <main className="screen paper build">
        <header className="top">
          <Link href="/" className="round" aria-label={t("Home")}>
            ✕
          </Link>
          <span className="chip">{t("Before you start")}</span>
        </header>
        <div className="hero">
          <h1 className="title big">
            {t("Let's get")} <mark>{t("ready")}</mark>
          </h1>
          <Timber pose="reading" size={110} />
        </div>
        <p className="hand">{manual.title}</p>
        <SourceTag manual={manual} />
        {hazardous && (
          <p className="hazard" role="alert">
            <b>{t("Safety first.")}</b> {HAZARD_TEXT[manual.hazard!]}
          </p>
        )}
        <ul className="prep">
          {manual.prep.map((item, i) => (
            <li key={i}>
              <label>
                <input
                  type="checkbox"
                  checked={ticked.includes(i)}
                  onChange={() => setTicked((t) => (t.includes(i) ? t.filter((n) => n !== i) : [...t, i]))}
                />
                <span>{item}</span>
              </label>
            </li>
          ))}
        </ul>
        <p className="tip">
          {t("{n} steps. Some need no photo: just do them and tap Done. I'll only check with a camera when it helps.", { n: total })}
        </p>
        <div className="grow" />
        <button type="button" className="primary sticky" onClick={startSteps} disabled={hazardous && !ticked.includes(0)}>
          {hazardous && !ticked.includes(0) ? t("Tick the first item to start") : ticked.length === manual.prep.length ? t("Ready, let's go") : t("Start anyway")}
        </button>
      </main>
    );
  }

  return (
    <main className="screen paper build v3">
      <header className="top">
        <Link href="/" className="round" aria-label={t("Home")}>
          ✕
        </Link>
        <div className="stepmeta">
          <span className="mono">
            {t("Step {i} of {n}", { i: progress.step + 1, n: total })}
          </span>
          <span className="dots" style={{ gridTemplateColumns: `repeat(${total}, minmax(0, 1fr))` }} aria-hidden="true">
            {Array.from({ length: total }, (_, i) => (
              <span key={i} className={i < progress.step ? "done" : i === progress.step ? "now" : ""} />
            ))}
          </span>
        </div>
        <button
          type="button"
          className="round"
          aria-label={settings.sound ? t("Sound is on. Tap to mute") : t("Sound is off. Tap to turn on")}
          aria-pressed={settings.sound}
          onClick={() => setSettings({ sound: !settings.sound })}
        >
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M4 9v6h4l5 4V5L8 9z" />
            {settings.sound ? <path d="M16 9a4 4 0 0 1 0 6M18.5 6.5a8 8 0 0 1 0 11" /> : <path d="M17 9l5 6M22 9l-5 6" />}
          </svg>
        </button>
      </header>

      <div className={`stage-wrap ${phase}`}>
        <CameraStage
          ref={camera}
          live={false}
          autoTarget={target}
          resetKey={progress.step}
          demo={manual?.demo ? demoPhoto(manual.demo!, progress.step, demoAfter, progress.triedThisStep) : undefined}
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
            <span className="c-anim-tag">{t("Watch, then do it")}</span>
          </div>
        )}
        {phase === "checking" && <span className="scan" aria-hidden="true" />}
        {!showAnim && (
          <span className="stage-status" role="status">
            {t(status)}
          </span>
        )}
        {!showAnim && (phase === "work" || phase === "fix") && (target || phase === "fix") && (
          <button
            type="button"
            className="showme"
            onClick={() => {
              setPhase("work");
              show();
            }}
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" aria-hidden="true">
              <circle cx="12" cy="12" r="3" />
              <path d="M12 3v4M12 17v4M3 12h4M17 12h4" />
            </svg>
            {t("Show me")}
          </button>
        )}
        {phase === "correct" && (
          <div
            className="verdict ok"
            role="status"
            onClick={() => {
              clearTimeout(advanceTimer.current);
              setHeld(true);
            }}
          >
            <span className="verdict-icon">
              <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M5 12l5 5 9-10" />
              </svg>
            </span>
            <div className="verdict-text">
              <b>{t("Solid!")}</b>
              <span className="hand">{check?.reply || t("Looks just right.")}</span>
              {check?.seen && <small className="seen">{t("Seen:")} {check.seen}</small>}
            </div>
            <div className="verdict-stats">
              <span className="sticker">+{earned.xp} xp</span>
              <span className="sticker hi">{earned.firstTry ? t("first try") : t("fixed it")}</span>
            </div>
          </div>
        )}
        {phase === "fix" && (
          <div className="verdict bad" role="alert">
            <span className="verdict-timber">
              <Timber pose="oops" size={84} />
            </span>
            <div className="verdict-text">
              <b>{t("Almost.")}</b>
              <span>{check?.problem}</span>
              {check?.fix && <span className="hand">{check.fix}</span>}
            </div>
            {piece && (
              <figure className="verdict-piece">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={piece} alt={t("Close-up of the {name}", { name: targetOf(step) })} />
                <figcaption>{t("this one")}</figcaption>
              </figure>
            )}
          </div>
        )}
      </div>

      <section key={progress.step} className="action-card compact">
        <span className="tile">
          <ActionIcon motion={step.motion} kind={kind} />
        </span>
        <div className="action-text">
          <span className="kicker">
            {kicker(step, manual.mode === "fix")}
            {step.page > 0 && ` · p. ${step.page}`}
          </span>
          <h1 className="instruction">{step.instruction}</h1>
        </div>
      </section>

      <button
        type="button"
        className={`cta${phase === "correct" && !held ? " auto" : ""}`}
        onClick={showAnim ? () => setWatching(false) : phase === "correct" ? () => proceed(progress) : done}
        disabled={phase === "checking" || timber.thinking}
      >
        {showAnim
          ? t("Got it, open the camera")
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
      <div className="row3">
        <button type="button" className="secondary" onClick={() => setHelp(true)} disabled={locked}>
          {t("I'm lost")}
        </button>
        <button type="button" className="secondary" onClick={advance} disabled={step.safety || locked}>
          {step.safety ? t("Safety step") : t("Skip step")}
        </button>
        <button
          type="button"
          className="round mic"
          aria-label={timber.listening ? t("Stop listening") : t("Talk to Timber")}
          aria-pressed={timber.listening}
          onClick={timber.listen}
          disabled={phase === "checking" || phase === "correct" || timber.thinking}
        >
          <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" aria-hidden="true">
            <rect x="9" y="3" width="6" height="11" rx="3" />
            <path d="M5 11a7 7 0 0 0 14 0M12 18v3" />
          </svg>
        </button>
      </div>
      {(timber.listening || timber.thinking || timber.heard) && (
        <p className="heard" role="status">
          {timber.listening ? timber.live || t("Listening…") : timber.thinking ? t("Timber is thinking…") : `“${timber.heard}”`}
          {timber.reply && !timber.thinking && !timber.listening && <b className="reply">Timber: {timber.reply}</b>}
        </p>
      )}

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
