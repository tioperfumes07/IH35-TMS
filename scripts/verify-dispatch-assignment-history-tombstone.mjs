#!/usr/bin/env node
/**
 * LV-DISPATCH-ASSIGNMENT-HISTORY-TOMBSTONE
 * AssignmentHistoryPage EntityLinks must gate unresolved labels with isUnresolvedEntityTombstone.
 */
import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const TARGET = path.join(ROOT, "apps/frontend/src/pages/dispatch/AssignmentHistoryPage.tsx");
const SELF = path.join(ROOT, "scripts/verify-dispatch-assignment-history-tombstone.mjs");

function fail(msg) {
  console.error(`FAIL: ${msg}`);
  process.exit(1);
}

function assertSource(src) {
  if (!src.includes("isUnresolvedEntityTombstone")) {
    fail("AssignmentHistoryPage must use isUnresolvedEntityTombstone");
  }
  for (const id of [
    "assignment-history-load-tombstone",
    "assignment-history-prev-driver-tombstone",
    "assignment-history-new-driver-tombstone",
    "assignment-history-prev-unit-tombstone",
    "assignment-history-new-unit-tombstone",
  ]) {
    if (!src.includes(id)) fail(`missing data-testid=${id}`);
  }
  if (!src.includes("EntityLink")) fail("resolved path must still use EntityLink");
}

function selftest() {
  const good = fs.readFileSync(TARGET, "utf8");
  assertSource(good);
  const backup = good;
  const bad = good
    .replaceAll("isUnresolvedEntityTombstone", "NEVER_TOMBSTONE")
    .replaceAll("assignment-history-load-tombstone", "gone");
  fs.writeFileSync(TARGET, bad);
  try {
    const r = spawnSync(process.execPath, [SELF], { encoding: "utf8" });
    if (r.status === 0) fail("--selftest: mutated source still passed");
  } finally {
    fs.writeFileSync(TARGET, backup);
  }
  console.log("PASS: verify-dispatch-assignment-history-tombstone --selftest");
}

if (process.argv.includes("--selftest")) selftest();
else {
  assertSource(fs.readFileSync(TARGET, "utf8"));
  console.log("PASS: verify-dispatch-assignment-history-tombstone");
}
