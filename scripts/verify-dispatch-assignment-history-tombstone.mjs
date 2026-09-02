#!/usr/bin/env node
/**
 * LV-DISPATCH-ASSIGNMENT-HISTORY-TOMBSTONE
 * AssignmentHistoryPage EntityLinks must gate unresolved labels with isUnresolvedEntityTombstone.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const TARGET = path.join(ROOT, "apps/frontend/src/pages/dispatch/AssignmentHistoryPage.tsx");

function fail(msg) {
  console.error(`FAIL: ${msg}`);
  process.exit(1);
}

function sourceProblems(src) {
  const problems = [];
  if (!src.includes("isUnresolvedEntityTombstone")) {
    problems.push("AssignmentHistoryPage must use isUnresolvedEntityTombstone");
  }
  for (const id of [
    "assignment-history-load-tombstone",
    "assignment-history-prev-driver-tombstone",
    "assignment-history-new-driver-tombstone",
    "assignment-history-prev-unit-tombstone",
    "assignment-history-new-unit-tombstone",
  ]) {
    if (!src.includes(id)) problems.push(`missing data-testid=${id}`);
  }
  if (!src.includes("EntityLink")) problems.push("resolved path must still use EntityLink");
  return problems;
}

function assertSource(src) {
  const problems = sourceProblems(src);
  if (problems.length) fail(problems.join("; "));
}

function selftest() {
  const good = fs.readFileSync(TARGET, "utf8");
  assertSource(good);
  const bad = good
    .replaceAll("isUnresolvedEntityTombstone", "NEVER_TOMBSTONE")
    .replaceAll("assignment-history-load-tombstone", "gone");
  const planted = sourceProblems(bad);
  if (!planted.some((problem) => problem.includes("isUnresolvedEntityTombstone"))) {
    fail("--selftest: missing tombstone helper mutation was not rejected");
  }
  if (!planted.some((problem) => problem.includes("assignment-history-load-tombstone"))) {
    fail("--selftest: missing load tombstone test id mutation was not rejected");
  }
  console.log("PASS: verify-dispatch-assignment-history-tombstone --selftest");
}

if (process.argv.includes("--selftest")) selftest();
else {
  assertSource(fs.readFileSync(TARGET, "utf8"));
  console.log("PASS: verify-dispatch-assignment-history-tombstone");
}
