#!/usr/bin/env node
/**
 * Boot the compiled API (same entry as Render `npm run start`) and GET /api/v1/health.
 * Catches "tsc green but dist won't run" failures (missing assets, bad path resolution, etc.).
 */
import { spawn } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const port = process.env.BOOT_SMOKE_PORT ?? "3999";

const child = spawn(process.execPath, ["dist/index.js"], {
  cwd: root,
  env: {
    ...process.env,
    PORT: port,
    ENABLE_OUTBOX_PROCESSOR: "false",
    NODE_ENV: "test",
    IH35_BOOT_API_SMOKE: "true",
    OAUTH_GOOGLE_CLIENT_ID: process.env.OAUTH_GOOGLE_CLIENT_ID ?? "boot-smoke-google-client-id",
    OAUTH_GOOGLE_CLIENT_SECRET: process.env.OAUTH_GOOGLE_CLIENT_SECRET ?? "boot-smoke-google-client-secret",
    OAUTH_REDIRECT_URI: process.env.OAUTH_REDIRECT_URI ?? "http://localhost:5173/api/v1/auth/google/callback",
    DRIVER_JWT_SECRET: process.env.DRIVER_JWT_SECRET ?? "boot-smoke-driver-jwt-secret",
  },
  stdio: ["ignore", "inherit", "inherit"],
});

let exitCode = /** @type {number | null} */ (null);
child.on("exit", (code) => {
  exitCode = code;
});

async function sleep(ms) {
  await new Promise((r) => setTimeout(r, ms));
}

async function waitHealthy(deadlineMs) {
  const url = `http://127.0.0.1:${port}/api/v1/health`;
  const deadline = Date.now() + deadlineMs;
  while (Date.now() < deadline) {
    if (exitCode !== null && exitCode !== 0) {
      return { ok: false, reason: `process exited early with code ${exitCode}` };
    }
    try {
      const res = await fetch(url, { signal: AbortSignal.timeout(2000) });
      if (res.ok) return { ok: true };
    } catch {
      /* server not up yet */
    }
    await sleep(400);
  }
  return { ok: false, reason: "timeout waiting for /api/v1/health" };
}

const result = await waitHealthy(90_000);

try {
  child.kill("SIGTERM");
} catch {
  /* ignore */
}
await sleep(1500);
try {
  child.kill("SIGKILL");
} catch {
  /* ignore */
}

if (!result.ok) {
  console.error(`[ci-boot-api-smoke] FAILED: ${result.reason}`);
  process.exit(1);
}

console.log("[ci-boot-api-smoke] OK — compiled dist/index.js answered /api/v1/health");
process.exit(0);
