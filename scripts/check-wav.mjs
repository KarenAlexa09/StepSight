import assert from "node:assert/strict";
import { encodeWav } from "../lib/wav.ts";

const view = new DataView(encodeWav(new Float32Array([0, 1, -1, 0.5, 2]), 24000));
const text = (offset, length) => String.fromCharCode(...Array.from({ length }, (_, i) => view.getUint8(offset + i)));

assert.equal(text(0, 4), "RIFF");
assert.equal(text(8, 4), "WAVE");
assert.equal(view.getUint16(22, true), 1, "mono");
assert.equal(view.getUint32(24, true), 24000, "sample rate");
assert.equal(view.getUint16(34, true), 16, "16-bit");
assert.equal(view.getUint32(40, true), 10, "data size");
assert.deepEqual(
  [0, 1, 2, 3, 4].map((i) => view.getInt16(44 + i * 2, true)),
  [0, 32767, -32767, 16383, 32767],
  "samples are clamped to 16-bit PCM",
);
console.log("wav encoder ok");
