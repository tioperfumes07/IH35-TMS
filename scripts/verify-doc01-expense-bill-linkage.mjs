#!/usr/bin/env node
/**
 * DOC-01 D2 slice 5 (owner APP-DEFECT-REGISTER-2026-08-29 Root 1) — static-shape guard for the
 * expense/bill document-linkage slice. Migration is CHECK-widen only (no new columns -- both
 * tables already have a working upload path through a different mechanism); backend wiring
 * includes a voided_at exclusion from the start this time (DOC-F10066 lesson).
 */
import { readFileSync, existsSync, readdirSync } from "node:fs";

const migrationsDir = "db/migrations";
const routesPath = "apps/backend/src/docs/files.routes.ts";
const labelsPath = "apps/backend/src/docs/entity-labels.ts";
const routesSrc = readFileSync(routesPath, "utf8");
const labelsSrc = readFileSync(labelsPath, "utf8");

function findMigrationSrc() {
  if (!existsSync(migrationsDir)) return null;
  const hit = readdirSync(migrationsDir).find((f) => f.includes("doc01_expense_bill_file_links_widen"));
  return hit ? readFileSync(`${migrationsDir}/${hit}`, "utf8") : null;
}

function analyze(routes, labels, migration) {
  const failures = [];

  if (!migration) {
    failures.push("no db/migrations/*doc01_expense_bill_file_links_widen*.sql found");
  } else if (!/'expense', 'bill'/.test(migration)) {
    failures.push("migration: docs.file_links CHECK widen does not include expense + bill");
  }

  const arraysSection = routes.slice(0, routes.indexOf("const fileLinkInputSchema"));
  for (const type of ["expense", "bill"]) {
    const count = (arraysSection.match(new RegExp(`"${type}"`, "g")) ?? []).length;
    if (count < 2) {
      failures.push(`${routesPath}: '${type}' missing from SUPPORTED_LINK_ENTITY_TYPES and/or entityTypeSchema (found ${count}/2 occurrences before fileLinkInputSchema)`);
    }
  }

  if (
    !/if \(entityType === "expense"\) \{[\s\S]{0,300}FROM accounting\.expenses WHERE id = \$1 AND operating_company_id = \$2::uuid AND voided_at IS NULL/.test(
      routes
    )
  ) {
    failures.push(`${routesPath}: ensureLinkEntityExists() has no reachable, voided-excluding branch for 'expense'`);
  }
  if (
    !/if \(entityType === "bill"\) \{[\s\S]{0,300}FROM accounting\.bills WHERE id = \$1 AND operating_company_id = \$2::uuid AND voided_at IS NULL/.test(
      routes
    )
  ) {
    failures.push(`${routesPath}: ensureLinkEntityExists() has no reachable, voided-excluding branch for 'bill'`);
  }

  if (!/expense: \{ table: "accounting\.expenses"/.test(labels)) {
    failures.push(`${labelsPath}: ENTITY_LABEL_SQL missing a real expense entry`);
  }
  if (!/bill: \{ table: "accounting\.bills"/.test(labels)) {
    failures.push(`${labelsPath}: ENTITY_LABEL_SQL missing a real bill entry`);
  }

  return failures;
}

function selftest() {
  const migration = findMigrationSrc();
  const good = analyze(routesSrc, labelsSrc, migration);
  if (good.length > 0) {
    console.error("verify-doc01-expense-bill-linkage --selftest: FAIL on the real (good) files");
    for (const f of good) console.error(`  - ${f}`);
    process.exit(1);
  }

  const mutations = [
    {
      name: "migration CHECK widen removed",
      apply: () => (migration ?? "").replace(/'expense', 'bill'/, ""),
      run: (m) => analyze(routesSrc, labelsSrc, m),
    },
    {
      name: "allowlist entries removed (routes)",
      apply: () => routesSrc.replace(/  "expense",\n  "bill",\n/g, ""),
      run: (m) => analyze(m, labelsSrc, migration),
    },
    {
      name: "ensureLinkEntityExists branch removed (expense)",
      apply: () => routesSrc.replace(/  if \(entityType === "expense"\) \{[\s\S]*?\n  \}\n/, ""),
      run: (m) => analyze(m, labelsSrc, migration),
    },
    {
      name: "ensureLinkEntityExists branch removed (bill)",
      apply: () => routesSrc.replace(/  if \(entityType === "bill"\) \{[\s\S]*?\n  \}\n/, ""),
      run: (m) => analyze(m, labelsSrc, migration),
    },
    {
      name: "ENTITY_LABEL_SQL entries removed (labels)",
      apply: () =>
        labelsSrc.replace(
          /  expense: \{ table: "accounting\.expenses".*\n  bill: \{ table: "accounting\.bills".*\n/,
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
      console.error(`verify-doc01-expense-bill-linkage --selftest: NOT CAUGHT — ${m.name}`);
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
    console.error("verify-doc01-expense-bill-linkage: FAIL");
    for (const f of failures) console.error(`  - ${f}`);
    process.exit(1);
  }
  console.log("verify-doc01-expense-bill-linkage: OK — migration present, allowlist/ensureLinkEntityExists (voided-excluding)/ENTITY_LABEL_SQL entries all in sync for expense/bill");
}
