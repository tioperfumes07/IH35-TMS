#!/usr/bin/env node
/**
 * AR-TIEOUT-POSTED-WITHOUT-POSTING-RECURRENCE
 *
 * Delivery must invoke the canonical two-event poster in economic order after commit: Event 1
 * (earn) before Event 2 (bill). Invoice send may attempt Event 2 earlier, but that attempt can
 * correctly no-op while Event 1 is absent. This guard prevents delivery from leaving the invoice
 * permanently sent without its invoice-tagged A/R posting.
 */
import fs from "node:fs";

const FILE = "apps/backend/src/dispatch/delivery-evidence-latch.ts";
const SELFTEST = process.argv.includes("--selftest");

function inspect(source) {
  const functionStart = source.indexOf("async function firePostLoadRevenueLatch");
  const functionEnd = source.indexOf("\n}\n", functionStart);
  if (functionStart < 0 || functionEnd < 0) {
    return ["shared after-commit delivery latch function is missing"];
  }
  const body = source.slice(functionStart, functionEnd);
  const earn = body.indexOf('target_status: "delivered_pending_docs"');
  const bill = body.indexOf('target_status: "completed_docs_received"');
  const problems = [];
  if (earn < 0) problems.push("delivery task does not call canonical Event 1 (earn)");
  if (bill < 0) problems.push("delivery task does not call canonical Event 2 (bill)");
  if (earn >= 0 && bill >= 0 && earn >= bill) {
    problems.push("delivery task does not run earn before bill");
  }
  const calls = body.match(/await postLoadRevenueLatch\s*\(/g) ?? [];
  if (calls.length !== 2) {
    problems.push(`delivery task must make exactly two canonical poster calls; found ${calls.length}`);
  }
  if (!body.includes("entryDateIso") || !body.includes("actor_user_id: input.actorUserId")) {
    problems.push("two-event calls do not preserve shared date/actor attribution");
  }
  return problems;
}

const source = fs.readFileSync(FILE, "utf8");
const problems = inspect(source);
if (problems.length) {
  console.error(`FAIL verify-ar-tieout-delivery-latch-order: ${problems.join("; ")}`);
  process.exit(1);
}

if (SELFTEST) {
  const planted = source.replace(
    'target_status: "completed_docs_received"',
    'target_status: "delivered_pending_docs"'
  );
  const plantedProblems = inspect(planted);
  if (!plantedProblems.some((problem) => problem.includes("Event 2"))) {
    console.error("FAIL --selftest: planted missing Event-2 call was not detected");
    process.exit(1);
  }
  console.log("PASS --selftest: planted missing Event-2 call detected");
}

console.log("PASS verify-ar-tieout-delivery-latch-order: earn -> bill uses the canonical poster");
