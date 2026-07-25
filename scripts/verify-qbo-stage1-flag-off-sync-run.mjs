#!/usr/bin/env node
/**
 * verify-qbo-stage1-flag-off-sync-run — Stage-1 pull flag OFF must write a durable
 * qbo.sync_runs row (status=cancelled, reason=flag_disabled). Bare early-return with
 * no audit makes OFF look identical to a dead cron (false silence).
 *
 * Rule 17: verify-step only — do not edit package.json / locked-guards / ci.yml.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = process.env.VERIFY_QBO_FLAG_OFF_ROOT
  ? path.resolve(process.env.VERIFY_QBO_FLAG_OFF_ROOT)
  : path.resolve(__dirname, "..");

const LABEL = "verify-qbo-stage1-flag-off-sync-run";
const HELPER_REL = "apps/backend/src/qbo-sync/record-flag-disabled-sync-run.ts";

const PULLERS = [
  "apps/backend/src/qbo-sync/ap-bills-puller.ts",
  "apps/backend/src/qbo-sync/ap-bill-payments-puller.ts",
  "apps/backend/src/qbo-sync/qbo-purchases-puller.ts",
  "apps/backend/src/qbo-sync/qbo-ar-payments-puller.ts",
];

/** Extract the Stage-1 pull function body (pull*FromQbo). */
export function extractStage1PullBody(src) {
  const m = src.match(/export async function pull\w+FromQbo\([\s\S]*?\n\}/);
  return m ? m[0] : "";
}

export function analyzeHelper(text) {
  const failures = [];
  if (!/status\s*=\s*['"]cancelled['"]|'cancelled'/.test(text) && !text.includes("'cancelled'")) {
    failures.push(`${HELPER_REL}: must INSERT status='cancelled' (not success/skipped)`);
  }
  if (!text.includes("flag_disabled")) {
    failures.push(`${HELPER_REL}: payload must include reason flag_disabled`);
  }
  if (!/INSERT\s+INTO\s+qbo\.sync_runs/i.test(text)) {
    failures.push(`${HELPER_REL}: must INSERT INTO qbo.sync_runs`);
  }
  if (/\bsuccess\b/.test(text) && /status.*success/.test(text)) {
    failures.push(`${HELPER_REL}: must not use status=success for flag-disabled (looks healthy)`);
  }
  return failures;
}

export function analyzePuller(rel, text) {
  const failures = [];
  const body = extractStage1PullBody(text);
  if (!body) {
    failures.push(`${rel}: could not find pull*FromQbo Stage-1 function`);
    return failures;
  }
  if (!/if\s*\(\s*!enabled\s*\)/.test(body)) {
    failures.push(`${rel}: Stage-1 missing if (!enabled) gate`);
    return failures;
  }
  // Between !enabled and return, must call the shared helper (or insert cancelled sync_run).
  const offChunk = body.split(/if\s*\(\s*!enabled\s*\)/)[1] ?? "";
  const beforeReturn = offChunk.split(/return\s*\{/)[0] ?? "";
  const hasHelper = /recordFlagDisabledMirrorSyncRun\s*\(/.test(beforeReturn);
  const hasInline =
    /INSERT\s+INTO\s+qbo\.sync_runs/i.test(beforeReturn) && /cancelled/.test(beforeReturn);
  if (!hasHelper && !hasInline) {
    failures.push(
      `${rel}: Stage-1 flag-OFF path returns without writing qbo.sync_runs ` +
        `(false silence — call recordFlagDisabledMirrorSyncRun before return)`
    );
  }
  if (!text.includes("record-flag-disabled-sync-run") && !hasInline) {
    failures.push(`${rel}: must import record-flag-disabled-sync-run helper`);
  }
  return failures;
}

function selftest() {
  const goodHelper = `
    INSERT INTO qbo.sync_runs (..., status, ...) VALUES ($1, $2, 'cancelled', now(), now(), 0, $3::jsonb)
    reason: "flag_disabled"
  `;
  const badHelper = `INSERT INTO qbo.sync_runs VALUES (... 'success' ...)`;
  if (analyzeHelper(goodHelper).length) throw new Error("selftest: good helper should pass");
  if (!analyzeHelper(badHelper).length) throw new Error("selftest: bad helper should fail");

  const goodPuller = `
import { recordFlagDisabledMirrorSyncRun } from "./record-flag-disabled-sync-run.js";
export async function pullPurchasesFromQbo(operatingCompanyId: string) {
  const enabled = await isEnabled(...);
  if (!enabled) {
    await recordFlagDisabledMirrorSyncRun({ operatingCompanyId, kind: "k", flagKey: "F", mirrorTable: "m" });
    return { enabled: false, rowsPulled: 0, rowsUpserted: 0, pulledAt };
  }
  const runId = await beginPurchasesMirrorSyncRun(operatingCompanyId);
}
`;
  const badPuller = `
export async function pullPurchasesFromQbo(operatingCompanyId: string) {
  const enabled = await isEnabled(...);
  if (!enabled) {
    return { enabled: false, rowsPulled: 0, rowsUpserted: 0, pulledAt };
  }
}
`;
  if (analyzePuller("good.ts", goodPuller).length) throw new Error("selftest: good puller should pass");
  if (!analyzePuller("bad.ts", badPuller).length) throw new Error("selftest: bad puller should fail");
  console.log(`${LABEL} --selftest: PASS`);
}

function main() {
  if (process.argv.includes("--selftest")) {
    selftest();
    return;
  }
  const failures = [];
  const helperPath = path.join(ROOT, HELPER_REL);
  if (!fs.existsSync(helperPath)) {
    failures.push(`${HELPER_REL}: missing`);
  } else {
    failures.push(...analyzeHelper(fs.readFileSync(helperPath, "utf8")));
  }
  for (const rel of PULLERS) {
    const p = path.join(ROOT, rel);
    if (!fs.existsSync(p)) {
      failures.push(`${rel}: missing`);
      continue;
    }
    failures.push(...analyzePuller(rel, fs.readFileSync(p, "utf8")));
  }
  if (failures.length) {
    console.error(`${LABEL}: FAIL`);
    for (const f of failures) console.error(`  - ${f}`);
    process.exit(1);
  }
  console.log(`${LABEL}: PASS`);
}

main();
