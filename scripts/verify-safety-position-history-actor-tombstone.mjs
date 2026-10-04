#!/usr/bin/env node
/**
 * LV-SAFETY-POSITION-HISTORY-ACTOR-TOMBSTONE
 * PositionHistoryPage Actor cell must gate EntityLink with isUnresolvedEntityTombstone
 * and render noninteractive tombstone for unresolved actors.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const TARGET = path.join(ROOT, "apps/frontend/src/pages/safety/PositionHistoryPage.tsx");

class GuardFail extends Error {}

function fail(msg) {
  throw new GuardFail(msg);
}

function assertSource(src) {
  if (!src.includes("isUnresolvedEntityTombstone")) {
    fail("PositionHistoryPage must import/use isUnresolvedEntityTombstone");
  }
  if (!src.includes("position-history-actor-tombstone")) {
    fail("missing data-testid=position-history-actor-tombstone");
  }
  const actorIdx = src.indexOf("actor_id");
  if (actorIdx < 0) fail("actor_id render missing");
  const slice = src.slice(actorIdx, actorIdx + 1200);
  if (!slice.includes("isUnresolvedEntityTombstone")) {
    fail("actor render must call isUnresolvedEntityTombstone");
  }
  if (!slice.includes("EntityLink")) {
    fail("resolved path must still use EntityLink");
  }
  if (!slice.includes('kind="user"') && !slice.includes("kind='user'")) {
    fail("expected EntityLink kind=user for resolved actors");
  }
}

function selftest() {
  const good = fs.readFileSync(TARGET, "utf8");
  assertSource(good);
    const bad = good
    .replaceAll("isUnresolvedEntityTombstone", "NEVER_TOMBSTONE")
    .replaceAll("position-history-actor-tombstone", "gone");
  // Pure check on the planted string -- no tracked file is written.
  let detected = false;
  try {
    assertSource(bad);
  } catch (err) {
    if (!(err instanceof GuardFail)) throw err;
    detected = true;
  }
  if (!detected) {
    fail("--selftest: mutated source still passed (guard not mutation-proven)");
  }
  console.log("PASS: verify-safety-position-history-actor-tombstone --selftest");
}

try {
  if (process.argv.includes("--selftest")) {
    selftest();
  } else {
    assertSource(fs.readFileSync(TARGET, "utf8"));
    console.log("PASS: verify-safety-position-history-actor-tombstone");
  }
} catch (err) {
  if (!(err instanceof GuardFail)) throw err;
  console.error(`FAIL: ${err.message}`);
  process.exit(1);
}
