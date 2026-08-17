#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const TARGET = path.join(ROOT, "apps/frontend/src/pages/dispatch/LateArrivalsPage.tsx");
const SELF = path.join(ROOT, "scripts/verify-dispatch-late-arrivals-tombstone.mjs");

function fail(msg) {
  console.error(`FAIL: ${msg}`);
  process.exit(1);
}

function assertSource(src) {
  if (!src.includes("isUnresolvedEntityTombstone")) fail("must use isUnresolvedEntityTombstone");
  for (const id of [
    "late-arrival-load-tombstone",
    "late-arrival-customer-tombstone",
    "late-arrival-driver-tombstone",
    "late-arrival-unit-tombstone",
  ]) {
    if (!src.includes(id)) fail(`missing ${id}`);
  }
  if (!src.includes("EntityLink")) fail("must retain EntityLink");
}

function selftest() {
  const good = fs.readFileSync(TARGET, "utf8");
  assertSource(good);
  const backup = good;
  fs.writeFileSync(
    TARGET,
    good.replaceAll("isUnresolvedEntityTombstone", "X").replaceAll("late-arrival-load-tombstone", "gone"),
  );
  try {
    const r = spawnSync(process.execPath, [SELF], { encoding: "utf8" });
    if (r.status === 0) fail("mutated still passed");
  } finally {
    fs.writeFileSync(TARGET, backup);
  }
  console.log("PASS: verify-dispatch-late-arrivals-tombstone --selftest");
}

if (process.argv.includes("--selftest")) selftest();
else {
  assertSource(fs.readFileSync(TARGET, "utf8"));
  console.log("PASS: verify-dispatch-late-arrivals-tombstone");
}
