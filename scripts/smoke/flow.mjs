// Runs typed conversations through /api/understand (and optionally /api/manual) on a running server.
// Usage: node scripts/smoke/flow.mjs [baseUrl] [--manual] [--only=name]
const args = process.argv.slice(2);
const base = args.find((a) => a.startsWith("http")) ?? "http://localhost:3100";
const withManual = args.includes("--manual");
const only = args.find((a) => a.startsWith("--only="))?.slice(7);
const MAX_ASKS = 4;
const ASKS_MODEL = /brand|model|make|marca|modelo/i;

const cases = [
  {
    name: "headphones cleaning",
    say: "I need to fix my headphones",
    answers: ["Sony WH-1000XM4", "cleaning the ear pads"],
    firstAsks: ASKS_MODEL,
    query: [/sony/i, /xm4/i, /clean/i],
  },
  {
    name: "headphones, model unknown",
    say: "I need to clean my headphones",
    answers: ["I don't know the model", "use a generic guide"],
    askedAbout: /photo|label|generic|picture|sticker/i,
    query: [/headphone/i, /clean/i],
  },
  { name: "bike chain fell off", say: "my bike chain fell off", answers: ["a normal road bike"], firstAsks: null, query: [/chain/i] },
  {
    name: "coffee machine descale",
    say: "I want to descale my coffee machine",
    answers: ["De'Longhi Magnifica S ECAM22.110"],
    firstAsks: ASKS_MODEL,
    query: [/longhi/i, /magnifica|ecam/i, /descal/i],
  },
  {
    name: "model given up front",
    say: "How do I clean the ear pads on my Sony WH-1000XM4 headphones?",
    answers: [],
    firstAsks: null,
    query: [/sony/i, /xm4/i, /clean|ear pad/i],
  },
  { name: "vague: it's broken", say: "it's broken", answers: [], notReady: true },
  { name: "Spanish vague", lang: "es", say: "no funciona", answers: [], notReady: true },
  {
    name: "brand only",
    say: "My Bose headphones won't pair",
    answers: ["QuietComfort 45"],
    firstAsks: ASKS_MODEL,
    query: [/bose/i, /45/, /pair/i],
  },
  { name: "IKEA build", say: "Build a Kallax shelf", answers: ["the 2x4 one"], query: [/kallax/i] },
  {
    name: "Spanish headphones",
    lang: "es",
    say: "Necesito limpiar mis audífonos",
    answers: ["Sony WH-1000XM4"],
    firstAsks: /marca|modelo/i,
    query: [/sony/i, /xm4/i, /clean/i],
  },
];

async function understand(body) {
  const res = await fetch(`${base}/api/understand`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  const data = await res.json();
  if (!res.ok) throw new Error(`understand ${res.status}: ${JSON.stringify(data)}`);
  return data;
}

async function manual(query, mode, lang) {
  const res = await fetch(`${base}/api/manual`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ query, mode, lang }) });
  if (!res.ok) throw new Error(`manual start: ${(await res.json()).error}`);
  const lines = (await res.text()).trim().split("\n").map((line) => JSON.parse(line));
  const last = lines.at(-1);
  if (last?.type !== "done") throw new Error("manual failed");
  return last.manual;
}

async function run(c) {
  const checks = [];
  const check = (label, ok, detail = "") => checks.push({ label, ok, detail });
  const chat = [];
  const answers = [...c.answers];
  let said = c.say;
  let last;
  let asks = 0;
  for (;;) {
    last = await understand({ text: said, history: chat, lang: c.lang ?? "en" });
    console.log(`  you: ${said}\n  -> ${JSON.stringify(last)}`);
    chat.push({ role: "you", text: said });
    if (asks === 0) {
      if (c.firstAsks) check("first reply asks brand/model", !last.ready && c.firstAsks.test(last.question), last.question);
      else if (c.firstAsks === null) check("does not ask brand/model", last.ready || !ASKS_MODEL.test(last.question) || answers.length > 0 && !ASKS_MODEL.test(last.question), last.question);
    }
    if (c.askedAbout && asks === 1) check("offers photo/generic when model unknown", c.askedAbout.test(last.question + last.options.join(" ")), last.question);
    if (last.ready || !last.question || asks >= MAX_ASKS || !answers.length) break;
    chat.push({ role: "timber", text: last.question });
    asks++;
    said = answers.shift();
  }
  if (c.notReady) check("not ready on a vague request", !last.ready || !last.clear, JSON.stringify({ clear: last.clear, ready: last.ready }));
  else {
    check("ends ready", last.ready, last.question);
    check(`within ${MAX_ASKS} questions`, asks <= MAX_ASKS, String(asks));
    for (const re of c.query ?? []) check(`query matches ${re}`, re.test(last.query), last.query);
  }
  if (c.firstAsks === null && c.say.match(/Sony/)) check("asked nothing", asks === 0, `${asks} questions`);
  if (withManual && !c.notReady && last.ready && c.name !== "bike chain fell off") {
    const m = await manual(last.query, last.mode, c.lang ?? "en");
    console.log(`  manual: ${m.title} | ${m.steps.length} steps | source ${JSON.stringify(m.source)}`);
    check("manual has steps and a source url", m.steps.length >= 3 && /^https:/.test(m.source?.url ?? ""), m.source?.url);
  }
  return checks;
}

let failed = 0;
for (const c of cases.filter((x) => !only || x.name.includes(only))) {
  console.log(`\n# ${c.name}`);
  let checks;
  try {
    checks = await run(c);
  } catch (e) {
    checks = [{ label: "ran", ok: false, detail: String(e.message) }];
  }
  for (const k of checks) {
    console.log(`  ${k.ok ? "PASS" : "FAIL"} ${k.label}${k.ok ? "" : ` (${k.detail})`}`);
    if (!k.ok) failed++;
  }
}
console.log(failed ? `\n${failed} check(s) failed` : "\nall checks passed");
process.exit(failed ? 1 : 0);
