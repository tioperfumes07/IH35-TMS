import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

/**
 * Load-Number business-date guard (regression lock for DISPATCH-1).
 *
 * The Load Number is a PERSISTED business identifier. Its date segment was built from
 * `new Date().toISOString().slice(0,10)` (UTC), so a load booked at 7 PM Central on 2026-06-29 was numbered
 * L-20260630-0001 (June 30). DISPATCH-1 (9e8aa3731b) moved the date to companyBusinessDateCompact.
 *
 * RESTATED 443.99 — GO-10 REV-B (734a0e3f48, #19325) removed the date from the Load Number entirely: ONE shared
 * allocator, allocateNextLoadNumber (dispatch/load-id-reservation.service.ts), mints a flat company-wide PLAIN-DIGIT
 * sequence (13508 -> 13509) through lib.next_trace_no(company, 'LOAD'); mdata/loads.routes.ts no longer mints its own.
 * A number with no date cannot carry a UTC date, so DISPATCH-1's bug is now locked by:
 *   (a) the allocator mints plain digits through lib.next_trace_no(..., 'LOAD') and refuses a non-digit result;
 *   (b) neither generator file builds a date-stamped Load Number (an `L-${...}` / `"L-" +` template, or a
 *       companyBusinessDateCompact / YYYYMMDD segment) — a date coming back must come back through this guard;
 *   (c) neither file contains the UTC date-only anti-pattern `toISOString().slice(0,10)` (unchanged).
 */

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..", "..");

const TARGETS = [
  "apps/backend/src/dispatch/load-id-reservation.service.ts",
  "apps/backend/src/mdata/loads.routes.ts",
];

const UTC_DATEONLY_RE = /toISOString\(\)\s*\.\s*(?:slice|substring)\(\s*0\s*,\s*10\s*\)/;

const ALLOCATOR = "apps/backend/src/dispatch/load-id-reservation.service.ts";
const DATED_MINT_RE = /`L[A-Z0-9_]*-\$\{|["']L-["']\s*\+|companyBusinessDateCompact\(/;

export function checkSource(rel, src) {
  const v = [];
  const code = src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
  if (DATED_MINT_RE.test(code)) {
    v.push(`${rel}: builds a date-stamped Load Number again — GO-10 REV-B mints plain digits only (allocateNextLoadNumber); a date segment must never return (it came back as UTC once: DISPATCH-1).`);
  }
  if (rel === ALLOCATOR) {
    if (!/export async function allocateNextLoadNumber\(/.test(code) || !/lib\.next_trace_no\(\$1::uuid, 'LOAD'\)/.test(code) || !/if \(!seq \|\| !\/\^\[0-9\]\+\$\/\.test\(seq\)\)/.test(code)) {
      v.push(`${rel}: allocateNextLoadNumber no longer mints a plain-digit number through lib.next_trace_no(company, 'LOAD') and refuses a non-digit result.`);
    }
  }
  return v;
}

function selftest() {
  const real = fs.readFileSync(path.join(ROOT, ALLOCATOR), "utf8");
  const fails = [];
  if (checkSource(ALLOCATOR, real).length) fails.push("real allocator flagged");
  if (!checkSource(ALLOCATOR, real.replace("lib.next_trace_no($1::uuid, 'LOAD')", "lib.next_trace_no($1::uuid, 'OTHER')")).length) fails.push("allocator off the LOAD counter not caught");
  if (!checkSource(ALLOCATOR, real.replace("if (!seq || !/^[0-9]+$/.test(seq))", "if (!seq)")).length) fails.push("non-digit acceptance not caught");
  if (!checkSource("apps/backend/src/mdata/loads.routes.ts", "const n = `L-${companyBusinessDateCompact()}-${seq}`;").length) fails.push("dated L- template not caught");
  if (!checkSource("apps/backend/src/mdata/loads.routes.ts", "const n = \"L-\" + ymd + \"-\" + seq;").length) fails.push("L- concatenation not caught");
  if (checkSource("apps/backend/src/mdata/loads.routes.ts", "// was `L-${ymd}-${seq}` before GO-10 REV-B\nconst n = await allocateNextLoadNumber(client, oc);").length) fails.push("comment mention flagged");
  if (!UTC_DATEONLY_RE.test("new Date().toISOString().slice(0, 10)")) fails.push("UTC anti-pattern not caught");
  if (fails.length) { console.error(`verify-load-number-business-date --selftest FAIL: ${fails.join("; ")}`); process.exit(1); }
  console.log("verify-load-number-business-date --selftest PASS (7/7)");
}

function runGuard() {
  selftest();
  const violations = [];
  for (const rel of TARGETS) {
    const abs = path.join(ROOT, rel);
    if (!fs.existsSync(abs)) {
      violations.push(`${rel}: file missing — load-number generator moved? update this guard.`);
      continue;
    }
    const src = fs.readFileSync(abs, "utf8");
    violations.push(...checkSource(rel, src));
    if (UTC_DATEONLY_RE.test(src)) {
      violations.push(`${rel}: contains the UTC date-only anti-pattern toISOString().slice(0,10) — reintroduces the L-<tomorrow> Load Number bug.`);
    }
  }

  if (violations.length > 0) {
    console.error("verify-load-number-business-date FAILED:");
    for (const v of violations) console.error(`  - ${v}`);
    console.error("Fix: mint the Load Number through allocateNextLoadNumber (plain digits, GO-10 REV-B) — never a date segment.");
    process.exit(1);
  }
  console.log(`verify-load-number-business-date OK — ${TARGETS.length} generators: plain-digit allocator, no date segment, no UTC date-only pattern.`);
}

export default {
  name: "verify-load-number-business-date",
  run: () => runGuard(),
};

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  runGuard();
}
