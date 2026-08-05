#!/usr/bin/env node
/**
 * Cursor ship preflight — Claude's model in one command.
 *
 * Run BEFORE every push AND before `gh pr create`:
 *   node scripts/ops/cursor-ship-preflight.mjs
 *   node scripts/ops/cursor-ship-preflight.mjs --body-file /tmp/pr-body.txt
 *
 * 0) tip-main freshness (Rule 36) — fetch origin/main; FAIL if branch behind > 0
 * 1) money-pr-local-gate (Rule 29 suite: DoD, palette fin+nonfin, auth rateLimit, lanes, …)
 * 2) cursor-pr-body-gate when --body-file is provided (Rule 30 / CI evidence body)
 *
 * Owner 2026-08-03: agents must NOT babys CI. Local PASS → one push → stop.
 * Owner 2026-08-05: FAIL closed when behind main — rebase first (Claude serial ship).
 */
import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const LABEL = "cursor-ship-preflight";

function argValue(flag) {
  const i = process.argv.indexOf(flag);
  return i >= 0 ? process.argv[i + 1] : null;
}

function run(rel, args = []) {
  console.log(`\n[${LABEL}] RUN ${rel} ${args.join(" ")}`.trim());
  const res = spawnSync(process.execPath, [path.join(ROOT, rel), ...args], {
    cwd: ROOT,
    encoding: "utf8",
    env: process.env,
  });
  const out = `${res.stdout ?? ""}${res.stderr ?? ""}`.trim();
  if (out) console.log(out);
  return res.status ?? 1;
}

function git(args) {
  const res = spawnSync("git", args, { cwd: ROOT, encoding: "utf8" });
  return {
    status: res.status ?? 1,
    out: `${res.stdout ?? ""}`.trim(),
    err: `${res.stderr ?? ""}`.trim(),
  };
}

/** Rule 36 — Claude serial ship: never push a branch that is behind origin/main. */
function assertTipMainFresh() {
  console.log(`\n[${LABEL}] RUN git fetch origin main (Rule 36 tip-main)`);
  const fetch = git(["fetch", "origin", "main"]);
  if (fetch.status !== 0) {
    console.error(`${LABEL}: FAIL — git fetch origin main failed: ${fetch.err}`);
    return 1;
  }
  const behind = git(["rev-list", "--count", "HEAD..origin/main"]);
  if (behind.status !== 0) {
    console.error(`${LABEL}: FAIL — could not count commits behind origin/main: ${behind.err}`);
    return 1;
  }
  const n = Number.parseInt(behind.out, 10);
  if (!Number.isFinite(n)) {
    console.error(`${LABEL}: FAIL — bad behind count: ${behind.out}`);
    return 1;
  }
  if (n > 0) {
    console.error(
      `\n${LABEL}: FAIL — branch is ${n} commit(s) behind origin/main (Rule 36).\n` +
        `  Claude's method: git fetch origin main && git rebase origin/main\n` +
        `  then re-run this preflight. Do NOT push a stale base — that is the 3-hour rebase thrash.`,
    );
    return 1;
  }
  const tip = git(["rev-parse", "--short", "HEAD"]);
  const main = git(["rev-parse", "--short", "origin/main"]);
  console.log(
    `[${LABEL}] tip-main OK — HEAD ${tip.out} contains origin/main ${main.out} (behind=0)`,
  );
  return 0;
}

if (process.argv.includes("--selftest")) {
  const a = run("scripts/money-pr-local-gate.mjs", ["--selftest"]);
  const b = run("scripts/cursor-pr-body-gate.mjs", ["--selftest"]);
  const c = run("scripts/verify-new-auth-routes-rate-limited.mjs", ["--selftest"]);
  if (a || b || c) process.exit(1);
  console.log(`${LABEL} --selftest PASS`);
  process.exit(0);
}

const fresh = assertTipMainFresh();
if (fresh !== 0) process.exit(fresh);

const codeGate = run("scripts/money-pr-local-gate.mjs");
if (codeGate !== 0) {
  console.error(`\n${LABEL}: FAIL — money-pr-local-gate. Fix locally, then re-run. Do not open/push a red PR.`);
  process.exit(codeGate);
}

const bodyFile = argValue("--body-file");
if (bodyFile) {
  const codeBody = run("scripts/cursor-pr-body-gate.mjs", ["--body-file", bodyFile]);
  if (codeBody !== 0) {
    console.error(`\n${LABEL}: FAIL — PR body rejected. Copy docs/templates/CLAUDE-GREEN-PR-BODY.md.`);
    process.exit(codeBody);
  }
} else {
  console.log(
    `[${LABEL}] note: pass --body-file /tmp/pr-body.txt before gh pr create (Rule 30).`,
  );
}

console.log(`\n${LABEL}: PASS — safe to push / open PR (Claude-parity). One push. Do not babysit CI.`);
process.exit(0);
