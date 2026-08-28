#!/usr/bin/env node
// ELD-UNIDENTIFIED-STALE-FIX-NO-RECENCY-CHECK
//
// apps/frontend/src/api/eld.ts's isUnidentifiedDrivingRow() flags a unit as "Unidentified Driving"
// purely from a frozen speed/engine snapshot (driver_id null + speed>0 or engine on/idle) with NO
// check on data recency. The backend (fleet-location-hos.service.ts, STALE_AFTER_MIN=60) already
// computes `stale: boolean` per row, but the frontend filter never consulted it — so a unit with a
// last fix from months ago, frozen mid-"moving", rendered as an active safety alert forever.
//
// This guard statically asserts isUnidentifiedDrivingRow's source contains a `row.stale` short-circuit
// BEFORE the moving/engine-active check, so a stale row can never pass the filter.
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const TARGET = path.join(__dirname, "..", "apps/frontend/src/api/eld.ts");

function extractFn(src) {
  const start = src.indexOf("export function isUnidentifiedDrivingRow");
  if (start === -1) return null;
  const end = src.indexOf("\n}", start);
  if (end === -1) return null;
  return src.slice(start, end + 2);
}

function check(src) {
  const fn = extractFn(src);
  if (!fn) return { ok: false, reason: "isUnidentifiedDrivingRow not found" };
  const staleIdx = fn.indexOf("row.stale");
  if (staleIdx === -1) return { ok: false, reason: "no row.stale check present" };
  const movingIdx = fn.search(/moving\s*\|\|\s*engineActive/);
  if (movingIdx !== -1 && staleIdx > movingIdx) {
    return { ok: false, reason: "row.stale check present but AFTER the moving/engine-active decision (too late)" };
  }
  // must actually gate the result -- a `return false` on stale, before the final decision
  const staleLine = fn.slice(staleIdx - 40, staleIdx + 40);
  if (!/return\s+false/.test(fn.slice(staleIdx, staleIdx + 60))) {
    return { ok: false, reason: `row.stale present but doesn't short-circuit to false near it: ${staleLine}` };
  }
  return { ok: true };
}

function selftest() {
  const REGRESSED = `
export function isUnidentifiedDrivingRow(row) {
  if (row.driver_id) return false;
  const speed = row.speed_mph == null ? null : Number(row.speed_mph);
  const moving = speed != null && Number.isFinite(speed) && speed > 0;
  const engine = (row.engine_state ?? "").toLowerCase();
  const engineActive = engine === "on" || engine === "idle";
  return moving || engineActive;
}
`;
  const r1 = check(REGRESSED);
  if (r1.ok) throw new Error("selftest FAILED to catch the original no-stale-check regression");

  const FIXED = `
export function isUnidentifiedDrivingRow(row) {
  if (row.driver_id) return false;
  if (row.stale) return false;
  const speed = row.speed_mph == null ? null : Number(row.speed_mph);
  const moving = speed != null && Number.isFinite(speed) && speed > 0;
  const engine = (row.engine_state ?? "").toLowerCase();
  const engineActive = engine === "on" || engine === "idle";
  return moving || engineActive;
}
`;
  const r2 = check(FIXED);
  if (!r2.ok) throw new Error("selftest FAILED to accept the real fix shape: " + r2.reason);

  const TOO_LATE = `
export function isUnidentifiedDrivingRow(row) {
  if (row.driver_id) return false;
  const speed = row.speed_mph == null ? null : Number(row.speed_mph);
  const moving = speed != null && Number.isFinite(speed) && speed > 0;
  const engine = (row.engine_state ?? "").toLowerCase();
  const engineActive = engine === "on" || engine === "idle";
  const result = moving || engineActive;
  if (row.stale) return false;
  return result;
}
`;
  const r3 = check(TOO_LATE);
  if (r3.ok) throw new Error("selftest FAILED to catch a stale check placed after the moving/engineActive decision");

  console.log("  selftest: OK (regression caught, fix accepted, too-late placement caught)");
}

const isSelftest = process.argv.includes("--selftest");
selftest();
if (isSelftest) {
  console.log("PASS (selftest only)");
  process.exit(0);
}

let src;
try {
  src = readFileSync(TARGET, "utf8");
} catch (err) {
  console.error(`FAIL(gated): cannot read ${TARGET}: ${err.message}`);
  process.exit(1);
}

const result = check(src);
if (!result.ok) {
  console.error(`FAIL(gated): eld.ts isUnidentifiedDrivingRow does not respect row.stale — ${result.reason}`);
  process.exit(1);
}

console.log("PASS: isUnidentifiedDrivingRow short-circuits to false on row.stale before the moving/engine-active decision");
process.exit(0);
