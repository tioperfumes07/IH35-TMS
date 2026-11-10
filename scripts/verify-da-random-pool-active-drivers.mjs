#!/usr/bin/env node
/**
 * ACCT-F11128 — the FMCSA random pool (safety/drug-alcohol/random-pool.service.ts listActiveEnrolledDrivers) holds ACTIVE
 * drivers only, by the same rule scheduleTest applies to each drawn driver (status 'Active', not deactivated, not archived).
 * Measured on prod 2026-11-10: 14 active enrollments, 1 for a driver deactivated 09-07 — a draw that picked him threw
 * active_driver_not_in_operating_company and rolled the whole draw back. Static; --selftest plants each defect.
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const LABEL = "verify-da-random-pool-active-drivers";
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const FILE = "apps/backend/src/safety/drug-alcohol/random-pool.service.ts";
const strip = (s) => String(s ?? "").replace(/\/\*[\s\S]*?\*\//g, "").replace(/--[^\n]*/g, "").replace(/(^|[^:])\/\/[^\n]*/g, "$1");

export function evaluate(src) {
  const s = strip(src);
  const at = s.indexOf("export async function listActiveEnrolledDrivers(");
  const end = s.indexOf("export async function", at + 10);
  const fn = at < 0 ? "" : s.slice(at, end < 0 ? undefined : end);
  const p = [];
  if (!fn) return ["listActiveEnrolledDrivers not found"];
  if (!/JOIN mdata\.drivers d\s+ON d\.id = e\.driver_uuid/.test(fn)) p.push("the pool does not join mdata.drivers on the enrollment's driver");
  for (const rule of ["d.status = 'Active'", "d.deactivated_at IS NULL", "d.archived_at IS NULL", "d.operating_company_id = $1::uuid"]) {
    if (!fn.includes(rule)) p.push(`the pool does not require ${rule}`);
  }
  return p;
}

function selftest() {
  const s = readFileSync(path.join(ROOT, FILE), "utf8");
  const cases = [
    ["the real source passes", s, 0],
    ["planted: join removed", s.replace("JOIN mdata.drivers d", "LEFT JOIN mdata.drivers dx"), 1],
    ["planted: active status dropped", s.replace("       AND d.status = 'Active'\n", ""), 1],
    ["planted: deactivated check dropped", s.replace("       AND d.deactivated_at IS NULL\n       AND d.archived_at IS NULL\n      WHERE e.", "      WHERE e."), 1],
  ];
  let bad = 0;
  for (const [name, src, want] of cases) {
    const got = evaluate(src).length > 0 ? 1 : 0;
    if (got !== want) bad++;
    console.log(`${got === want ? "ok  " : "FAIL"} ${name}`);
  }
  console.log(`${LABEL} --selftest: ${cases.length - bad}/${cases.length}`);
  process.exit(bad ? 1 : 0);
}

if (process.argv.includes("--selftest")) selftest();
else {
  const problems = evaluate(readFileSync(path.join(ROOT, FILE), "utf8"));
  if (problems.length) { console.error(`${LABEL}: FAIL`); for (const x of problems) console.error(`  - ${x}`); process.exit(1); }
  console.log(`${LABEL}: PASS — the FMCSA random pool is active drivers only`);
}
