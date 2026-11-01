// Self-check for lib/track.ts: a bright square moved 6 px right and 4 px down must be followed there.
// Usage: node --experimental-strip-types scripts/smoke/track.mjs
import assert from "node:assert/strict";
import { cut, follow } from "../../lib/track.ts";

const W = 80;
const H = 60;
const frame = (ox, oy) => {
  const data = new Uint8Array(W * H).fill(40);
  for (let y = 0; y < 14; y++) for (let x = 0; x < 20; x++) data[(20 + oy + y) * W + 30 + ox + x] = 200 + ((x * 7 + y * 3) % 40);
  return { data, width: W, height: H };
};

const patch = cut(frame(0, 0), { left: 30, top: 20, right: 50, bottom: 34 });
assert.ok(patch);
const moved = follow(frame(6, 4), patch);
assert.equal(moved.x - patch.x, 6);
assert.equal(moved.y - patch.y, 4);
assert.ok(moved.error < 1, `error ${moved.error}`);
const gone = follow({ data: new Uint8Array(W * H).fill(40), width: W, height: H }, patch);
assert.ok(gone.error > 60, `lost part should look lost, error ${gone.error}`);
console.log("track ok");
