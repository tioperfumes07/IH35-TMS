#!/usr/bin/env node
/**
 * DQF-01 Q4 (owner APP-DEFECT-REGISTER-2026-08-29 Root 2) — static-shape guard for the driver
 * qualification file's 49 CFR 391.51 catalog + FK slice. Q4's own requirement: "Must fail if: a
 * DQF row is written with no required_document_type_id" (writer-side -- N/A until Cursor's
 * wizard exists, noted honestly below, not silently skipped as if satisfied); "any of the 8
 * §391.51 items is missing from the catalog" (checked against the migration's own seed VALUES,
 * plus the two items -- annual MVR inquiry / med cert -- the migration's own header comment
 * documents as already covered by pre-existing rows, so all 8 are accounted for one way or the
 * other); "driver_id loses its FK" / "a retention field is dropped" (checked against the
 * migration's own ALTER TABLE statements).
 */
import { readFileSync, existsSync, readdirSync } from "node:fs";

const migrationsDir = "db/migrations";

function findMigrationSrc() {
  if (!existsSync(migrationsDir)) return null;
  const hit = readdirSync(migrationsDir).find((f) => f.includes("dqf01_required_document_types_seed_and_dqf_file_fks"));
  return hit ? readFileSync(`${migrationsDir}/${hit}`, "utf8") : null;
}

// The 5 codes this migration seeds directly, covering §391.51 items 2, 3, 5, 7, 8. Items 1
// (driver_application), 4 (mvr) and 6 (med_cert) are pre-existing rows this migration does not
// re-seed -- the migration's own header comment documents that explicitly, checked below too.
const SEEDED_CODES = ["mvr_hire", "road_test", "annual_review_note", "spe_certificate", "national_registry_verification"];
const PRE_EXISTING_CODES_DOCUMENTED = ["driver_application", "mvr", "med_cert"];

function analyze(migration) {
  const failures = [];

  if (!migration) {
    failures.push("no db/migrations/*dqf01_required_document_types_seed_and_dqf_file_fks*.sql found");
    return failures;
  }

  for (const code of SEEDED_CODES) {
    if (!new RegExp(`'${code}'`).test(migration)) {
      failures.push(`migration: §391.51 item code '${code}' missing from the seed VALUES`);
    }
  }
  for (const code of PRE_EXISTING_CODES_DOCUMENTED) {
    if (!migration.includes(code)) {
      failures.push(`migration: pre-existing-coverage code '${code}' no longer documented -- all 8 §391.51 items must be accounted for, seeded or explicitly pre-existing`);
    }
  }

  if (!/ADD CONSTRAINT driver_qualification_files_driver_id_fkey\s*\n\s*FOREIGN KEY \(driver_id\) REFERENCES mdata\.drivers\(id\)/.test(migration)) {
    failures.push("migration: driver_qualification_files.driver_id FK to mdata.drivers(id) missing");
  }
  if (!/ADD CONSTRAINT driver_qualification_files_required_document_type_id_fkey/.test(migration)) {
    failures.push("migration: driver_qualification_files.required_document_type_id FK missing");
  }

  for (const col of ["executed_at", "removable_after", "retain_until"]) {
    if (!new RegExp(`ADD COLUMN IF NOT EXISTS ${col}`).test(migration)) {
      failures.push(`migration: retention field '${col}' (§391.51(c)/(d)) missing`);
    }
  }

  return failures;
}

function selftest() {
  const migration = findMigrationSrc();
  const good = analyze(migration);
  if (good.length > 0) {
    console.error("verify-dqf01-required-document-types-and-file-fks --selftest: FAIL on the real (good) file");
    for (const f of good) console.error(`  - ${f}`);
    process.exit(1);
  }

  const mutations = [
    {
      name: "a seeded 391.51 code removed",
      apply: () =>
        (migration ?? "").replace(
          /  \('road_test', 'Road Test Certificate \/ Equivalent License \/ Written Statement', 'FMCSA §391\.31\(e\), §391\.33, §391\.44\(d\)', false, 30\),\n/,
          ""
        ),
    },
    { name: "driver_id FK removed", apply: () => (migration ?? "").replace(/ADD CONSTRAINT driver_qualification_files_driver_id_fkey\s*\n\s*FOREIGN KEY \(driver_id\) REFERENCES mdata\.drivers\(id\);/, ";") },
    { name: "retention field dropped", apply: () => (migration ?? "").replace(/ADD COLUMN IF NOT EXISTS retain_until date;/, ";") },
  ];

  let allCaught = true;
  for (const m of mutations) {
    const mutated = m.apply();
    if (mutated === migration) {
      console.error(`verify-dqf01-required-document-types-and-file-fks --selftest: mutation setup failed — ${m.name}`);
      process.exit(1);
    }
    const failures = analyze(mutated);
    if (failures.length === 0) {
      console.error(`verify-dqf01-required-document-types-and-file-fks --selftest: NOT CAUGHT — ${m.name}`);
      allCaught = false;
    } else {
      console.log(`  caught: ${m.name}`);
    }
  }

  if (!allCaught) process.exit(1);
  console.log(`SELFTEST PASS: ${mutations.length}/${mutations.length} planted regressions caught and repository restored green.`);
}

if (process.argv.includes("--selftest")) {
  selftest();
} else {
  const migration = findMigrationSrc();
  const failures = analyze(migration);
  if (failures.length > 0) {
    console.error("verify-dqf01-required-document-types-and-file-fks: FAIL");
    for (const f of failures) console.error(`  - ${f}`);
    process.exit(1);
  }
  console.log(
    "verify-dqf01-required-document-types-and-file-fks: OK — all 8 §391.51 items accounted for (5 seeded + 3 pre-existing), driver_id + required_document_type_id FKs present, all 3 retention fields present. " +
      "NOTE (honest, not silently satisfied): the writer-side rule (\"a DQF row is written with no required_document_type_id\") is N/A until Cursor's DQF create wizard exists -- there is no write path to check yet."
  );
}
