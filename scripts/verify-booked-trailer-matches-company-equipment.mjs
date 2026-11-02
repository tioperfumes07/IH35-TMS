#!/usr/bin/env node
/**
 * verify-booked-trailer-matches-company-equipment — ENG-22 prevention ratchet (Cursor ROUND 7.2-C).
 *
 * LAW: a live (non-cancelled, non-voided) USMCA load whose assigned company trailer has a known
 * physical body type must carry the matching catalogs.load_trailer_equipment code. Historical silent
 * DRY_VAN default on Reefer trailers is refused at Book/Edit Load (trailer_equipment_type_mismatch);
 * residual cancelled loads (13593/13634/13635) wait owner AUTH apply of the existing ops repair.
 *
 * CEILING: 0 active mismatches. Cancelled residuals are listed in evidence only (not counted).
 *
 * Usage: node scripts/verify-booked-trailer-matches-company-equipment.mjs [--selftest]
 */
import { requireLiveDbOrExit } from "./lib/require-live-db.mjs";

const LABEL = "verify-booked-trailer-matches-company-equipment";
export const REQUIRES_LIVE_DB = "booked vs company-trailer type is load data — only verifiable against the live database";
const USMCA = "5c854333-6ea5-4faa-af31-67cb272fef80";
export const CEILING = 0;

const MISMATCH_SQL = `
WITH tr AS (
  SELECT DISTINCT ON (h.load_id) h.load_id, h.new_trailer_id
    FROM dispatch.load_assignment_history h
   WHERE h.new_trailer_id IS NOT NULL
   ORDER BY h.load_id, h.created_at DESC
)
SELECT l.load_number::text AS load_number, l.status::text AS status,
       lte.code AS booked, e.equipment_number::text AS equipment_number,
       e.equipment_type::text AS trailer_type, target.code AS trailer_code
  FROM mdata.loads l
  JOIN catalogs.load_trailer_equipment lte ON lte.id = l.load_trailer_equipment_id
  JOIN tr ON tr.load_id = l.id
  JOIN mdata.equipment e ON e.id = tr.new_trailer_id
  JOIN catalogs.load_trailer_equipment target
    ON target.operating_company_id = l.operating_company_id AND target.is_active
   AND target.code = CASE lower(regexp_replace(e.equipment_type::text, '[^A-Za-z]', '', 'g'))
                       WHEN 'reefer' THEN 'REFRIGERATED_VAN' WHEN 'flatbed' THEN 'FLATBED'
                       WHEN 'dryvan' THEN 'DRY_VAN' WHEN 'lowboy' THEN 'LOWBOY' END
 WHERE l.operating_company_id = $1::uuid AND l.voided_at IS NULL
   AND lte.code <> target.code
 ORDER BY l.load_number`;

/** Pure — active (non-cancelled) mismatches against the ceiling. */
export function verdict(rows) {
  const active = rows.filter((r) => r.status !== "cancelled");
  const problems = [];
  if (active.length > CEILING) {
    problems.push(
      `${active.length} active load(s) booked type ≠ company trailer type (ceiling ${CEILING}): ` +
        active.map((r) => `${r.load_number} ${r.booked}↔${r.equipment_number}/${r.trailer_code}`).join("; ")
    );
  }
  return { problems, active, cancelled: rows.filter((r) => r.status === "cancelled") };
}

if (process.argv.includes("--selftest")) {
  const fs = await import("node:fs");
  const src = fs.readFileSync(new URL("../apps/backend/src/dispatch/book-load.service.ts", import.meta.url), "utf8");
  const updateSrc = fs.readFileSync(new URL("../apps/backend/src/dispatch/update-load.service.ts", import.meta.url), "utf8");
  const cases = [
    ["clean passes", verdict([]).problems.length === 0],
    ["cancelled residual alone passes", verdict([{ load_number: "13593", status: "cancelled", booked: "DRY_VAN", equipment_number: "10219", trailer_code: "REFRIGERATED_VAN" }]).problems.length === 0],
    ["one active fails and names the load", verdict([{ load_number: "13634", status: "delivered", booked: "DRY_VAN", equipment_number: "10870", trailer_code: "REFRIGERATED_VAN" }]).problems[0]?.includes("13634") === true],
    ["Book Load refuses trailer_equipment_type_mismatch", src.includes("trailer_equipment_type_mismatch") && src.includes("PHYSICAL_TRAILER_CODES")],
    ["Edit Load syncs company trailer equipment", updateSrc.includes("ENG-22: company trailer body type is evidence")],
  ];
  for (const [n, pass] of cases) console.log(`  ${pass ? "✓" : "✗"} ${n}`);
  const bad = cases.filter(([, p]) => !p).length;
  console.log(bad ? `${LABEL} --selftest FAIL` : `${LABEL} --selftest PASS (${cases.length}/${cases.length})`);
  process.exit(bad ? 1 : 0);
}

const { client, pool } = await requireLiveDbOrExit({ label: LABEL });
let code = 1;
try {
  await client.query("BEGIN READ ONLY");
  await client.query("SELECT set_config('app.bypass_rls','lucia',true)");
  const rows = (await client.query(MISMATCH_SQL, [USMCA])).rows;
  await client.query("ROLLBACK");
  const { problems, active, cancelled } = verdict(rows);
  if (problems.length) {
    for (const p of problems) console.error(`  ✗ ${p}`);
    console.error(`${LABEL} FAIL — active mismatches ${active.length}; cancelled residuals ${cancelled.length}`);
  } else {
    console.log(
      `${LABEL} PASS — active mismatches 0 (ceiling ${CEILING}); cancelled residuals listed (not counted): ` +
        (cancelled.length ? cancelled.map((r) => `${r.load_number} ${r.booked}↔${r.equipment_number}`).join(", ") : "none")
    );
    code = 0;
  }
} catch (e) {
  await client.query("ROLLBACK").catch(() => {});
  console.error(`${LABEL} ERROR — ${e.message}`);
} finally {
  client.release?.();
  await pool?.end?.();
}
process.exit(code);
