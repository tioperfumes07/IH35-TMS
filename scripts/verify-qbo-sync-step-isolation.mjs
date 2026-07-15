#!/usr/bin/env node
// B-A2 GUARD — the QBO sync scheduler must keep per-STEP + per-COMPANY error isolation and NO silent swallow,
// and the owner-only manual trigger must stay owner-gated. Root cause of "A/P bills = $0 while QBO live + flags
// ON": bare sequential awaits meant one earlier step (COA/Items) throwing aborted the whole tick before A/P ran,
// swallowed into Sentry. This guard fails if the isolation regresses.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const SCHED = "apps/backend/src/qbo-sync/sync-scheduler.ts";
const ROUTE = "apps/backend/src/qbo-sync/drift-dashboard.routes.ts";

export function run() {
  const failures = [];
  const read = (p) => { try { return fs.readFileSync(p, "utf8"); } catch { failures.push(`missing file: ${p}`); return ""; } };
  const s = read(SCHED);
  const r = read(ROUTE);

  // Scheduler isolation
  if (!/function runStep\(/.test(s)) failures.push(`${SCHED}: missing runStep() isolation helper`);
  if (!/runStep\("ap_bills_pull"/.test(s)) failures.push(`${SCHED}: A/P pull must run inside runStep() (isolated, must run even if an earlier step failed)`);
  if (!/runStep\("ap_bills_project"/.test(s)) failures.push(`${SCHED}: A/P projection must run inside runStep()`);
  // A bare `await pullApBillsFromQbo(...)` NOT wrapped in runStep would re-introduce the abort bug.
  if (/await\s+pullApBillsFromQbo\(/.test(s)) failures.push(`${SCHED}: bare 'await pullApBillsFromQbo(...)' — A/P must go through runStep(), never a bare await`);
  // No silent swallow: failures must be captured to Sentry.
  if (!/Sentry\.captureException/.test(s)) failures.push(`${SCHED}: caught step failures must be captured to Sentry (no silent swallow)`);
  // Per-company isolation: the company loop must catch so one entity can't block the others.
  if (!/runScheduledSyncForCompany\(company\.id[\s\S]{0,400}?catch/.test(s)) failures.push(`${SCHED}: per-company loop must wrap runScheduledSyncForCompany in try/catch (TRANSP must not block TRK)`);

  // Owner-only idempotent trigger
  if (!/\/api\/v1\/qbo-sync\/trigger/.test(r)) failures.push(`${ROUTE}: missing owner-only manual trigger route /api/v1/qbo-sync/trigger`);
  if (!/role\s*!==\s*"Owner"/.test(r)) failures.push(`${ROUTE}: manual trigger must be OWNER-ONLY (role !== "Owner" -> 403)`);
  if (!/already_running|triggerRunning/.test(r)) failures.push(`${ROUTE}: manual trigger must be single-flight (reject overlapping runs)`);
  return failures;
}

function selfTest() {
  // Sanity: the pure run() shape works on synthetic inputs is covered by the live check; here we just assert
  // the exported run() is callable and returns an array.
  const out = run();
  if (!Array.isArray(out)) { console.error("run() must return an array"); process.exit(1); }
  console.log(`self-test: run() returned ${out.length} finding(s) against the live repo`);
}

function main() {
  if (process.argv.includes("--self-test")) { selfTest(); return; }
  const failures = run();
  if (failures.length) {
    console.error("\nFAIL verify-qbo-sync-step-isolation:");
    failures.forEach((f) => console.error(`  • ${f}`));
    process.exit(1);
  }
  console.log("\nPASS verify-qbo-sync-step-isolation — per-step + per-company isolation, no silent swallow, owner-only single-flight trigger.");
}

// Import-safe: only run as a script (verify:* / --self-test), never when imported by the verify-steps wrapper.
const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) main();
