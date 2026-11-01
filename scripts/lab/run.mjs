// Timber's understanding lab: runs every case in cases.mjs against a running app, several times each, and reports pass rates.
// Usage: node scripts/lab/run.mjs [baseUrl] [--runs=3] [--cat=lego] [--only=name] [--manual]
// Report: smoke-output/lab-report.md and lab-report.json
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { ASKS_MODEL, THING_TEXT, cases } from "./cases.mjs";

const args = process.argv.slice(2);
const flag = (name) => args.find((a) => a.startsWith(`--${name}=`))?.split("=")[1];
const base = args.find((a) => a.startsWith("http")) ?? "http://localhost:3100";
const runs = Number(flag("runs") ?? 3);
const withManual = args.includes("--manual");
const MAX_ASKS = 4;
const PARALLEL = 3;

const photo = async (name) => {
  const path = name.includes("/") ? name : `scripts/lab/photos/${name}.jpg`;
  return `data:image/jpeg;base64,${(await readFile(path)).toString("base64")}`;
};

// The app's rate limit is 40 requests a minute; wait it out instead of failing.
async function post(path, body) {
  for (let tries = 0; ; tries++) {
    const res = await fetch(`${base}${path}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    if (res.status === 429 && tries < 6) {
      await new Promise((r) => setTimeout(r, 15_000));
      continue;
    }
    return res;
  }
}

async function understand(body) {
  const res = await post("/api/understand", body);
  const data = await res.json();
  if (!res.ok) throw new Error(`understand ${res.status}: ${data.error}`);
  return data;
}

async function manual(query, mode, lang) {
  const res = await post("/api/manual", { query, mode, lang });
  if (!res.ok) throw new Error(`manual ${res.status}`);
  const last = JSON.parse((await res.text()).trim().split("\n").at(-1));
  if (last.type !== "done") throw new Error("manual failed");
  return last.manual;
}

// Plays one conversation the way the app does and returns the checks.
async function play(c) {
  const e = c.expect;
  const image = c.image ? await photo(c.image) : undefined;
  const lang = c.lang ?? "en";
  const answers = [...c.answers];
  const history = [];
  const transcript = [];
  const checks = [];
  const check = (label, ok, got = "") => checks.push({ label, ok: Boolean(ok), got: String(got) });
  const started = performance.now();
  let said = c.thing ? THING_TEXT : (c.say ?? "");
  let last;
  let asks = 0;

  for (;;) {
    last = await understand({ text: said, image, history, lang });
    transcript.push({ you: said, timber: last.question || "(ready)", model: last.model, mode: last.mode });
    if (asks === 0) {
      if (e.firstAsks) check(`first question matches ${e.firstAsks}`, !last.ready && e.firstAsks.test(last.question), last.question || "(no question)");
      if (e.asksModel === false) check("doesn't ask brand/model first", last.ready || !ASKS_MODEL.test(last.question), last.question);
    }
    // In "My things" the app stops as soon as it has a model.
    if (c.thing && last.model.trim()) break;
    if (last.ready || !last.question || asks >= MAX_ASKS || !answers.length) break;
    history.push({ role: "you", text: said }, { role: "timber", text: last.question });
    said = answers.shift();
    asks++;
  }

  if (e.askedAbout) check(`offers ${e.askedAbout}`, transcript.some((t) => e.askedAbout.test(t.timber ?? "")) || e.askedAbout.test(last.options.join(" ")), transcript.map((t) => t.timber).join(" / "));
  if (e.danger !== undefined) check(e.danger ? "flags it as dangerous" : "doesn't flag it as dangerous", Boolean(last.danger) === e.danger, `danger=${last.danger}`);
  if (e.notReady) check("waits for more detail", !last.ready || !last.clear, `ready=${last.ready}`);
  else if (!c.thing && !e.danger && !e.askedAbout) check("ends ready to search", last.ready, last.question);
  if (e.mode) check(`mode is ${e.mode}`, last.mode === e.mode, last.mode);
  for (const re of e.query ?? []) check(`query has ${re}`, re.test(last.query), last.query);
  if (e.name) check(`name has ${e.name}`, e.name.test(last.name), last.name);
  if (e.model) check(`model has ${e.model}`, e.model.test(last.model), last.model || "(empty)");

  if (withManual && e.manual && last.ready) {
    try {
      const m = await manual(last.query, last.mode, lang);
      transcript.push({ manual: m.title, steps: m.steps.length, source: m.source?.url });
      check("manual has 3+ steps", m.steps.length >= 3, m.steps.length);
      if (e.manual.host) check(`manual from ${e.manual.host}`, e.manual.host.test(m.source?.url ?? ""), m.source?.url);
      if (e.manual.parts) check("manual lists parts", m.steps.some((s) => s.parts.length), "no parts");
    } catch (error) {
      check("manual found", false, error.message);
    }
  }
  return { checks, transcript, asks, seconds: (performance.now() - started) / 1000, query: last.query };
}

const picked = cases.filter((c) => (!flag("cat") || c.cat === flag("cat")) && (!flag("only") || c.name.includes(flag("only"))));
const jobs = picked.flatMap((c) => Array.from({ length: runs }, () => c));
const results = new Map(picked.map((c) => [c, []]));
console.log(`Lab: ${picked.length} cases × ${runs} runs against ${base}${withManual ? " (with manual search)" : ""}\n`);

let next = 0;
await Promise.all(
  Array.from({ length: PARALLEL }, async () => {
    while (next < jobs.length) {
      const c = jobs[next++];
      let result;
      try {
        result = await play(c);
      } catch (error) {
        result = { checks: [{ label: "ran", ok: false, got: error.message }], transcript: [], asks: 0, seconds: 0, query: "" };
      }
      results.get(c).push(result);
      process.stdout.write(result.checks.every((k) => k.ok) ? "." : "F");
    }
  }),
);

const rows = picked.map((c) => {
  const rs = results.get(c);
  const passed = rs.filter((r) => r.checks.every((k) => k.ok)).length;
  const failures = rs.flatMap((r) => r.checks.filter((k) => !k.ok).map((k) => `${k.label} → got "${k.got}"`));
  const avg = (key) => rs.reduce((s, r) => s + r[key], 0) / rs.length;
  return { cat: c.cat, name: c.name, passed, runs: rs.length, seconds: avg("seconds"), asks: avg("asks"), failures: [...new Set(failures)], example: rs.find((r) => r.checks.some((k) => !k.ok)) ?? rs[0] };
});

console.log("\n");
for (const cat of [...new Set(rows.map((r) => r.cat))]) {
  const inCat = rows.filter((r) => r.cat === cat);
  const p = inCat.reduce((s, r) => s + r.passed, 0);
  const n = inCat.reduce((s, r) => s + r.runs, 0);
  console.log(`${cat.toUpperCase()}  ${p}/${n}`);
  for (const r of inCat) {
    console.log(`  ${r.passed === r.runs ? "✔" : r.passed ? "~" : "✘"} ${r.passed}/${r.runs}  ${r.name.padEnd(28)} ${r.seconds.toFixed(1)}s  ${r.asks.toFixed(1)} q  "${r.example.query}"`);
    for (const f of r.failures) console.log(`      ${f}`);
  }
}
const total = rows.reduce((s, r) => s + r.passed, 0);
console.log(`\nTOTAL ${total}/${jobs.length} conversations passed (${Math.round((total / jobs.length) * 100)}%)`);

const md = [
  `# Timber lab report`,
  ``,
  `${new Date().toISOString()} · ${picked.length} cases × ${runs} runs · ${total}/${jobs.length} passed`,
  ``,
  `| | Category | Case | Pass | Avg time | Avg questions | Final query |`,
  `|---|---|---|---|---|---|---|`,
  ...rows.map((r) => `| ${r.passed === r.runs ? "✔" : r.passed ? "~" : "✘"} | ${r.cat} | ${r.name} | ${r.passed}/${r.runs} | ${r.seconds.toFixed(1)} s | ${r.asks.toFixed(1)} | ${r.example.query} |`),
  ``,
  `## Failures`,
  ...rows
    .filter((r) => r.failures.length)
    .flatMap((r) => [``, `### ${r.cat} · ${r.name}`, ...r.failures.map((f) => `- ${f}`), ``, "```", ...r.example.transcript.map((t) => JSON.stringify(t)), "```"]),
].join("\n");
await mkdir("smoke-output", { recursive: true });
await writeFile("smoke-output/lab-report.md", md);
await writeFile("smoke-output/lab-report.json", JSON.stringify(rows, null, 2));
console.log("Report: smoke-output/lab-report.md");
process.exit(total === jobs.length ? 0 : 1);
