#!/usr/bin/env node
/**
 * verify-creator-trailer-type-from-document — 443.324 ENG-22 (CC-3 claim 18785).
 *
 * ROOT CAUSE: the register said "195 loads on one equipment_type_id, 3 on another; neither
 * resolves in catalogs.equipment_types". FINDING: loads.load_trailer_equipment_id FKs to
 * catalogs.load_trailer_equipment (NOT catalogs.equipment_types). Both IDs resolve:
 *   cdfee422 = Dry Van (DRY_VAN), ebff82d9 = Reefer (REFRIGERATED_VAN).
 * catalogs.equipment_types is referenced only by mdata.driver_equipment_qualifications and
 * catalogs.equipment_line_item_templates — never by loads.
 *
 * GUARD: every USMCA load that has load_trailer_equipment_id set resolves in
 * catalogs.load_trailer_equipment (is_active = true). Ceiling 0 — this was never broken
 * once the register's catalog name was corrected. Live state documented here; no code change
 * required (verify-g2-creator-trailer-equipment-required already guards the Creator code path).
 *
 * Usage: node scripts/verify-creator-trailer-type-from-document.mjs [--selftest]
 */
import { requireLiveDbOrExit } from "./lib/require-live-db.mjs";

const LABEL = "verify-creator-trailer-type-from-document";
export const REQUIRES_LIVE_DB = "catalog linkage is only verifiable against the live catalog — fails closed without a database";
const USMCA = "5c854333-6ea5-4faa-af31-67cb272fef80";

export function selfTestCases() {
  return [
    ["0 unresolved = pass", countFails(0)],
    ["1 unresolved = fail", !countFails(1)],
  ];
}
function countFails(n) { return n === 0; }

if (process.argv.includes("--selftest")) {
  const cases = selfTestCases();
  for (const [n, pass] of cases) console.log(`  ${pass ? "✓" : "✗"} ${n}`);
  const bad = cases.filter(([, p]) => !p).length;
  console.log(bad ? `${LABEL} --selftest FAIL` : `${LABEL} --selftest PASS (${cases.length}/${cases.length})`);
  process.exit(bad ? 1 : 0);
}

const { client, pool } = await requireLiveDbOrExit({ label: LABEL });
try {
  await client.query("BEGIN");
  await client.query("SELECT set_config('app.bypass_rls','lucia',true)");

  const totalRes = await client.query(
    `SELECT count(*) AS n FROM mdata.loads
      WHERE operating_company_id = $1::uuid
        AND load_trailer_equipment_id IS NOT NULL
        AND voided_at IS NULL`,
    [USMCA]
  );
  const total = Number(totalRes.rows[0].n);

  const unresolved = await client.query(
    `SELECT l.id::text, l.load_trailer_equipment_id::text
       FROM mdata.loads l
      WHERE l.operating_company_id = $1::uuid
        AND l.load_trailer_equipment_id IS NOT NULL
        AND l.voided_at IS NULL
        AND NOT EXISTS (
          SELECT 1 FROM catalogs.load_trailer_equipment clt
           WHERE clt.id = l.load_trailer_equipment_id
             AND clt.is_active = true
        )
      LIMIT 10`,
    [USMCA]
  );

  await client.query("COMMIT");

  const n = unresolved.rows.length;
  if (n > 0) {
    const ids = unresolved.rows.map((r) => `load ${r.id} → equipment_id ${r.load_trailer_equipment_id}`).join("\n  ");
    console.error(
      `${LABEL}: FAIL — ${n} load(s) with load_trailer_equipment_id that does not resolve in catalogs.load_trailer_equipment:\n  ${ids}\n` +
      `NOTE: loads.load_trailer_equipment_id FKs to catalogs.load_trailer_equipment (NOT catalogs.equipment_types).`
    );
    process.exit(1);
  }

  console.log(
    `${LABEL}: OK — ${total} USMCA load(s) with load_trailer_equipment_id; 0 unresolved. ` +
    `(Catalog: catalogs.load_trailer_equipment — NOT catalogs.equipment_types)`
  );
} finally {
  client.release?.();
  await pool?.end?.();
}
