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

/**
 * GATE-LIVELOCK-01: computes the current push's changed-file set (against origin/main's
 * merge-base, matching the freshness check's own base) and passes it to verify-static.mjs so a
 * LOCAL pre-push run only executes guards whose owned paths intersect it. `GATE_FULL=1` (already
 * read by verify-static.mjs itself) forces the full unscoped run; this function still computes
 * the diff in that case so a caller can log it, but verify-static.mjs ignores it once GATE_FULL
 * wins. Diff computation failing (fresh clone with no origin/main, detached HEAD, etc.) fails
 * OPEN to unscoped (null → every guard runs) — never silently narrows the gate because the diff
 * could not be computed.
 */
export function computeChangedFilesForGate(root, { run = spawnSync } = {}) {
  try {
    const mergeBase = run("git", ["merge-base", "HEAD", "origin/main"], { cwd: root, encoding: "utf8" });
    if (mergeBase.status !== 0) return null;
    const base = mergeBase.stdout.trim();
    if (!base) return null;
    const diff = run("git", ["diff", "--name-only", `${base}..HEAD`], { cwd: root, encoding: "utf8" });
    if (diff.status !== 0) return null;
    return diff.stdout.split("\n").map((s) => s.trim()).filter(Boolean);
  } catch {
    return null;
  }
}

function defaultRunStatic(root) {
  const script = path.join(root, "scripts/verify-static.mjs");
  const changedFiles = computeChangedFilesForGate(root);
  const env = { ...process.env };
  if (changedFiles !== null) env.IH35_GATE_DIFF_FILES = changedFiles.join("\n");
  // GATE-LIVELOCK-01: stderr inherited so verify-static.mjs's every-10-steps progress prints
  // stream live — a fully-buffered/piped stderr was read as "hung" during a real long run
  // (Cascade, 2026-09-03). stdout stays piped so the final PASS/FAIL summary can still be
  // captured into the thrown error's detail on failure.
  const res = spawnSync(process.execPath, [script], {
    cwd: root,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "inherit"],
    env,
  });
  const detail = `${res.stdout || ""}`.trim().slice(-500);
  return { ok: (res.status ?? 1) === 0, status: res.status ?? 1, detail };
}
