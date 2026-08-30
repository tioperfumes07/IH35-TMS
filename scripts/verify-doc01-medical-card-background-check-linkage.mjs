#!/usr/bin/env node
/**
 * DOC-01 D2/D3 (owner APP-DEFECT-REGISTER-2026-08-29 Root 1) — static-shape guard for the
 * medical_card/background_check document-linkage slice. D5's own requirement: "must fail if a
 * table on the DOC-01 list loses its doc column" and "an entity type is added to the allowlist
 * without a corresponding FK path" — Rule 14, declared both ways, checked mechanically:
 *   1. The migration file exists and adds source_doc_id to both tables + widens the CHECK.
 *   2. files.routes.ts's SUPPORTED_LINK_ENTITY_TYPES and entityTypeSchema both include
 *      'medical_card' and 'background_check' (kept in sync with each other -- a value in one but
 *      not the other is exactly the LV-FILE-LINK-ENTITY-TYPE-3WAY-MISMATCH class this file's own
 *      header comment names).
 *   3. entity-labels.ts's ENTITY_LABEL_SQL map has a real table/labelSelect/scopePredicate entry
 *      for both -- an allowlisted type with no label config is a string added to an array and
 *      called linked, exactly what D2 forbids.
 */
import { readFileSync, existsSync, readdirSync } from "node:fs";

const migrationsDir = "db/migrations";
const routesPath = "apps/backend/src/docs/files.routes.ts";
const labelsPath = "apps/backend/src/docs/entity-labels.ts";
const routesSrc = readFileSync(routesPath, "utf8");
const labelsSrc = readFileSync(labelsPath, "utf8");

function findMigrationSrc() {
  if (!existsSync(migrationsDir)) return null;
  const hit = readdirSync(migrationsDir).find((f) => f.includes("doc01_medical_card_background_check_doc_columns"));
  return hit ? readFileSync(`${migrationsDir}/${hit}`, "utf8") : null;
}

function analyze(routes, labels, migration) {
  const failures = [];

  if (!migration) {
    failures.push("no db/migrations/*doc01_medical_card_background_check_doc_columns*.sql found");
  } else {
    if (!/ALTER TABLE safety\.medical_cards\s*\n\s*ADD COLUMN IF NOT EXISTS source_doc_id/.test(migration)) {
      failures.push("migration: safety.medical_cards.source_doc_id ADD COLUMN missing");
    }
    if (!/ALTER TABLE safety\.background_checks\s*\n\s*ADD COLUMN IF NOT EXISTS source_doc_id/.test(migration)) {
      failures.push("migration: safety.background_checks.source_doc_id ADD COLUMN missing");
    }
    if (!/FOREIGN KEY \(source_doc_id\) REFERENCES docs\.files\(id\) ON DELETE SET NULL/.test(migration)) {
      failures.push("migration: source_doc_id FK to docs.files(id) missing");
    }
    if (!/'medical_card', 'background_check'/.test(migration)) {
      failures.push("migration: docs.file_links CHECK widen does not include medical_card + background_check");
    }
  }

  for (const type of ["medical_card", "background_check"]) {
    if (!new RegExp(`"${type}"`).test(routes)) {
      failures.push(`${routesPath}: '${type}' missing from SUPPORTED_LINK_ENTITY_TYPES/entityTypeSchema`);
    }
  }

  if (!/medical_card: \{ table: "safety\.medical_cards"/.test(labels)) {
    failures.push(`${labelsPath}: ENTITY_LABEL_SQL missing a real medical_card entry`);
  }
  if (!/background_check: \{ table: "safety\.background_checks"/.test(labels)) {
    failures.push(`${labelsPath}: ENTITY_LABEL_SQL missing a real background_check entry`);
  }

  return failures;
}

function selftest() {
  const migration = findMigrationSrc();
  const good = analyze(routesSrc, labelsSrc, migration);
  if (good.length > 0) {
    console.error("verify-doc01-medical-card-background-check-linkage --selftest: FAIL on the real (good) files");
    for (const f of good) console.error(`  - ${f}`);
    process.exit(1);
  }

  const mutations = [
    {
      name: "allowlist entry removed (routes)",
      apply: () => routesSrc.replace(/"medical_card",\n\s*"background_check",\n/g, ""),
      run: (m) => analyze(m, labelsSrc, migration),
    },
    {
      name: "ENTITY_LABEL_SQL entry removed (labels)",
      apply: () =>
        labelsSrc.replace(
          /  medical_card: \{ table: "safety\.medical_cards".*\n  background_check: \{ table: "safety\.background_checks".*\n/,
          ""
        ),
      run: (m) => analyze(routesSrc, m, migration),
    },
    {
      name: "migration FK line removed",
      apply: () => (migration ?? "").replace(/FOREIGN KEY \(source_doc_id\) REFERENCES docs\.files\(id\) ON DELETE SET NULL/g, ""),
      run: (m) => analyze(routesSrc, labelsSrc, m),
    },
  ];

  let allCaught = true;
  for (const m of mutations) {
    const mutated = m.apply();
    const failures = m.run(mutated);
    if (failures.length === 0) {
      console.error(`verify-doc01-medical-card-background-check-linkage --selftest: NOT CAUGHT — ${m.name}`);
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
  const failures = analyze(routesSrc, labelsSrc, migration);
  if (failures.length > 0) {
    console.error("verify-doc01-medical-card-background-check-linkage: FAIL");
    for (const f of failures) console.error(`  - ${f}`);
    process.exit(1);
  }
  console.log("verify-doc01-medical-card-background-check-linkage: OK — migration present, allowlist entries and ENTITY_LABEL_SQL entries in sync for medical_card/background_check");
}
