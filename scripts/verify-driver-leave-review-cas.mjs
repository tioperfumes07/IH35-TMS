#!/usr/bin/env node
import fs from "node:fs";

const servicePath = new URL("../apps/backend/src/safety/driver-scheduler.service.ts", import.meta.url);
const source = fs.readFileSync(servicePath, "utf8");

function verify(text) {
  const failures = [];
  const review = text.slice(text.indexOf("export async function reviewLeaveRequest"), text.indexOf("export async function", text.indexOf("export async function reviewLeaveRequest") + 1));
  const lifecyclePredicates = review.match(/AND status = 'pending_review'\s+AND voided_at IS NULL/g) ?? [];
  if (lifecyclePredicates.length !== 3) failures.push("all deny/defer/approve writes must repeat pending and active lifecycle state");
  const lostRaceChecks = review.match(/const (?:row|updated) = (?:res|upd)\.rows\[0\];\s+if \(!(?:row|updated)\) return \{ error: "leave_request_not_pending" as const \};/g) ?? [];
  if (lostRaceChecks.length !== 3) failures.push("all review actions must return the declared conflict before audit, outbox, or leave-day writes");
  if (!/const updated = upd\.rows\[0\];\s+if \(!updated\)[^]*?for \(const d of dayList\)/m.test(review)) failures.push("approval must stop before creating leave days when its compare-and-swap loses");
  return failures;
}

const failures = verify(source);
if (process.argv.includes("--selftest")) {
  const reviewStart = source.indexOf("export async function reviewLeaveRequest");
  const mutateReview = (before, after) => source.slice(0, reviewStart) + source.slice(reviewStart).replace(before, after);
  const mutations = [
    mutateReview("AND status = 'pending_review'", "AND true"),
    mutateReview("AND voided_at IS NULL", "AND true"),
    mutateReview('if (!row) return { error: "leave_request_not_pending" as const };', "if (false) return { error: \"leave_request_not_pending\" as const };"),
    mutateReview('if (!updated) return { error: "leave_request_not_pending" as const };', "if (false) return { error: \"leave_request_not_pending\" as const };"),
  ];
  const escaped = mutations.filter((mutation) => verify(mutation).length === 0);
  if (escaped.length) {
    console.error(`FAIL driver leave review CAS selftest: ${escaped.length} mutation(s) escaped`);
    process.exit(1);
  }
  console.log(`PASS driver leave review CAS selftest (${mutations.length} mutations rejected)`);
  process.exit(0);
}
if (failures.length) {
  failures.forEach((failure) => console.error(`FAIL ${failure}`));
  process.exit(1);
}
console.log("PASS driver leave review actions are active pending-state compare-and-swaps");
