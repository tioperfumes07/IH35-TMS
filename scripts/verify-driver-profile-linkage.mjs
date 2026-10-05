#!/usr/bin/env node
/**
 * ROUND 326 item 3: one driver profile that is the whole driver.
 *   static -- GET /api/v1/drivers/:id/whole-profile serves all 17 blocks (pay basis · settlements + lines · advances ·
 *             escrow · deductions · reimbursements · fuel · units + trailers · loads · safety · drug & alcohol ·
 *             medical card · CDL · insurance · documents · HOS · Samsara) and the driver page renders every one;
 *   live   -- runs the real service (scripts/lib/print-driver-profiles.ts) for every active USMCA driver: every block
 *             must return a value or a NAMED reason (0 malformed), and the number of drivers whose block is empty
 *             may only shrink against scripts/verify-driver-profile-linkage.baseline.json (linkage only grows).
 * Fails closed without DATABASE_URL.
 *
 * MEASURED EMPTY (2026-10-05, after the AUTH-400 purge; same rule as the Lead's purge-window ruling of that day): a block
 * whose source has ZERO live rows company-wide (same predicates as the service, minus the driver) cannot measure
 * linkage — every driver is empty because nothing exists, not because a link broke. Such a block is reported
 * EMPTY BY PURGE and skips the baseline. The exemption ends on the FIRST live row, per block, measured — never a date,
 * never a flag — and the baseline applies again unchanged.
 */
import { readFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import path from "node:path";
/** Company-wide live population per purge-emptied block — the service's own predicates, minus driver_id. */
export const POPULATION_SQL = {
  settlements: `SELECT count(*)::int n FROM driver_finance.driver_settlements s WHERE s.operating_company_id = $1 AND s.voided_at IS NULL
                  AND s.reversed_at IS NULL AND s.status <> 'cancelled' AND s.is_sample_data IS NOT TRUE`,
  advances: `SELECT count(*)::int n FROM driver_finance.driver_advances WHERE operating_company_id = $1 AND voided_at IS NULL`,
  deductions: `SELECT count(*)::int n FROM driver_finance.driver_settlement_deductions WHERE operating_company_id = $1 AND voided_at IS NULL`,
  fuel: `SELECT count(*)::int n FROM fuel.fuel_transactions WHERE operating_company_id = $1 AND voided_at IS NULL AND archived_at IS NULL
           AND driver_id IS NOT NULL`,
  loads: `SELECT count(*)::int n FROM mdata.loads l WHERE l.operating_company_id = $1 AND l.voided_at IS NULL AND l.soft_deleted_at IS NULL
            AND l.canceled_at IS NULL AND l.status::text <> 'cancelled'`,
};
/**
 * Drivers (survivor ids) whose document links a governed purge deleted — read from audit.record_deletions, never assumed.
 * Live 2026-10-05: AUTH-400 deleted 108 driver file links (load-born files), e.g. both of EDUARDO AZAEL FLORES ORTIZ's.
 * Such a driver's empty documents block is EMPTY BY PURGE until a document links again (then it is simply not empty).
 */
export const PURGED_DOC_DRIVERS_SQL = `SELECT DISTINCT COALESCE(d.merged_into_driver_id, d.id)::text AS id
  FROM audit.record_deletions r JOIN mdata.drivers d ON d.id = (r.row_data->>'entity_id')::uuid
 WHERE r.table_name = 'docs.file_links' AND r.row_data->>'entity_type' = 'driver' AND r.auth_id IS NOT NULL
   AND d.operating_company_id = $1`;
/** Empty drivers for a block, less the drivers whose emptiness a governed purge measurably caused. */
export function emptyCount(rows, block, purgedDrivers) {
  return rows.filter((r) => r.blocks[block] === "reason" && !purgedDrivers.has(String(r.id))).length;
}
/** Baseline verdict for one block. population === undefined (not a measured block) always compares. */
export function blockVerdict({ block, empty, allowed, population }) {
  if (population === 0) return { fail: null, note: `EMPTY BY PURGE (0 live ${block} rows company-wide; baseline resumes on the first)` };
  if (empty > allowed) return { fail: `block ${block}: ${empty} drivers empty > baseline ${allowed} (linkage went backwards)`, note: "" };
  return { fail: null, note: "" };
}
if (process.argv.includes("--selftest")) {
  const bad = [];
  if (!blockVerdict({ block: "settlements", empty: 15, allowed: 2, population: 1 }).fail) bad.push("a regression with 1 live row passed");
  if (blockVerdict({ block: "settlements", empty: 15, allowed: 2, population: 0 }).fail) bad.push("a zero population failed");
  if (!blockVerdict({ block: "safety", empty: 18, allowed: 17, population: undefined }).fail) bad.push("an unmeasured block skipped the baseline");
  if (blockVerdict({ block: "loads", empty: 2, allowed: 2, population: 5 }).fail) bad.push("at-baseline failed");
  if (emptyCount([{ id: "a", blocks: { documents: "reason" } }, { id: "b", blocks: { documents: "reason" } }], "documents", new Set(["b"])) !== 1)
    bad.push("a purge-deleted driver's empty documents block counted against the baseline");
  if (emptyCount([{ id: "a", blocks: { documents: "reason" } }], "documents", new Set()) !== 1) bad.push("a plain empty block was excused");
  if (bad.length) { console.error("verify-driver-profile-linkage SELFTEST FAILED:\n  " + bad.join("\n  ")); process.exit(1); }
  console.log("verify-driver-profile-linkage SELFTEST OK — 6/6 (1 live row re-arms the baseline, 0 rows is EMPTY BY PURGE, unmeasured blocks always compare, at-baseline passes, a purge-deleted driver document is excused, a plain empty one is not)");
  process.exit(0);
}
const ROOT = process.cwd();
const svc = readFileSync("apps/backend/src/mdata/canonical/driver-profile.service.ts", "utf8");
const ui = readFileSync("apps/frontend/src/components/driver-profile/DriverWholeProfile.tsx", "utf8");
const routes = readFileSync("apps/backend/src/mdata/canonical/canonical-entities.routes.ts", "utf8");
const page = readFileSync("apps/frontend/src/pages/DriverDetail.tsx", "utf8");
const BLOCKS = ["pay_basis", "settlements", "advances", "escrow", "deductions", "reimbursements", "fuel", "equipment", "loads",
  "safety", "drug_alcohol", "medical_card", "cdl", "insurance", "documents", "hos", "samsara"];
const fails = [];
if (!/"\/api\/v1\/drivers\/:id\/whole-profile"/.test(routes)) fails.push("route GET /api/v1/drivers/:id/whole-profile is not registered");
for (const b of BLOCKS) {
  if (!new RegExp(`\\b${b}: block\\(`).test(svc)) fails.push(`service must return block ${b} as block(value, reason)`);
  if (!ui.includes(`testId="driver-profile-${b.replace(/_/g, "-")}"`)) fails.push(`UI must render block ${b} (driver-profile-${b.replace(/_/g, "-")})`);
}
if (!/<DriverWholeProfile /.test(page)) fails.push("DriverDetail must mount DriverWholeProfile");
if (/coming soon|placeholder panel/i.test(ui)) fails.push("profile UI must not carry placeholder panels");
const baseline = JSON.parse(readFileSync("scripts/verify-driver-profile-linkage.baseline.json", "utf8"));
if (!process.env.DATABASE_URL) { console.error("verify-driver-profile-linkage: FAIL — DATABASE_URL not set (live guard fails closed)."); process.exit(1); }
const rows = JSON.parse(execFileSync("npx", ["tsx", path.join(ROOT, "scripts/lib/print-driver-profiles.ts"), baseline.operating_company_id],
  { cwd: ROOT, env: process.env, encoding: "utf8", maxBuffer: 1 << 24 }));
const empty = Object.fromEntries(BLOCKS.map((b) => [b, 0]));
for (const r of rows) for (const b of BLOCKS) {
  if (r.blocks[b] === "malformed") fails.push(`${r.name}: block ${b} returned neither a value nor a named reason`);
  if (r.blocks[b] === "reason") empty[b]++;
}
const population = {};
let purgedDocDrivers = new Set();
{
  const { default: pg } = await import("pg");
  const c = new pg.Client({ connectionString: process.env.DATABASE_URL });
  await c.connect();
  try {
    for (const [b, sql] of Object.entries(POPULATION_SQL)) population[b] = (await c.query(sql, [baseline.operating_company_id])).rows[0].n;
    purgedDocDrivers = new Set((await c.query(PURGED_DOC_DRIVERS_SQL, [baseline.operating_company_id])).rows.map((r) => r.id));
  } finally {
    await c.end();
  }
}
console.log(`drivers checked: ${rows.length}`);
for (const b of BLOCKS) {
  const allowed = baseline.empty_block_drivers[b] ?? 0;
  const counted = b === "documents" ? emptyCount(rows, b, purgedDocDrivers) : empty[b];
  const v = blockVerdict({ block: b, empty: counted, allowed, population: population[b] });
  const purgedNote = counted !== empty[b] ? `  (${empty[b] - counted} EMPTY BY PURGE: links in audit.record_deletions)` : "";
  console.log(`  ${b.padEnd(15)} value ${rows.length - empty[b]}  named-reason ${empty[b]} (baseline ${allowed})${purgedNote}${v.note ? "  " + v.note : ""}`);
  if (v.fail) fails.push(v.fail);
}
if (fails.length) { console.error("verify-driver-profile-linkage: FAIL\n  " + fails.join("\n  ")); process.exit(1); }
console.log("verify-driver-profile-linkage: OK");
