#!/usr/bin/env node
/**
 * money-pr-local-gate — FAIL-FAST before push (Rule 25 + Rule 29).
 *
 * Runs the same assertions CI will run later, but in seconds at husky
 * pre-push / branch:precheck-push — so a bad FINDING / MODULE_PROGRESS /
 * migration hour / verify-step parity / CLAIMED thrash / EntityLink baseline
 * never burns 15–20 minutes of build-typecheck.
 *
 * Wired as the FIRST step in scripts/branch-precheck-push.mjs buildPrecheckSteps.
 * Do not remove without updating verify-money-pr-local-gate + Rule 29.
 *
 * Cursor agents MUST also run this explicitly before every push:
 *   node scripts/money-pr-local-gate.mjs
 * Never rely on husky alone (worktrees often lack prepared hooks).
 * Never `git commit --no-verify` / `git push --no-verify` (Rule 29).
 */
import fs from "node:fs";
import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = "money-pr-local-gate";

/** Ordered fail-fast suite — same classes that red'd Cursor #4009–#4011 / #4198 vs Claude. */
const STEPS = [
  ["verify-definition-of-done-evidence", "scripts/verify-definition-of-done-evidence.mjs"],
  ["verify-no-money-theater", "scripts/verify-no-money-theater.mjs"],
  // Rule 26 — block parallel scoreboard-hotfile PRs before push (SKIP-PASS without gh token).
  ["verify-no-parallel-scoreboard-prs", "scripts/verify-no-parallel-scoreboard-prs.mjs"],
  // §7 palette — financial + nonfinancial (Cursor #4198 burned build-typecheck on amber banner).
  ["verify-section7-palette-financial", "scripts/verify-section7-palette-financial.mjs"],
  ["verify-section7-palette-nonfinancial", "scripts/verify-section7-palette-nonfinancial.mjs"],
  // CodeQL js/missing-rate-limiting on new auth routes (Cursor #4198).
  ["verify-new-auth-routes-rate-limited", "scripts/verify-new-auth-routes-rate-limited.mjs"],
  // CLS-ROUTE-STUB-ARITY — paired with the rate-limit guard above ON PURPOSE: that guard converts
  // routes to app.get(path, options, handler), which is exactly what kills a test stub that captured
  // the handler positionally (2 files went red on 2026-08-06). Shrink-only.
  ["verify-route-stub-handler-arity", "scripts/verify-route-stub-handler-arity.mjs"],
  // Cursor HH 12–23 / Claude HH 00–11 — #4009 burned a full typecheck on HH=00.
  ["verify-migration-lane-band", "scripts/verify-migration-lane-band.mjs"],
  // Cursor EVEN / Claude ODD — #4010 claimed 1900 then 1985 (odd) before 1986.
  ["verify-verify-step-lane-band", "scripts/verify-verify-step-lane-band.mjs"],
  // TOOL-F03 — filename is the claim; feature PRs must not edit CLAIMED-NUMBERS.json (#4010).
  ["verify-no-claimed-numbers-edits", "scripts/verify-no-claimed-numbers-edits.mjs"],
  // Rule 25/37 — number must already be on origin/main before authoring verify-steps/NNNN-*.mjs
  // (#4421–#4455 class: opened feature PRs before claim-reserve merged).
  ["verify-verify-step-claimed-on-main", "scripts/verify-verify-step-claimed-on-main.mjs"],
  // TOOL-F04 — data-mutating migrations need REHEARSED: in a branch commit (#4009).
  ["verify-data-migrations-rehearsed", "scripts/verify-data-migrations-rehearsed.mjs"],
  // EntityLink adoption ratchet — #4010 FactoringHome AST shift + bare UUID (~1.5s).
  ["verify-entity-link-adoption", "scripts/verify-entity-link-adoption.mjs"],
  // Rule 30 — soft-reset onto newer main deleted other PRs' verify-steps (2026-08-02).
  ["verify-no-guard-file-deletion", "scripts/verify-no-guard-file-deletion.mjs"],
  // Rule 30 — tip commit LIVE PROOF must be Claude-green (not "UNVERIFIED browser" theater).
  ["verify-claude-green-evidence-shape", "scripts/verify-claude-green-evidence-shape.mjs"],

  // ── GLOBAL FE COMPONENT STANDARDS (added 2026-08-05, CC-3) ──────────────────────────────────
  // WHY: this gate covered money/DoD/palette/EntityLink but NOT the shared-component ratchets, so a
  // screens-lane PR could pass every local check and still red CI. It cost #4484 two full CI cycles
  // in a row — locked-guards on verify:money-fields-use-moneyinput (raw <input> for principal), then
  // build-typecheck at step 99/1393 on no-raw-date-input (5m37s) for <input type="date">. Each was a
  // one-line component swap that a 0.1s local scan catches.
  //
  // SCOPE: only the GLOBAL ratchets — these scan all of apps/frontend/src, so ANY new FE file can
  // trip them. The ~100 per-page `*-uses-paritytable` guards are deliberately NOT here: they only
  // fire when you touch their specific page, and running them all would make the gate slow enough to
  // be skipped, which is how a gate dies. Combined cost of the five below is ~0.5s.
  // NOTE: the meta-guard that ASSERTS this list mirrors CI ships separately under claim 2632 —
  // verify:guard-wired requires every guard script to be wired into package.json + CI, which needs a
  // claimed verify-step number (Rule 37). Until it lands, this list is hand-maintained; the entries
  // below are the empirically-burned set.
  // META: asserts the FE list below still mirrors what CI runs. Hand-maintained mirrors rot — the
  // first version of this list missed verify-referenceselect-coverage-ratchet (invoked via `npm run`,
  // not `node`) and #4484 burned a cycle on it. Wired into CI as verify-step 2632.
  ["verify-local-gate-covers-fe-ratchets", "scripts/verify-local-gate-covers-fe-ratchets.mjs"],
  ["verify-no-raw-date-input", "scripts/verify-no-raw-date-input.mjs"],
  ["verify-no-native-datetime-input", "scripts/verify-no-native-datetime-input.mjs"],
  ["verify-combobox-outside-dismiss", "scripts/verify-combobox-outside-dismiss.mjs"],
  ["verify-money-fields-use-moneyinput", "scripts/verify-money-fields-use-moneyinput.mjs"],
  ["verify-referenceselect-qbo-standard", "scripts/verify-referenceselect-qbo-standard.mjs"],
  ["verify-referenceselect-coverage-ratchet", "scripts/verify-referenceselect-coverage-ratchet.mjs"],
  ["verify-no-internal-language-in-prod-ui", "scripts/verify-no-internal-language-in-prod-ui.mjs"],
];

function runNode(rel) {
  const script = path.join(ROOT, rel);
  console.log(`[${LABEL}] RUN ${rel}`);
  const res = spawnSync(process.execPath, [script], {
    cwd: ROOT,
    encoding: "utf8",
    env: process.env,
  });
  const out = `${res.stdout ?? ""}${res.stderr ?? ""}`.trim();
  if (out) console.log(out);
  return res.status ?? 1;
}

if (process.argv.includes("--selftest")) {
  // Structural selftest only — behavioral coverage lives in verify-money-pr-local-gate.
  for (const [, rel] of STEPS) {
    if (!fs.existsSync(path.join(ROOT, rel))) {
      console.error(`${LABEL} --selftest FAIL: missing ${rel}`);
      process.exit(1);
    }
  }
  console.log(`${LABEL} --selftest PASS`);
  process.exit(0);
}

for (const [name, rel] of STEPS) {
  const code = runNode(rel);
  if (code !== 0) {
    console.error(
      `\n${LABEL}: FAIL — ${name} rejected this branch BEFORE push.\n` +
        `Fix the commit message / MODULE_PROGRESS / FINDING / lane band / CLAIMED / EntityLink baseline, then:\n` +
        `  node scripts/money-pr-local-gate.mjs\n` +
        `Then ONE push (hooks ON — never --no-verify). Do not rebase while CI is running (Rule 25 / Rule 29).\n`,
    );
    process.exit(code);
  }
}

console.log(
  `${LABEL}: PASS — DoD + money-theater + scoreboard serialize + §7 palette (fin+nonfin) + auth rateLimit + migration band + verify-step band + no-CLAIMED-edits + EntityLink + Rule 30 (no guard deletion + Claude-green LIVE PROOF) OK (fail-fast before CI)`,
);
process.exit(0);
