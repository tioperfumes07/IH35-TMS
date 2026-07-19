/**
 * Unforgeable in-process proof that verify:static already succeeded in THIS Node process.
 *
 * Not env-based: a raw IH35_* env var cannot mint or replay this proof across processes.
 * Pre-push must not duplicate verify:static — block-ready calls ensureVerifyStaticOnce(),
 * which skips only when this module already holds a trusted proof for the current process.
 */
import { spawnSync } from "node:child_process";
import { randomBytes } from "node:crypto";
import path from "node:path";
import { fileURLToPath } from "node:url";

const PROOF_KEY = Symbol.for("ih35.verifyStatic.sweepProof");

function store() {
  const g = globalThis;
  if (!g[PROOF_KEY]) {
    g[PROOF_KEY] = { proof: null };
  }
  return g[PROOF_KEY];
}

export function hasTrustedStaticSweepProof() {
  const s = store().proof;
  return Boolean(s && s.pid === process.pid && s.token && s.passed === true);
}

export function mintStaticSweepProof({ source = "verify-static" } = {}) {
  const proof = {
    pid: process.pid,
    token: randomBytes(24).toString("hex"),
    startedAt: Date.now(),
    passed: true,
    source,
  };
  store().proof = proof;
  return { ...proof };
}

export function clearStaticSweepProof() {
  store().proof = null;
}

export function readStaticSweepProof() {
  const s = store().proof;
  return s ? { ...s } : null;
}

/**
 * Ensure verify:static has run successfully once in this process.
 * - Trusted in-process proof → skip (no duplicate)
 * - Otherwise run node scripts/verify-static.mjs; mint proof on success; fail closed on failure
 */
export function ensureVerifyStaticOnce({
  root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), ".."),
  run = defaultRunStatic,
} = {}) {
  if (hasTrustedStaticSweepProof()) {
    return { ran: false, skipped: true, proof: readStaticSweepProof() };
  }
  const result = run(root);
  if (!result.ok) {
    const err = new Error(
      `verify:static required before block-ready but failed (fail closed): ${result.detail || "non-zero exit"}`
    );
    err.result = result;
    throw err;
  }
  const proof = mintStaticSweepProof({ source: "ensureVerifyStaticOnce" });
  return { ran: true, skipped: false, proof };
}

function defaultRunStatic(root) {
  const script = path.join(root, "scripts/verify-static.mjs");
  const res = spawnSync(process.execPath, [script], {
    cwd: root,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
    env: process.env,
  });
  const detail = `${res.stdout || ""}\n${res.stderr || ""}`.trim().slice(-500);
  return { ok: (res.status ?? 1) === 0, status: res.status ?? 1, detail };
}
