#!/usr/bin/env node
/**
 * GUARD — CLS-DISP-WIRE-07. Every path that stamps `actual_departure_at` must stamp a REAL time,
 * never a client-supplied value that can arrive null.
 *
 * WHY THE CLASS EXISTS: `actual_departure_at` on the final delivery stop is the delivery EVIDENCE the
 * rest of the money chain hangs off — the wave queue registers WIRE-07 as the "CRITICAL-PATH ROOT
 * BLOCKER" for WIRE-05 (revenue recognition) and WIRE-04 (delivery-evidence invoice gating). If the
 * stamp is missing, a load can reach a delivered status with no evidence it was ever delivered.
 *
 * ★ THE QUEUE'S OWN ROOT CAUSE FOR THIS CLASS IS WRONG, and this guard is written against the real
 * one. The queue says: "reads body.data.delivered_at from the request — if the client doesn't send
 * it, it's NULL." That is not what the code does. `stampFinalActiveDeliveryDeparture` writes
 * `COALESCE($3::timestamptz, now())`, so an absent `delivered_at` falls back to now() and can never
 * be NULL. A builder told to "make the client send delivered_at" would change nothing.
 * Verified live by controlled A/B on prod (2026-08-06, USMCA, deploy e6343f4): two loads, same
 * customer/driver/unit, same day, NEITHER call sending `delivered_at` — the one advanced via
 * `/dispatch/loads/:id/transition` got **1 of 2** stops stamped (correct: only the final active
 * delivery stop), the one advanced via `/mdata/loads/:id/status` got **0 of 2**. The stamp works; the
 * office path simply never reaches it.
 *
 * WHAT THIS ASSERTS, therefore, is the thing that IS checkable statically and would actually catch a
 * regression:
 *   1. `stampFinalActiveDeliveryDeparture` keeps its COALESCE fallback — deleting it would
 *      reintroduce exactly the NULL the queue wrongly believes exists today.
 *   2. Every other site that writes `actual_departure_at` writes a real time (`now()` or a COALESCE
 *      onto now()), never a bare parameter.
 *
 * NOT CLAIMED: this does NOT assert that the office UI reaches the stamp at all. That is the real
 * open defect (the endpoint split, filed as LV-TXN-004/007), it has money side-effects — revrec and
 * settlement fire on the other endpoint — and it belongs to the money lane, not here. A guard cannot
 * paper over a routing decision that has not been made.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = "verify-disp-wire-07-departure-evidence";
const SRC = "apps/backend/src";
const STAMPER = "apps/backend/src/dispatch/stamp-final-delivery-departure.ts";

/**
 * `SET actual_departure_at = <expr>` — capture the assigned expression to END OF LINE, not to the
 * next comma. Splitting on the comma truncated `COALESCE($3::timestamptz, now())` to
 * `COALESCE($3::timestamptz` and the guard then flagged the CORRECT stamper as a defect — caught by
 * this file's own selftest before it ever ran in anger.
 */
const ASSIGN_RE = /actual_departure_at\s*=\s*(.+)$/gim;

/** A real clock value: now(), or COALESCE(..., now()). A bare $n parameter is NOT. */
function isRealTime(expr) {
  const e = expr.trim();
  if (/^now\(\)/i.test(e)) return true;
  if (/^COALESCE\s*\(/i.test(e) && /now\(\)/i.test(e)) return true;
  return false;
}

export function auditSource(src, rel) {
  const problems = [];
  for (const line of src.split("\n")) {
    // Only SQL assignment sites; skip type declarations, SELECT projections and comments.
    if (!/\bSET\b[\s\S]*actual_departure_at\s*=/i.test(line) && !/^\s*SET\s+actual_departure_at/i.test(line)) {
      if (!/actual_departure_at\s*=\s*(?:\$|COALESCE|now\(\))/i.test(line)) continue;
    }
    const t = line.trim();
    if (t.startsWith("*") || t.startsWith("//") || t.startsWith("--")) continue;
    ASSIGN_RE.lastIndex = 0;
    let m;
    while ((m = ASSIGN_RE.exec(line)) !== null) {
      if (!isRealTime(m[1])) {
        problems.push(
          `${rel}: writes actual_departure_at = ${m[1].trim()} — a client-supplied value can arrive ` +
            `null, leaving a delivered load with NO delivery evidence. Use now() or ` +
            `COALESCE($n::timestamptz, now()).`,
        );
      }
    }
  }
  return problems;
}

function walk(dir, out = []) {
  if (!fs.existsSync(dir)) return out;
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) {
      if (e.name !== "node_modules" && e.name !== "dist" && e.name !== "__tests__") walk(p, out);
    } else if (/\.ts$/.test(e.name) && !e.name.includes(".test.")) out.push(p);
  }
  return out;
}

if (process.argv.includes("--selftest")) {
  const cases = [
    ["now() is a real stamp", `SET actual_departure_at = now(),`, 0],
    ["COALESCE onto now() is a real stamp", `SET actual_departure_at = COALESCE($3::timestamptz, now()),`, 0],
    ["a BARE parameter can arrive null", `SET actual_departure_at = $2::timestamptz,`, 1],
    ["COALESCE WITHOUT now() still can be null", `SET actual_departure_at = COALESCE($2, $3),`, 1],
    ["a comment describing the pattern is not a write", ` * SET actual_departure_at = $2 is the bug`, 0],
  ];
  let failed = 0;
  for (const [name, src, want] of cases) {
    const got = auditSource(src, "<mem>").length;
    if (got !== want) {
      console.error(`SELFTEST FAIL: ${name} — expected ${want}, got ${got}`);
      failed++;
    }
  }
  // The COALESCE fallback in the stamper is the thing the queue wrongly believes is missing.
  const stamper = fs.existsSync(path.join(ROOT, STAMPER)) ? fs.readFileSync(path.join(ROOT, STAMPER), "utf8") : "";
  if (stamper && !/COALESCE\s*\(\s*\$3::timestamptz\s*,\s*now\(\)\s*\)/i.test(stamper)) {
    console.error("SELFTEST FAIL: the stamper no longer COALESCEs onto now() — the NULL is back");
    failed++;
  }
  if (failed) process.exit(1);
  console.log(`${LABEL} SELFTEST PASS — ${cases.length} cases + stamper fallback intact`);
  process.exit(0);
}

const files = walk(path.join(ROOT, SRC));
if (files.length === 0) {
  console.error(`${LABEL} FAIL — scanned ZERO files under ${SRC}; scope is wrong, refusing to pass vacuously.`);
  process.exit(1);
}

const problems = [];
let writeSites = 0;
for (const f of files) {
  const rel = path.relative(ROOT, f);
  const src = fs.readFileSync(f, "utf8");
  if (/actual_departure_at\s*=\s*(?:\$|COALESCE|now\(\))/i.test(src)) writeSites++;
  problems.push(...auditSource(src, rel));
}

if (writeSites === 0) {
  console.error(
    `${LABEL} FAIL — found ZERO sites writing actual_departure_at. Either the stamp was deleted ` +
      `(delivery evidence is now never recorded) or this guard's scope is wrong. Refusing to pass vacuously.`,
  );
  process.exit(1);
}

const stamperAbs = path.join(ROOT, STAMPER);
if (!fs.existsSync(stamperAbs)) {
  problems.push(`${STAMPER}: missing — the final-delivery departure stamper is the WIRE-07 write path.`);
} else if (!/COALESCE\s*\(\s*\$3::timestamptz\s*,\s*now\(\)\s*\)/i.test(fs.readFileSync(stamperAbs, "utf8"))) {
  problems.push(
    `${STAMPER}: the COALESCE(..., now()) fallback is gone. Without it an omitted delivered_at writes ` +
      `NULL — which is the failure the wave queue already (incorrectly) believes is live today.`,
  );
}

if (problems.length) {
  console.error(`${LABEL} FAIL — a delivered load could be left with no delivery evidence:\n`);
  for (const p of problems) console.error(`  - ${p}`);
  process.exit(1);
}

console.log(
  `${LABEL} OK — ${writeSites} site(s) stamp actual_departure_at, all with a real clock value; ` +
    `stamper COALESCE fallback intact.`,
);
process.exit(0);
