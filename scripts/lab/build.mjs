// Timber's build-time lab: does the step check say "done" only when the photo really shows it, and does Timber
// understand what people say while building? Runs against a running app, several times each.
// Usage: node scripts/lab/build.mjs [baseUrl] [--runs=3] [--only=checks|voice]
import { readFile } from "node:fs/promises";

const args = process.argv.slice(2);
const flag = (name) => args.find((a) => a.startsWith(`--${name}=`))?.split("=")[1];
const base = args.find((a) => a.startsWith("http")) ?? "http://localhost:3100";
const runs = Number(flag("runs") ?? 3);
const only = flag("only");

const TOWER = [
  { instruction: "Snap the red 2x4 brick onto the green baseplate.", check: "The red brick sits on the green baseplate.", parts: ["1× red 2x4 brick"] },
  { instruction: "Snap the blue 2x2 brick on top of the red brick.", check: "The blue brick sits on top of the red brick.", parts: ["1× blue 2x2 brick"] },
  { instruction: "Snap the yellow 2x4 brick on top of the blue brick.", check: "The yellow brick sits on top of the blue brick.", parts: ["1× yellow 2x4 brick"] },
];
const LAMP = [
  { instruction: "Unplug the lamp from the power strip.", check: "The lamp's plug is out of the power strip.", parts: [] },
  { instruction: "Lift the lampshade off the lamp.", check: "The lampshade is off and the bare bulb is visible.", parts: [] },
  { instruction: "Unscrew the old bulb and take it out.", check: "The old bulb is out and the socket is empty.", parts: [] },
  { instruction: "Screw in the new bulb and put the shade back on.", check: "A bulb is in the lamp and the lampshade is back on top.", parts: [] },
];

// [name, step, photo, done?]: every "done" photo is paired with near misses, which matter most (a wrong "done" teaches a wrong build).
const CHECKS = [
  ["tower 1 done", TOWER[0], "step1", true],
  ["tower 1 not started", TOWER[0], "parts", false],
  ["tower 2 done", TOWER[1], "step2", true],
  ["tower 2 blue beside red", TOWER[1], "wrong", false],
  ["tower 2 not started", TOWER[1], "step1", false],
  ["tower 3 done", TOWER[2], "step3", true],
  ["tower 3 not started", TOWER[2], "step2", false],
  ["lamp 1 unplugged", LAMP[0], "lamp1", true],
  ["lamp 1 still plugged", LAMP[0], "lamp0", false],
  ["lamp 1 hand on shade, plugged", LAMP[0], "lamp-wrong", false],
  ["lamp 2 shade off", LAMP[1], "lamp2", true],
  ["lamp 2 shade on", LAMP[1], "lamp1", false],
  ["lamp 3 bulb out", LAMP[2], "lamp3", true],
  ["lamp 3 bulb in", LAMP[2], "lamp2", false],
  ["lamp 4 bulb in, shade on", LAMP[3], "lamp4", true],
  ["lamp 4 no bulb", LAMP[3], "lamp3", false],
];

// [said, lang, action, target regex]: what people say mid-build, in both languages.
const VOICE = [
  ["next", "en", "next"],
  ["done, what's next?", "en", "next"],
  ["listo", "es", "next"],
  ["ya lo puse, siguiente", "es", "next"],
  ["go back", "en", "back"],
  ["vuelve al paso anterior", "es", "back"],
  ["say that again", "en", "repeat"],
  ["¿me lo repites?", "es", "repeat"],
  ["where is the red brick?", "en", "find", /red/i],
  ["¿dónde está el ladrillo azul?", "es", "find", /blue|azul/i],
  ["I can't find the green plate", "en", "find", /green/i],
  ["no encuentro la base verde", "es", "find", /green|verde/i],
  ["what does snap mean?", "en", "none"],
  ["¿cuánto me falta?", "es", "none"],
  ["this is hard", "en", "none"],
  ["uhh", "en", "none"],
];

async function post(path, body) {
  for (let tries = 0; ; tries++) {
    const res = await fetch(`${base}${path}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    if (res.status === 429 && tries < 6) {
      await new Promise((r) => setTimeout(r, 15_000));
      continue;
    }
    const data = await res.json();
    if (!res.ok) throw new Error(`${path} ${res.status}: ${data.error}`);
    return data;
  }
}

const photo = async (name) => `data:image/jpeg;base64,${(await readFile(`public/demo/${name}.jpg`)).toString("base64")}`;
const spanish = (s) => /[áéíóúñ¿¡]|\b(el|la|los|las|está|pieza|ladrillo|que|ya|solo|falta|este|vamos|paso|tu|te)\b/i.test(s);

async function check([name, step, file, done]) {
  const lang = Math.random() < 0.5 ? "es" : "en";
  const r = await post("/api/verify", { image: await photo(file), step, lang });
  const fails = [];
  if (r.done !== done) fails.push(`said ${r.done ? "done" : "not done"} (${r.confidence}): "${r.seen}"`);
  if (!r.done && !r.fix) fails.push("no fix given");
  if (lang === "es" && !spanish(`${r.seen} ${r.fix} ${r.reply}`)) fails.push(`answered in English for Spanish: "${r.reply}"`);
  return fails;
}

async function voice([said, lang, action, target]) {
  const r = await post("/api/ask", { said, lang, step: { instruction: TOWER[0].instruction, parts: TOWER[0].parts, number: 1, total: 3 } });
  const fails = [];
  if (r.action !== action) fails.push(`action ${r.action}, wanted ${action} (reply "${r.reply}")`);
  if (target && !target.test(r.target)) fails.push(`target "${r.target}"`);
  if (lang === "es" && !spanish(r.reply)) fails.push(`replied in English: "${r.reply}"`);
  if (/falta|left|remain/i.test(said) && !/2|3|dos|tres|two|three/i.test(r.reply)) fails.push(`didn't say how many steps are left: "${r.reply}"`);
  return fails;
}

const suites = [
  ["checks", CHECKS, check, (c) => c[0]],
  ["voice", VOICE, voice, (c) => `"${c[0]}"`],
].filter(([name]) => !only || name === only);

let total = 0;
let passed = 0;
for (const [suite, cases, run, label] of suites) {
  console.log(`\n${suite.toUpperCase()}`);
  for (const c of cases) {
    const results = await Promise.all(Array.from({ length: runs }, () => run(c).catch((e) => [e.message])));
    const ok = results.filter((f) => !f.length).length;
    total += runs;
    passed += ok;
    console.log(`  ${ok === runs ? "✔" : ok ? "~" : "✘"} ${ok}/${runs}  ${label(c)}`);
    for (const f of new Set(results.flat())) console.log(`      ${f}`);
  }
}
console.log(`\nTOTAL ${passed}/${total} (${Math.round((passed / total) * 100)}%)`);
process.exit(passed === total ? 0 : 1);
