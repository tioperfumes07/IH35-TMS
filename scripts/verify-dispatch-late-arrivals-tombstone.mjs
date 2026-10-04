#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const TARGET = path.join(ROOT, "apps/frontend/src/pages/dispatch/LateArrivalsPage.tsx");

function fail(msg) {
  console.error(`FAIL: ${msg}`);
  process.exit(1);
}

function checkSource(src) {
  if (!src.includes("isUnresolvedEntityTombstone")) return "must use isUnresolvedEntityTombstone";
  for (const id of [
    "late-arrival-load-tombstone",
    "late-arrival-customer-tombstone",
    "late-arrival-driver-tombstone",
    "late-arrival-unit-tombstone",
  ]) {
    if (!src.includes(id)) return `missing ${id}`;
  }
  if (!src.includes("EntityLink")) return "must retain EntityLink";
  return null;
}

function assertSource(src) {
  const msg = checkSource(src);
  if (msg) fail(msg);
}

function selftest() {
  const good = fs.readFileSync(TARGET, "utf8");
  assertSource(good);
  // Pure: the planted text is checked in memory; no file is written.
  const mutated = good.replaceAll("isUnresolvedEntityTombstone", "X").replaceAll("late-arrival-load-tombstone", "gone");
  if (checkSource(mutated) === null) fail("mutated still passed");
  console.log("PASS: verify-dispatch-late-arrivals-tombstone --selftest");
}

if (process.argv.includes("--selftest")) selftest();
else {
  assertSource(fs.readFileSync(TARGET, "utf8"));
  console.log("PASS: verify-dispatch-late-arrivals-tombstone");
}
