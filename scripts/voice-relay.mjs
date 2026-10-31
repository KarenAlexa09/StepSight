// Live speech-to-text relay: the browser streams 24 kHz PCM here, we forward it to
// Muse Voice Transcribe realtime and send the transcript events back. Keeps the API key off the browser.
// Run: npm run voice   (uses certificates/ from `npm run dev:phone` for wss:// when they exist)
// Hosted: render.yaml deploys it to Render's free plan, which gives it PORT and https.
import { existsSync, readFileSync } from "node:fs";
import { createServer as http } from "node:http";
import { createServer as https } from "node:https";
import { WebSocketServer, WebSocket } from "ws";

const PORT = Number(process.env.PORT || process.env.VOICE_PORT || 3001);
const MAX_MS = 60_000;
const KEY = process.env.MODEL_API_KEY;
// shortcut: origin check only, no auth; add auth before sharing the link publicly.
const ORIGINS = (process.env.VOICE_ORIGINS || "").split(",").filter(Boolean);
const allowed = (origin = "") =>
  ORIGINS.length ? ORIGINS.includes(origin) : /^https?:\/\/(localhost|127\.0\.0\.1|192\.168\.\d+\.\d+|10\.\d+\.\d+\.\d+)(:\d+)?$/.test(origin);

if (!KEY) throw new Error("Missing MODEL_API_KEY");

// Plain GET answers "ok": the app pings it on load to wake a sleeping free instance, and Render uses it as a health check.
const ok = (_req, res) => res.end("ok");
const certs = existsSync("certificates/localhost.pem") && existsSync("certificates/localhost-key.pem");
const server = certs
  ? https({ cert: readFileSync("certificates/localhost.pem"), key: readFileSync("certificates/localhost-key.pem") }, ok)
  : http(ok);
const wss = new WebSocketServer({ server, maxPayload: 64 * 1024, verifyClient: ({ origin }) => allowed(origin) });

wss.on("connection", (browser) => {
  const meta = new WebSocket("wss://api.meta.ai/v1/asr/realtime");
  const queue = [];
  let ready = false;
  const end = () => {
    if (meta.readyState === WebSocket.OPEN) meta.send(JSON.stringify({ type: "endStream" }));
  };
  const limit = setTimeout(end, MAX_MS);

  meta.on("open", () =>
    meta.send(JSON.stringify({ authorization: { accessToken: `Bearer ${KEY}` }, audioEncoding: "PCM_24KHZ", model: "muse-voice-transcribe-1.0", mode: "ENDPOINTING" })),
  );
  meta.on("message", (data) => {
    let event;
    try {
      event = JSON.parse(data.toString());
    } catch {
      return;
    }
    if (!event.type) {
      ready = Boolean(event.sessionId);
      queue.splice(0).forEach((chunk) => meta.send(chunk));
      return;
    }
    if (event.type === "audioProgress") return;
    if (browser.readyState === WebSocket.OPEN) browser.send(JSON.stringify(event));
  });
  meta.on("close", () => browser.close());
  meta.on("error", () => browser.close(1011, "upstream"));

  browser.on("message", (data, binary) => {
    if (!binary) return end(); // any text frame means "I'm done talking"
    if (ready) meta.send(data);
    else queue.push(data);
  });
  browser.on("close", () => {
    clearTimeout(limit);
    end();
    setTimeout(() => meta.close(), 2000);
  });
});

server.listen(PORT, () => console.log(`Voice relay on ${certs ? "wss" : "ws"}://localhost:${PORT}`));
