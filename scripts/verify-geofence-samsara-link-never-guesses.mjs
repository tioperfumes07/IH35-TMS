#!/usr/bin/env node
/**
 * ROUND 304 T-46 — GUARD. "NEVER guess a match. Two fences within X metres AND a name match is a
 * match; one signal alone is a PROPOSAL a human accepts."
 *
 * FAILS IF geofence-address-link.service.ts:
 *   1. auto-links on fewer than two signals, or without uniqueness in both directions;
 *   2. can apply (write production) without an AUTH-NNN id;
 *   3. ever INSERTs a geo.geofences row (this engine links existing fences, never creates one);
 *   4. treats shared words as identity (city/state names made 538 false hits on the first run).
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(fileURLToPath(import.meta.url), "..", "..");
const FILE = resolve(ROOT, "apps/backend/src/integrations/samsara/geofences/geofence-address-link.service.ts");

export function check(src) {
  const p = [];
  if (!/signals\.length\s*===\s*2/.test(src)) p.push("auto-match no longer requires BOTH signals.");
  if (!/strongPerFence\.get\([^)]*\)\s*===\s*1\s*&&\s*strongPerAddress\.get\([^)]*\)\s*===\s*1/.test(src)) p.push("auto-match no longer requires uniqueness in both directions.");
  if (!/\^AUTH-\\d\+\$/.test(src)) p.push("apply no longer requires an AUTH-NNN id.");
  if (/INSERT\s+INTO\s+geo\.geofences/i.test(src)) p.push("the link engine INSERTs geo.geofences -- it must only link existing fences.");
  if (/shared\s*\/\s*Math\.min/.test(src)) p.push("word-overlap identity is back -- shared words are not identity.");
  return p;
}

function selftest() {
  const good = `const strong = c.filter((x) => x.signals.length === 2);
    const m = strong.filter((c) => strongPerFence.get(c.fence_id) === 1 && strongPerAddress.get(c.samsara_address_id) === 1);
    if (!/^AUTH-\\d+$/.test(id)) throw 1; UPDATE geo.geofences SET`;
  const cases = [
    [good, false],
    [good.replace("=== 2", ">= 1"), true],
    [good.replace("AUTH-", "XXXX-"), true],
    [good + " INSERT INTO geo.geofences (", true],
    [good + " return shared / Math.min(a, b) >= 0.5;", true],
  ];
  return cases.every(([s, wantFail], i) => {
    const ok = (check(s).length > 0) === wantFail;
    if (!ok) console.error(`SELFTEST FAIL case ${i}: ${JSON.stringify(check(s))}`);
    return ok;
  });
}

if (import.meta.url === `file://${process.argv[1]}`) {
  if (process.argv.includes("--selftest")) {
    const ok = selftest();
    console.log(`verify-geofence-samsara-link-never-guesses selftest ${ok ? "PASS" : "FAIL"}`);
    process.exit(ok ? 0 : 1);
  }
  const p = check(readFileSync(FILE, "utf8"));
  console.log(p.length ? `verify-geofence-samsara-link-never-guesses FAILED:\n  - ${p.join("\n  - ")}` : "verify-geofence-samsara-link-never-guesses: OK -- two signals + uniqueness to auto-link, AUTH to apply, never creates a fence.");
  process.exit(p.length ? 1 : 0);
}
