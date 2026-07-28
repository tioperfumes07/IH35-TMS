#!/usr/bin/env node
/**
 * DRV-02 — escrow pending deductions must use the editable, company-scoped recovery catalog.
 *
 * The original source_type CHECK created a second private vocabulary. This guard requires the
 * same-company composite FK, the safety-fine catalog seed, legacy-data normalization, and the
 * automatic abandonment writer to use its canonical catalog code.
 *
 * Usage: node scripts/verify-escrow-source-type-fk.mjs [--selftest]
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = "verify-escrow-source-type-fk";
const SELFTEST = process.argv.includes("--selftest");
const MIGRATION = "db/migrations/202610010010_drv_02_escrow_pending_source_type_catalog_fk.sql";
const FILES = {
  migration: MIGRATION,
  held: "db/migrations/.held-migrations.json",
  service: "apps/backend/src/driver-finance/escrow-deduction-pending.service.ts",
};

export function check(s) {
  const problems = [];

  if (!s.migration) {
    problems.push(`missing DRV-02 held migration: ${MIGRATION}`);
  } else {
    if (!/DO NOT RUN ON PROD via db:migrate/.test(s.migration)) {
      problems.push("DRV-02 migration must remain owner-held; db:migrate must never apply it");
    }
    if (!/catalogs\.driver_deduction_types/.test(s.migration)) {
      problems.push("migration must use canonical catalogs.driver_deduction_types");
    }
    if (/REFERENCES\s+catalogs\.escrow_types/.test(s.migration)) {
      problems.push("migration must not FK source_type to escrow bucket catalog");
    }
    if (!/FOREIGN KEY\s*\(operating_company_id,\s*source_type\)[\s\S]*?REFERENCES\s+catalogs\.driver_deduction_types\s*\(operating_company_id,\s*code\)/.test(s.migration)) {
      problems.push("migration must enforce a same-company composite source_type catalog FK");
    }
    if (!/ON DELETE RESTRICT/.test(s.migration) || !/ON UPDATE RESTRICT/.test(s.migration)) {
      problems.push("catalog FK must reject destructive or code-changing catalog mutations");
    }
    if (!/'SAFETY-FINE'/.test(s.migration) || !/'safety_fine' THEN 'SAFETY-FINE'/.test(s.migration)) {
      problems.push("migration must seed SAFETY-FINE and normalize the legacy safety_fine source");
    }
    if (!/'load_abandonment' THEN 'LOAD-ABANDONMENT'/.test(s.migration)) {
      problems.push("migration must normalize legacy load_abandonment before the FK");
    }
    if (!/DROP CONSTRAINT %I/.test(s.migration) || !/pg_get_constraintdef\(c\.oid\) LIKE '%source_type%'/.test(s.migration)) {
      problems.push("migration must remove only the obsolete source_type CHECK dynamically");
    }
    if (!/CREATE OR REPLACE FUNCTION dispatch\.auto_propose_escrow_on_abandonment/.test(s.migration) || !/'LOAD-ABANDONMENT'/.test(s.migration)) {
      problems.push("migration must repoint the automatic abandonment writer to the catalog code");
    }
    if (!/v_dangling > 0/.test(s.migration) || !/DRV-02 ABORT/.test(s.migration)) {
      problems.push("migration must fail closed on pre-existing unmapped source_type values");
    }
  }

  if (!s.held || !s.held.includes(MIGRATION.split("/").at(-1))) {
    problems.push("held migration registry must register the DRV-02 migration");
  }

  if (!s.service || !/LOAD_ABANDONMENT_SOURCE_TYPE\s*=\s*"LOAD-ABANDONMENT"/.test(s.service)) {
    problems.push("pending-deduction service must query the catalogized LOAD-ABANDONMENT source type");
  }
  if (s.service && /source_type = 'load_abandonment'/.test(s.service)) {
    problems.push("pending-deduction service still queries the retired private source_type value");
  }

  return problems;
}

function read(rel) {
  const filename = path.join(ROOT, rel);
  return fs.existsSync(filename) ? fs.readFileSync(filename, "utf8") : "";
}

function live() {
  return Object.fromEntries(Object.entries(FILES).map(([key, rel]) => [key, read(rel)]));
}

function selftest() {
  const real = live();
  let ok = true;
  if (check(real).length) {
    console.error("SELFTEST FAIL: real DRV-02 sources have false positives");
    ok = false;
  }

  const cases = [
    ["FK removed", { ...real, migration: real.migration.replace(/FOREIGN KEY/, "REMOVED KEY") }],
    ["safety fine removed", { ...real, migration: real.migration.replace(/'SAFETY-FINE'/g, "'REMOVED'") }],
    ["unsafe delete action", { ...real, migration: real.migration.replace(/ON DELETE RESTRICT/, "ON DELETE CASCADE") }],
    ["legacy query restored", { ...real, service: real.service.replace(/LOAD-ABANDONMENT/g, "load_abandonment") }],
    ["held registration removed", { ...real, held: real.held.replace(MIGRATION.split("/").at(-1), "missing.sql") }],
  ];

  for (const [name, mutated] of cases) {
    if (check(mutated).length === 0) {
      console.error(`SELFTEST FAIL: ${name} was not caught`);
      ok = false;
    } else {
      console.log(`SELFTEST: ${name} -> caught as expected`);
    }
  }
  if (!ok) process.exit(1);
  console.log(`[${LABEL}] SELFTEST PASS`);
}

if (SELFTEST) selftest();
else {
  const problems = check(live());
  if (problems.length) {
    console.error(`[${LABEL}] FAILED — ${problems.length} issue(s):`);
    for (const problem of problems) console.error(`  ✗ ${problem}`);
    process.exit(1);
  }
  console.log(`[${LABEL}] OK — escrow pending source_type is an editable, same-company deduction catalog FK`);
}
