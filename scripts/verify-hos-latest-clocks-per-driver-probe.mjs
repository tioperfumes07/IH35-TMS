#!/usr/bin/env node
/**
 * LEAD 443.281 row 109 — "Load board HOS columns blank for most trucks".
 * Measured 10-23 on prod: the data was there (drive 262 min, certified ELD) but GET /dispatch/drivers/:id/hos-status took
 * 4.6 s: getLatestHosClocksByDriver ran DISTINCT ON over the company's whole samsara.hos_snapshots history (~740k rows,
 * 1.58 s) for EVERY board row's HOS cell, so the 6 HOS columns stayed blank while the calls queued.
 *   R1  the latest-clock read is one index probe per driver (LATERAL … ORDER BY polled_at DESC LIMIT 1), never DISTINCT ON
 *       the snapshot history;
 *   (R2 — the per-driver hos-status route passing [driver_id] — follows once apps/backend/src/dispatch/ is pushable: that
 *    path arms CC-1's live verify-load-cost-rollup-lateral-no-alias-shadow money red.)
 * --selftest plants each regression and requires a FAIL.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

export const ALLOW_OFFLINE_SKIP = "static source scan; never connects to a database";
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = "verify-hos-latest-clocks-per-driver-probe";
const FILES = {
  svc: "apps/backend/src/integrations/samsara/samsara-hos-clocks-pull.service.ts",
  route: "apps/backend/src/dispatch/loads.routes.ts",
};
export function audit(s) {
  const f = [];
  const fn = s.svc.slice(s.svc.indexOf("export async function getLatestHosClocksByDriver"), s.svc.indexOf("return out;", s.svc.indexOf("export async function getLatestHosClocksByDriver")));
  if (/DISTINCT ON \(driver_uuid\)/.test(fn)) f.push("R1: latest HOS clocks scan the whole snapshot history with DISTINCT ON");
  if (!/CROSS JOIN LATERAL \([\s\S]*?h\.driver_uuid = d\.id[\s\S]*?ORDER BY h\.polled_at DESC\s*LIMIT 1/.test(fn)) f.push("R1: latest HOS clocks are not one index probe per driver");
  return f;
}
const src = Object.fromEntries(Object.entries(FILES).map(([k, rel]) => [k, fs.readFileSync(path.join(ROOT, rel), "utf8")]));
if (process.argv.includes("--selftest")) {
  const plant = (k, a, b) => (src[k].includes(a) ? audit({ ...src, [k]: src[k].replace(a, b) }).length > 0 : null);
  const cases = [
    ["clean sources pass", audit(src).length === 0],
    ["DISTINCT ON history scan FAILS", plant("svc", "SELECT d.id::text AS driver_uuid,", "SELECT DISTINCT ON (driver_uuid) d.id::text AS driver_uuid,")],
    ["no LIMIT 1 probe FAILS", plant("svc", "ORDER BY h.polled_at DESC\n          LIMIT 1", "ORDER BY h.polled_at DESC")],
  ];
  let bad = 0;
  for (const [n, ok] of cases) { console.log(`  ${ok ? "✓" : "✗"} ${n}${ok === null ? " (plant anchor missing)" : ""}`); if (!ok) bad += 1; }
  console.log(bad ? `${LABEL} --selftest FAIL` : `${LABEL} --selftest PASS (${cases.length}/${cases.length})`);
  process.exit(bad ? 1 : 0);
}
const failures = audit(src);
if (failures.length) { console.error(`${LABEL}: FAIL — ${failures.length}`); for (const x of failures) console.error(`  ✗ ${x}`); process.exit(1); }
console.log(`${LABEL}: OK — latest HOS clocks are one index probe per driver; the read stays fast for every caller`);
