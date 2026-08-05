#!/usr/bin/env node
/**
 * Cursor ship preflight — Claude's model in one command.
 *
 * Run BEFORE every push AND before `gh pr create`:
 *   node scripts/ops/cursor-ship-preflight.mjs
 *   node scripts/ops/cursor-ship-preflight.mjs --body-file /tmp/pr-body.txt
 *
 * 0) tip contains origin/main (Rule 36 — fail closed if behind; rebase then re-run)
 * 1) money-pr-local-gate (Rule 29 suite: DoD, palette fin+nonfin, auth rateLimit, lanes, …)
 * 2) cursor-pr-body-gate when --body-file is provided (Rule 30 / CI evidence body)
 *
 * Owner 2026-08-03: agents must NOT babys CI. Local PASS → one push → stop.
 * Owner 2026-08-05: tip-main ancestry is mandatory (Claude serial ship — Rule 36).
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
    out: `${res.stdout ?? ""}${res.stderr ?? ""}`.trim(),
  };
}

/** Rule 36: refuse push when tip is behind origin/main (Claude never ships stale bases). */
function assertTipContainsMain() {
  console.log(`\n[${LABEL}] RUN tip-contains-origin/main (Rule 36)`);
  const fetch = git(["fetch", "origin", "main"]);
  if (fetch.status !== 0) {
    console.error(`${LABEL}: FAIL — git fetch origin main failed.\n${fetch.out}`);
    return 1;
  }
  const anc = git(["merge-base", "--is-ancestor", "origin/main", "HEAD"]);
  if (anc.status !== 0) {
    const behind = git(["rev-list", "--count", "HEAD..origin/main"]);
    console.error(
      `${LABEL}: FAIL — HEAD does not contain origin/main (behind=${behind.out || "?"}).\n` +
        `Rule 36: git rebase origin/main → re-run this preflight → then ONE push.\n` +
        `Do not open/push a CONFLICTING / stale-base PR.`,
    );
    return 1;
  }
  const tip = git(["rev-parse", "--short", "HEAD"]);
  const main = git(["rev-parse", "--short", "origin/main"]);
  console.log(
    `${LABEL}: tip ${tip.out} contains origin/main ${main.out} — ancestry OK`,
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

const tipGate = assertTipContainsMain();
if (tipGate !== 0) process.exit(tipGate);

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
