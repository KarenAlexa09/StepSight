import { outputText, post } from "./lib.mjs";

const { json, seconds } = await post("/responses", {
  model: "muse-spark-1.3",
  input: "In one sentence, what is a 2x4 building brick?",
});

console.log(outputText(json));
console.log(`\n${seconds}s · ${json.usage?.total_tokens ?? "?"} tokens`);
