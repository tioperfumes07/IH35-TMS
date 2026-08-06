#!/usr/bin/env node
// GUARD: no workflow may key its concurrency group on a bare ref.
//
// WHY THIS IS LAW AND NOT STYLE. `group: ${{ github.workflow }}-${{ github.ref }}` with
// cancel-in-progress means ANY new trigger on a branch cancels the previous run on that branch —
// including one still QUEUED that has never executed. A cancelled required check is TERMINAL: it
// never re-reports, so the PR is unmergeable until a human notices and re-runs it by hand.
//
// Harmless when runs start immediately; fatal when they do not. On 2026-08-06, with the queue backed
// up and nothing executing, it produced 8 stuck CANCELLED required checks across 7 PRs, none of which
// had a single code failure. It is also self-amplifying: re-running a stuck check creates a new
// trigger, which cancels the next queued run. The PRs were never failing — the mechanism used to fix
// them was what kept breaking them.
//
// Keying on the head SHA confines supersession to one commit: a redundant re-trigger of the SAME
// commit is still cancelled (intended), but a NEW push can no longer orphan the required checks of
// the commit the PR actually merges.
//
// Run with --selftest to prove it can go red.

import fs from "node:fs";
import path from "node:path";

const LABEL = "verify-ci-concurrency-sha-scoped";
const WF_DIR = ".github/workflows";

// A bare-ref group: `github.ref` (or head_ref) with NOTHING commit-identifying alongside it.
const BARE_REF = /group:\s*.*\$\{\{\s*github\.(ref|head_ref)\s*\}\}/;
const COMMIT_SCOPED = /\$\{\{[^}]*\b(head\.sha|github\.sha|github\.run_id|pull_request\.number)\b[^}]*\}\}/;

function scan(dir) {
  const offenders = [];
  let checked = 0;
  for (const f of fs.readdirSync(dir).filter((f) => f.endsWith(".yml") || f.endsWith(".yaml"))) {
    const p = path.join(dir, f);
    const lines = fs.readFileSync(p, "utf8").split("\n");
    for (let i = 0; i < lines.length; i++) {
      if (!/^\s*group:/.test(lines[i])) continue;
      checked++;
      // Only a concurrency `group:` matters — and only when cancellation is possible at all.
      const window = lines.slice(Math.max(0, i - 3), i + 3).join("\n");
      if (!/concurrency:/.test(window) && !/cancel-in-progress/.test(window)) continue;
      if (BARE_REF.test(lines[i]) && !COMMIT_SCOPED.test(lines[i])) {
        offenders.push(`${p}:${i + 1}: ${lines[i].trim()}`);
      }
    }
  }
  return { offenders, checked };
}

if (process.argv.includes("--selftest")) {
  const tmp = fs.mkdtempSync(path.join(process.env.TMPDIR || "/tmp", "wfsel-"));
  // case 1: a bare-ref group MUST be caught
  fs.writeFileSync(
    path.join(tmp, "bad.yml"),
    "name: bad\nconcurrency:\n  group: ${{ github.workflow }}-${{ github.ref }}\n  cancel-in-progress: true\n"
  );
  const bad = scan(tmp);
  if (bad.offenders.length !== 1) {
    console.error(`${LABEL}: SELFTEST FAIL — planted bare-ref group not caught`);
    process.exit(1);
  }
  // case 2: the sha-scoped form MUST pass
  fs.writeFileSync(
    path.join(tmp, "bad.yml"),
    "name: ok\nconcurrency:\n  group: ${{ github.workflow }}-${{ github.event.pull_request.head.sha || github.ref }}\n  cancel-in-progress: true\n"
  );
  const good = scan(tmp);
  if (good.offenders.length !== 0) {
    console.error(`${LABEL}: SELFTEST FAIL — sha-scoped group wrongly flagged: ${good.offenders}`);
    process.exit(1);
  }
  fs.rmSync(tmp, { recursive: true, force: true });
  console.log(`${LABEL}: selftest PASS — RED on a planted bare-ref group, GREEN on the sha-scoped form.`);
}

if (!fs.existsSync(WF_DIR)) {
  console.log(`${LABEL} OK — no ${WF_DIR} in this checkout`);
  process.exit(0);
}
const { offenders, checked } = scan(WF_DIR);
if (offenders.length) {
  console.error(`${LABEL} FAILED — ${offenders.length} workflow(s) key concurrency on a bare ref:\n`);
  for (const o of offenders) console.error(`  - ${o}`);
  console.error(
    `\nA queued-but-never-started run can be cancelled by the next trigger, and a cancelled required\n` +
      `check never re-reports — the PR is then permanently unmergeable.\n` +
      `Fix: group: \${{ github.workflow }}-\${{ github.event.pull_request.head.sha || github.ref }}\n`
  );
  process.exit(1);
}
console.log(`${LABEL} OK — ${checked} concurrency group(s), none keyed on a bare ref.`);
