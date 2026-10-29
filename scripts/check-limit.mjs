import assert from "node:assert/strict";
import { limited } from "../lib/limit.ts";

const req = (ip) => new Request("http://x/api", { headers: { "x-forwarded-for": ip } });

for (let i = 0; i < 40; i++) assert.equal(limited(req("1.1.1.1")), null);
assert.equal(limited(req("1.1.1.1")).status, 429);
assert.equal(limited(req("2.2.2.2")), null);
console.log("limit ok");
