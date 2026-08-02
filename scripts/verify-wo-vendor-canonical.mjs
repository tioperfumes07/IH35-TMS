#!/usr/bin/env node
/**
 * GUARD — MNT-VENDOR-CANONICAL.
 *
 * THE DEFECT THIS ASSERTS AGAINST (live, USMCA, 2026-08-02): creating a Repair work order with a
 * vendor failed outright — "Failed to create work order" — blocking the maintenance -> vendor -> A/P
 * -> expense-GL chain from the UI.
 *
 * work-orders.routes.ts validated the submitted vendor against the RETIRE mirror:
 *     SELECT 1 FROM mdata.qbo_vendors WHERE id = $1 AND operating_company_id = $2
 * USMCA has 4 vendors in canonical mdata.vendors and **0** in mdata.qbo_vendors, because the mirror is
 * empty BY DESIGN for any entity with no QuickBooks connection. The lookup found nothing, the route
 * answered bad_vendor, and EVERY vendor work order in USMCA failed. Same for any non-QBO entity.
 *
 * LINKAGE LAW §10: vendors (AP truth) are `mdata.vendors`; the WO picker must stop using the mirror.
 *
 * WHAT IT ENFORCES: the maintenance WO vendor path reads CANONICAL mdata.vendors, never the mirror.
 * Scoped to the WO vendor path only — mdata.qbo_vendors remains legitimate elsewhere as a QBO mirror.
 */
import { readFileSync, existsSync, readdirSync } from "node:fs";
import path from "node:path";

const LABEL = "verify:wo-vendor-canonical";
const DIR = "apps/backend/src/maintenance";
const MIGRATION = "db/migrations/202611170000_wo_vendor_id_repoint_to_canonical_mdata_vendors.sql";
/**
 * ANY SQL read of the RETIRE mirror inside apps/backend/src/maintenance.
 *
 * Deliberately broad WITHIN THIS DIRECTORY, and that is the point: in maintenance the vendor is always
 * the A/P vendor, so there is no legitimate reason to touch the QBO mirror here at all. An earlier,
 * narrower version of this pattern required `vendor_id` within 160 chars of the table name and
 * therefore MISSED the actual defect — the route read `SELECT 1 FROM mdata.qbo_vendors WHERE id = $1`,
 * which never mentions a vendor column. The selftest caught that; a narrower rule would have shipped
 * green and useless. The mirror remains legitimate outside this directory.
 */
const MIRROR_VENDOR_SQL = /(FROM|JOIN)\s+mdata\.qbo_vendors/i;

export function analyse(files) {
  const problems = [];
  for (const [file, src] of Object.entries(files)) {
    if (file === MIGRATION || src == null) continue;
    if (MIRROR_VENDOR_SQL.test(src)) {
      problems.push(
        `${file}: reads RETIRE mdata.qbo_vendors for a work-order vendor column. That mirror is EMPTY ` +
          `for any entity without a QuickBooks connection (USMCA: 4 canonical vendors, 0 mirror rows), ` +
          `so this rejects every vendor and blocks WO -> A/P -> GL. Use canonical mdata.vendors.`
      );
    }
  }
  const mig = files[MIGRATION];
  if (mig == null) {
    problems.push(`${MIGRATION} is missing — the FK repoint that makes the canonical write legal is gone.`);
  } else if (!/REFERENCES mdata\.vendors\(id\)/.test(mig)) {
    problems.push(`${MIGRATION}: no FK to mdata.vendors(id). Reading canonical while the FK still points at the mirror would fail on write.`);
  }
  return problems;
}

function readAll() {
  const out = {};
  if (existsSync(DIR)) {
    for (const n of readdirSync(DIR)) {
      if (!n.endsWith(".ts") || n.includes(".test.")) continue;
      const p = path.join(DIR, n);
      out[p] = readFileSync(p, "utf8");
    }
  }
  out[MIGRATION] = existsSync(MIGRATION) ? readFileSync(MIGRATION, "utf8") : null;
  return out;
}

function selftest() {
  const failures = [];
  const t = (l, c) => { if (!c) failures.push(l); };
  const goodMig = "ADD CONSTRAINT fk REFERENCES mdata.vendors(id) ON DELETE SET NULL";

  t("canonical read passes", analyse({ "a.ts": "SELECT 1 FROM mdata.vendors WHERE id = $1", [MIGRATION]: goodMig }).length === 0);
  t("the REAL pre-fix route read FAILS",
    analyse({ "a.ts": "SELECT 1 FROM mdata.qbo_vendors WHERE id = $1::uuid AND operating_company_id = $2::uuid", [MIGRATION]: goodMig }).length === 1);
  t("the REAL pre-fix report join FAILS",
    analyse({ "a.ts": "LEFT JOIN mdata.qbo_vendors v ON v.id = w.external_vendor_id", [MIGRATION]: goodMig }).length === 1);
  t("ANY mirror read inside maintenance FAILS (no legitimate use here)",
    analyse({ "a.ts": "SELECT display_name FROM mdata.qbo_vendors WHERE qbo_id = $1", [MIGRATION]: goodMig }).length === 1);
  t("a bare mention in a comment does not trip it",
    analyse({ "a.ts": "// see mdata.qbo_vendors for the mirror", [MIGRATION]: goodMig }).length === 0);
  t("missing migration FAILS", analyse({ "a.ts": "SELECT 1 FROM mdata.vendors", [MIGRATION]: null }).length === 1);
  t("migration without the canonical FK FAILS",
    analyse({ "a.ts": "SELECT 1 FROM mdata.vendors", [MIGRATION]: "ALTER TABLE x DROP CONSTRAINT y;" }).length === 1);

  if (failures.length) {
    console.error(`${LABEL} SELFTEST FAILED:\n  - ${failures.join("\n  - ")}`);
    process.exit(1);
  }
  return failures;
}

if (process.argv.includes("--selftest")) {
  selftest();
  console.log(`${LABEL} selftest OK — 7 cases (2 pass-shapes, 5 fail-shapes incl. both real defects)`);
  process.exit(0);
}
const problems = analyse(readAll());
if (problems.length) {
  console.error(`${LABEL} FAILED:\n  - ${problems.join("\n  - ")}`);
  process.exit(1);
}
console.log(`${LABEL} OK — WO vendor path reads canonical mdata.vendors; FK repointed`);
