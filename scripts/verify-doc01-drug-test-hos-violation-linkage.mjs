#!/usr/bin/env node
/**
 * DOC-01 D2/D3 slice 3 (owner APP-DEFECT-REGISTER-2026-08-29 Root 1) — static-shape guard for the
 * drug_test/hos_violation document-linkage slice. Same 5-check shape as the fine/company_violation
 * guard (verify-doc01-fine-company-violation-linkage.mjs): migration presence + CHECK widen,
 * allowlist sync (array-scoped, not whole-file), ensureLinkEntityExists reachability, and
 * ENTITY_LABEL_SQL entries.
 */
import { readFileSync, existsSync, readdirSync } from "node:fs";

const migrationsDir = "db/migrations";
const routesPath = "apps/backend/src/docs/files.routes.ts";
const labelsPath = "apps/backend/src/docs/entity-labels.ts";
const routesSrc = readFileSync(routesPath, "utf8");
const labelsSrc = readFileSync(labelsPath, "utf8");

function findMigrationSrc() {
  if (!existsSync(migrationsDir)) return null;
  const hit = readdirSync(migrationsDir).find((f) => f.includes("doc01_drug_test_hos_violation_doc_columns"));
  return hit ? readFileSync(`${migrationsDir}/${hit}`, "utf8") : null;
}

function analyze(routes, labels, migration) {
  const failures = [];

  if (!migration) {
    failures.push("no db/migrations/*doc01_drug_test_hos_violation_doc_columns*.sql found");
  } else {
    if (!/'drug_test', 'hos_violation'/.test(migration)) {
      failures.push("migration: docs.file_links CHECK widen does not include drug_test + hos_violation");
    }
    if (!/FOREIGN KEY \(source_doc_id\) REFERENCES docs\.files\(id\) ON DELETE SET NULL/.test(migration)) {
      failures.push("migration: source_doc_id FK to docs.files(id) missing");
    }
  }

  const arraysSection = routes.slice(0, routes.indexOf("const fileLinkInputSchema"));
  for (const type of ["drug_test", "hos_violation"]) {
    const count = (arraysSection.match(new RegExp(`"${type}"`, "g")) ?? []).length;
    if (count < 2) {
      failures.push(`${routesPath}: '${type}' missing from SUPPORTED_LINK_ENTITY_TYPES and/or entityTypeSchema (found ${count}/2 occurrences before fileLinkInputSchema)`);
    }
  }

  if (!/if \(entityType === "drug_test"\) \{\s*\n\s*const res = await client\.query\("SELECT id FROM safety\.drug_test/.test(routes)) {
    failures.push(`${routesPath}: ensureLinkEntityExists() has no reachable branch for 'drug_test' -- link creation would silently fail`);
  }
  if (!/if \(entityType === "hos_violation"\) \{\s*\n\s*const res = await client\.query\("SELECT id FROM safety\.hos_violations/.test(routes)) {
    failures.push(`${routesPath}: ensureLinkEntityExists() has no reachable branch for 'hos_violation' -- link creation would silently fail`);
  }

  if (!/drug_test: \{ table: "safety\.drug_test"/.test(labels)) {
    failures.push(`${labelsPath}: ENTITY_LABEL_SQL missing a real drug_test entry`);
  }
  if (!/hos_violation: \{ table: "safety\.hos_violations"/.test(labels)) {
    failures.push(`${labelsPath}: ENTITY_LABEL_SQL missing a real hos_violation entry`);
  }

  return failures;
}

function selftest() {
  const migration = findMigrationSrc();
  const good = analyze(routesSrc, labelsSrc, migration);
  if (good.length > 0) {
    console.error("verify-doc01-drug-test-hos-violation-linkage --selftest: FAIL on the real (good) files");
    for (const f of good) console.error(`  - ${f}`);
    process.exit(1);
  }

  const mutations = [
    {
      name: "migration CHECK widen removed",
      apply: () => (migration ?? "").replace(/'drug_test', 'hos_violation'/, ""),
      run: (m) => analyze(routesSrc, labelsSrc, m),
    },
    {
      name: "migration FK removed",
      apply: () => (migration ?? "").replace(/FOREIGN KEY \(source_doc_id\) REFERENCES docs\.files\(id\) ON DELETE SET NULL/g, ""),
      run: (m) => analyze(routesSrc, labelsSrc, m),
    },
    {
      name: "allowlist entries removed (routes)",
      apply: () => routesSrc.replace(/  "drug_test",\n  "hos_violation",\n/g, ""),
      run: (m) => analyze(m, labelsSrc, migration),
    },
    {
      name: "ensureLinkEntityExists branch removed (drug_test)",
      apply: () =>
        routesSrc.replace(
          `  if (entityType === "drug_test") {\n    const res = await client.query("SELECT id FROM safety.drug_test WHERE id = $1 AND operating_company_id = $2::uuid LIMIT 1", [entityId, operatingCompanyId]);\n    return res.rows.length > 0;\n  }\n`,
          ""
        ),
      run: (m) => analyze(m, labelsSrc, migration),
    },
    {
      name: "ensureLinkEntityExists branch removed (hos_violation)",
      apply: () =>
        routesSrc.replace(
          `  if (entityType === "hos_violation") {\n    const res = await client.query("SELECT id FROM safety.hos_violations WHERE id = $1 AND operating_company_id = $2::uuid LIMIT 1", [entityId, operatingCompanyId]);\n    return res.rows.length > 0;\n  }\n`,
          ""
        ),
      run: (m) => analyze(m, labelsSrc, migration),
    },
    {
      name: "ENTITY_LABEL_SQL entries removed (labels)",
      apply: () =>
        labelsSrc.replace(
          /  drug_test: \{ table: "safety\.drug_test".*\n  hos_violation: \{ table: "safety\.hos_violations".*\n/,
          ""
        ),
      run: (m) => analyze(routesSrc, m, migration),
    },
  ];

  let allCaught = true;
  for (const m of mutations) {
    const mutated = m.apply();
    const failures = m.run(mutated);
    if (failures.length === 0) {
      console.error(`verify-doc01-drug-test-hos-violation-linkage --selftest: NOT CAUGHT — ${m.name}`);
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
    console.error("verify-doc01-drug-test-hos-violation-linkage: FAIL");
    for (const f of failures) console.error(`  - ${f}`);
    process.exit(1);
  }
  console.log("verify-doc01-drug-test-hos-violation-linkage: OK — migration present, allowlist/ensureLinkEntityExists/ENTITY_LABEL_SQL entries all in sync for drug_test/hos_violation");
}
