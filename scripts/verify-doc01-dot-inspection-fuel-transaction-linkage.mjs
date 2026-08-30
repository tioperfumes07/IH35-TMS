#!/usr/bin/env node
/**
 * DOC-01 D2/D3 slice 4 (owner APP-DEFECT-REGISTER-2026-08-29 Root 1) — static-shape guard for the
 * dot_inspection/fuel_transaction document-linkage slice. Same shape as the prior slices' guards.
 * dot_inspection is checked slightly differently: the migration adds a FK to the EXISTING
 * pdf_evidence_id column (no new ADD COLUMN for that table), while fuel_transaction gets a new
 * source_doc_id column matching the standard pattern.
 */
import { readFileSync, existsSync, readdirSync } from "node:fs";

const migrationsDir = "db/migrations";
const routesPath = "apps/backend/src/docs/files.routes.ts";
const labelsPath = "apps/backend/src/docs/entity-labels.ts";
const routesSrc = readFileSync(routesPath, "utf8");
const labelsSrc = readFileSync(labelsPath, "utf8");

function findMigrationSrc() {
  if (!existsSync(migrationsDir)) return null;
  const hit = readdirSync(migrationsDir).find((f) => f.includes("doc01_dot_inspection_fuel_transaction_doc_columns"));
  return hit ? readFileSync(`${migrationsDir}/${hit}`, "utf8") : null;
}

function analyze(routes, labels, migration) {
  const failures = [];

  if (!migration) {
    failures.push("no db/migrations/*doc01_dot_inspection_fuel_transaction_doc_columns*.sql found");
  } else {
    if (!/'dot_inspection', 'fuel_transaction'/.test(migration)) {
      failures.push("migration: docs.file_links CHECK widen does not include dot_inspection + fuel_transaction");
    }
    if (!/ADD CONSTRAINT dot_inspections_pdf_evidence_id_fkey\s*\n\s*FOREIGN KEY \(pdf_evidence_id\) REFERENCES docs\.files\(id\)/.test(migration)) {
      failures.push("migration: dot_inspections.pdf_evidence_id FK missing");
    }
    if (!/ADD CONSTRAINT fuel_transactions_source_doc_id_fkey\s*\n\s*FOREIGN KEY \(source_doc_id\) REFERENCES docs\.files\(id\)/.test(migration)) {
      failures.push("migration: fuel_transactions.source_doc_id FK missing");
    }
  }

  const arraysSection = routes.slice(0, routes.indexOf("const fileLinkInputSchema"));
  for (const type of ["dot_inspection", "fuel_transaction"]) {
    const count = (arraysSection.match(new RegExp(`"${type}"`, "g")) ?? []).length;
    if (count < 2) {
      failures.push(`${routesPath}: '${type}' missing from SUPPORTED_LINK_ENTITY_TYPES and/or entityTypeSchema (found ${count}/2 occurrences before fileLinkInputSchema)`);
    }
  }

  if (
    !/if \(entityType === "dot_inspection"\) \{[\s\S]{0,300}FROM safety\.dot_inspections WHERE id = \$1 AND operating_company_id = \$2::uuid AND voided_at IS NULL/.test(
      routes
    )
  ) {
    failures.push(`${routesPath}: ensureLinkEntityExists() has no reachable branch for 'dot_inspection' -- link creation would silently fail`);
  }
  if (!/if \(entityType === "fuel_transaction"\) \{\s*\n\s*const res = await client\.query\("SELECT id FROM fuel\.fuel_transactions/.test(routes)) {
    failures.push(`${routesPath}: ensureLinkEntityExists() has no reachable branch for 'fuel_transaction' -- link creation would silently fail`);
  }

  if (!/dot_inspection: \{ table: "safety\.dot_inspections"/.test(labels)) {
    failures.push(`${labelsPath}: ENTITY_LABEL_SQL missing a real dot_inspection entry`);
  }
  if (!/fuel_transaction: \{ table: "fuel\.fuel_transactions"/.test(labels)) {
    failures.push(`${labelsPath}: ENTITY_LABEL_SQL missing a real fuel_transaction entry`);
  }

  return failures;
}

function selftest() {
  const migration = findMigrationSrc();
  const good = analyze(routesSrc, labelsSrc, migration);
  if (good.length > 0) {
    console.error("verify-doc01-dot-inspection-fuel-transaction-linkage --selftest: FAIL on the real (good) files");
    for (const f of good) console.error(`  - ${f}`);
    process.exit(1);
  }

  const mutations = [
    {
      name: "migration CHECK widen removed",
      apply: () => (migration ?? "").replace(/'dot_inspection', 'fuel_transaction'/, ""),
      run: (m) => analyze(routesSrc, labelsSrc, m),
    },
    {
      name: "dot_inspections pdf_evidence_id FK removed",
      apply: () =>
        (migration ?? "").replace(
          "ADD CONSTRAINT dot_inspections_pdf_evidence_id_fkey\n      FOREIGN KEY (pdf_evidence_id) REFERENCES docs.files(id) ON DELETE SET NULL;",
          ""
        ),
      run: (m) => analyze(routesSrc, labelsSrc, m),
    },
    {
      name: "fuel_transactions source_doc_id FK removed",
      apply: () =>
        (migration ?? "").replace(
          "ADD CONSTRAINT fuel_transactions_source_doc_id_fkey\n      FOREIGN KEY (source_doc_id) REFERENCES docs.files(id) ON DELETE SET NULL;",
          ""
        ),
      run: (m) => analyze(routesSrc, labelsSrc, m),
    },
    {
      name: "allowlist entries removed (routes)",
      apply: () => routesSrc.replace(/  "dot_inspection",\n  "fuel_transaction",\n/g, ""),
      run: (m) => analyze(m, labelsSrc, migration),
    },
    {
      name: "ensureLinkEntityExists branch removed (dot_inspection)",
      apply: () =>
        routesSrc.replace(
          /  if \(entityType === "dot_inspection"\) \{[\s\S]*?\n  \}\n/,
          ""
        ),
      run: (m) => analyze(m, labelsSrc, migration),
    },
    {
      name: "ensureLinkEntityExists branch removed (fuel_transaction)",
      apply: () =>
        routesSrc.replace(
          `  if (entityType === "fuel_transaction") {\n    const res = await client.query("SELECT id FROM fuel.fuel_transactions WHERE id = $1 AND operating_company_id = $2::uuid LIMIT 1", [entityId, operatingCompanyId]);\n    return res.rows.length > 0;\n  }\n`,
          ""
        ),
      run: (m) => analyze(m, labelsSrc, migration),
    },
    {
      name: "ENTITY_LABEL_SQL entries removed (labels)",
      apply: () =>
        labelsSrc.replace(
          /  dot_inspection: \{ table: "safety\.dot_inspections".*\n  fuel_transaction: \{ table: "fuel\.fuel_transactions".*\n/,
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
      console.error(`verify-doc01-dot-inspection-fuel-transaction-linkage --selftest: NOT CAUGHT — ${m.name}`);
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
    console.error("verify-doc01-dot-inspection-fuel-transaction-linkage: FAIL");
    for (const f of failures) console.error(`  - ${f}`);
    process.exit(1);
  }
  console.log("verify-doc01-dot-inspection-fuel-transaction-linkage: OK — migration present, allowlist/ensureLinkEntityExists/ENTITY_LABEL_SQL entries all in sync for dot_inspection/fuel_transaction");
}
