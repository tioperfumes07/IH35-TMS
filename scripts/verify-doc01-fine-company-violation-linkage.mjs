#!/usr/bin/env node
/**
 * DOC-01 D2 slice 2 (owner APP-DEFECT-REGISTER-2026-08-29 Root 1) — static-shape guard for the
 * fine/company_violation document-linkage slice. Same checklist as the medical_card/
 * background_check guard (verify-doc01-medical-card-background-check-linkage.mjs), including the
 * ensureLinkEntityExists reachability check FROM THE START this time (DOC-F10063 lesson): a type
 * declared in the allowlist/schema/labels with no reachable existence-check branch silently
 * rejects every real link attempt.
 */
import { readFileSync, existsSync, readdirSync } from "node:fs";

const migrationsDir = "db/migrations";
const routesPath = "apps/backend/src/docs/files.routes.ts";
const labelsPath = "apps/backend/src/docs/entity-labels.ts";
const routesSrc = readFileSync(routesPath, "utf8");
const labelsSrc = readFileSync(labelsPath, "utf8");

function findMigrationSrc() {
  if (!existsSync(migrationsDir)) return null;
  const hit = readdirSync(migrationsDir).find((f) => f.includes("doc01_fine_company_violation_file_links_widen"));
  return hit ? readFileSync(`${migrationsDir}/${hit}`, "utf8") : null;
}

function analyze(routes, labels, migration) {
  const failures = [];

  if (!migration) {
    failures.push("no db/migrations/*doc01_fine_company_violation_file_links_widen*.sql found");
  } else if (!/'fine', 'company_violation'/.test(migration)) {
    failures.push("migration: docs.file_links CHECK widen does not include fine + company_violation");
  }

  // Scoped to just the two declaration arrays, not the whole file -- see DOC-F10063: the literal
  // type string also appears inside ensureLinkEntityExists()'s branches below, which would make a
  // naive whole-file substring search pass even with the allowlist entry removed.
  const arraysSection = routes.slice(0, routes.indexOf("const fileLinkInputSchema"));
  for (const type of ["fine", "company_violation"]) {
    const count = (arraysSection.match(new RegExp(`"${type}"`, "g")) ?? []).length;
    if (count < 2) {
      failures.push(`${routesPath}: '${type}' missing from SUPPORTED_LINK_ENTITY_TYPES and/or entityTypeSchema (found ${count}/2 occurrences before fileLinkInputSchema)`);
    }
  }

  if (!/if \(entityType === "fine"\) \{\s*\n\s*const res = await client\.query\("SELECT id FROM safety\.civil_fines/.test(routes)) {
    failures.push(`${routesPath}: ensureLinkEntityExists() has no reachable branch for 'fine' -- link creation would silently fail`);
  }
  if (!/if \(entityType === "company_violation"\) \{\s*\n\s*const res = await client\.query\("SELECT id FROM safety\.company_violations/.test(routes)) {
    failures.push(`${routesPath}: ensureLinkEntityExists() has no reachable branch for 'company_violation' -- link creation would silently fail`);
  }

  if (!/fine: \{ table: "safety\.civil_fines"/.test(labels)) {
    failures.push(`${labelsPath}: ENTITY_LABEL_SQL missing a real fine entry`);
  }
  if (!/company_violation: \{ table: "safety\.company_violations"/.test(labels)) {
    failures.push(`${labelsPath}: ENTITY_LABEL_SQL missing a real company_violation entry`);
  }

  return failures;
}

function selftest() {
  const migration = findMigrationSrc();
  const good = analyze(routesSrc, labelsSrc, migration);
  if (good.length > 0) {
    console.error("verify-doc01-fine-company-violation-linkage --selftest: FAIL on the real (good) files");
    for (const f of good) console.error(`  - ${f}`);
    process.exit(1);
  }

  const mutations = [
    {
      name: "migration CHECK widen removed",
      apply: () => (migration ?? "").replace(/'fine', 'company_violation'/, ""),
      run: (m) => analyze(routesSrc, labelsSrc, m),
    },
    {
      name: "allowlist entries removed (routes)",
      apply: () => routesSrc.replace(/  "fine",\n  "company_violation",\n/g, ""),
      run: (m) => analyze(m, labelsSrc, migration),
    },
    {
      name: "ensureLinkEntityExists branch removed (fine)",
      apply: () =>
        routesSrc.replace(
          `  if (entityType === "fine") {\n    const res = await client.query("SELECT id FROM safety.civil_fines WHERE id = $1 AND operating_company_id = $2::uuid LIMIT 1", [entityId, operatingCompanyId]);\n    return res.rows.length > 0;\n  }\n`,
          ""
        ),
      run: (m) => analyze(m, labelsSrc, migration),
    },
    {
      name: "ensureLinkEntityExists branch removed (company_violation)",
      apply: () =>
        routesSrc.replace(
          `  if (entityType === "company_violation") {\n    const res = await client.query("SELECT id FROM safety.company_violations WHERE id = $1 AND operating_company_id = $2::uuid LIMIT 1", [entityId, operatingCompanyId]);\n    return res.rows.length > 0;\n  }\n`,
          ""
        ),
      run: (m) => analyze(m, labelsSrc, migration),
    },
    {
      name: "ENTITY_LABEL_SQL entries removed (labels)",
      apply: () =>
        labelsSrc.replace(
          /  fine: \{ table: "safety\.civil_fines".*\n  company_violation: \{ table: "safety\.company_violations".*\n/,
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
      console.error(`verify-doc01-fine-company-violation-linkage --selftest: NOT CAUGHT — ${m.name}`);
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
    console.error("verify-doc01-fine-company-violation-linkage: FAIL");
    for (const f of failures) console.error(`  - ${f}`);
    process.exit(1);
  }
  console.log("verify-doc01-fine-company-violation-linkage: OK — migration present, allowlist/ensureLinkEntityExists/ENTITY_LABEL_SQL entries all in sync for fine/company_violation");
}
