#!/usr/bin/env node
/**
 * Cursor ship preflight — Claude's model in one command.
 *
 * Run BEFORE every push AND before `gh pr create`:
 *   node scripts/ops/cursor-ship-preflight.mjs
 *   node scripts/ops/cursor-ship-preflight.mjs --body-file /tmp/pr-body.txt
 *
 * 1) money-pr-local-gate (Rule 29 suite: DoD, palette fin+nonfin, auth rateLimit, lanes, …)
 * 2) cursor-pr-body-gate when --body-file is provided (Rule 30 / CI evidence body)
 *
 * Owner 2026-08-03: agents must NOT babys CI. Local PASS → one push → stop.
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

if (process.argv.includes("--selftest")) {
  const a = run("scripts/money-pr-local-gate.mjs", ["--selftest"]);
  const b = run("scripts/cursor-pr-body-gate.mjs", ["--selftest"]);
  const c = run("scripts/verify-new-auth-routes-rate-limited.mjs", ["--selftest"]);
  if (a || b || c) process.exit(1);
  console.log(`${LABEL} --selftest PASS`);
  process.exit(0);
}

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
