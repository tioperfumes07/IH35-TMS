#!/usr/bin/env node
// verify:per-entity-catalog-parity-seed
//
// LST-SEED-01. The "same values on every active entity" ruling (owner 2026-07-24) is a DATA invariant:
// every per-entity catalog must carry the primary company's codes on every other ACTIVE company. It was
// violated silently — catalogs.complaint_types sat at TRANSP 271 / TRK 12 / USMCA 12 on prod, so a
// complaint logged under a TRANSP-only code could not be classified on TRK or USMCA at all.
//
// WHAT THIS GUARD CAN AND CANNOT PROVE — stated honestly (DoD §4: a guard checks the THING, not the
// shape of the thing; packet block 15 part A).
//   * A static CI guard CANNOT count prod rows, so it cannot itself assert "271 = 271 = 271".
//   * What it CAN do is assert that every registered per-entity catalog migration contains the MECHANISM
//     that makes a parity gap structurally impossible — a cross-entity seed loop over every OTHER active
//     org.companies row, copying from the dynamically-resolved primary, idempotent via ON CONFLICT — and
//     that the migration carries its own in-SQL parity assertion so the APPLY itself fails when parity is
//     not reached. That is the mechanism check plus a runtime check at the only moment data can change.
//   * The row-count proof is GUARD's, live on Neon with lucia bypass, after the owner applies.
// So this guard's job is: no future per-entity catalog migration may ship without the seed mechanism, and
// none may quietly reintroduce a hardcoded-UUID primary, a DELETE grant, or a destructive statement.
//
// FAILS on the pre-fix tree (202607970000 absent => complaint_types has no seed) and PASSES on the fix.
// `--selftest` plants each defect in an in-memory copy of the REAL sources, asserts every one is caught,
// then asserts the live sources are clean (a false positive burns trust as fast as a miss).
import fs from "node:fs";
import path from "node:path";

const ROOT = process.cwd();
const LABEL = "verify:per-entity-catalog-parity-seed";
const SELFTEST = process.argv.includes("--selftest");

const HELD = "db/migrations/.held-migrations.json";

// Every catalog converted under the owner's "per entity, SAME values on every entity" ruling.
// Adding the next converted catalog here is how this guard catches the next seed gap.
const MANIFEST = [
  {
    file: "db/migrations/202607860000_fleet_catalogs_per_entity.sql",
    key: "code",
    // This one converts 8+ tables by looping an ARRAY, so its REVOKE is a dynamic EXECUTE format().
    dynamicRevoke: true,
  },
  {
    file: "db/migrations/202607870000_driver_load_statuses_per_entity.sql",
    key: "code",
    revokes: ["catalogs.driver_load_statuses"],
  },
  {
    file: "db/migrations/202607890000_driver_termination_reasons_per_entity.sql",
    key: "code",
    revokes: ["catalogs.driver_termination_reasons"],
  },
  {
    file: "db/migrations/202607910000_equipment_types_per_entity.sql",
    key: "code",
    revokes: ["catalogs.equipment_types", "catalogs.equipment_line_item_templates"],
  },
  {
    file: "db/migrations/202607920000_customer_quality_reasons_per_entity.sql",
    key: "code",
    revokes: ["catalogs.customer_quality_event_reasons"],
  },
  {
    file: "db/migrations/202607970000_complaint_types_per_entity_parity_seed.sql",
    key: "type_code",
    revokes: ["catalogs.complaint_types"],
    // LST-SEED-01 specifics. The construction-packet draft of this migration named a deactivated_at
    // column in the INSERT list; catalogs.complaint_types has no such column on prod (verified live:
    // id, operating_company_id, type_code, type_name, default_severity, is_active) and the statement
    // would have failed. Pin the verified column list so nobody re-invents it.
    insertColumns: "(operating_company_id, type_code, type_name, default_severity, is_active)",
    // Distinctive text, so removing THIS RAISE cannot be masked by the unrelated
    // "no active org.companies row" guard clause that shares the error prefix.
    parityAssertion: "not at parity",
  },
];

const FILES = [HELD, ...MANIFEST.map((m) => m.file)];
const readDisk = (rel) => fs.readFileSync(path.join(ROOT, rel), "utf8");

// Structural checks must ignore SQL line comments: these migrations document prod truth (which includes
// real company UUIDs) in their headers, and that documentation is not executable code.
const stripComments = (sql) => sql.replace(/--[^\n]*/g, "");

const UUID_LITERAL = /'[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}'/;
const DYNAMIC_FALLBACK =
  /FROM org\.companies\s+WHERE deactivated_at IS NULL\s+ORDER BY created_at, id LIMIT 1/;
const SEED_LOOP = /FROM org\.companies WHERE deactivated_at IS NULL AND id <> v_primary/;
const DESTRUCTIVE = /\b(DROP\s+TABLE|TRUNCATE|DELETE\s+FROM)\b/i;

export function assertPerEntityCatalogParitySeed(sources) {
  const get = (rel) => sources?.[rel] ?? readDisk(rel);
  const errs = [];
  const held = get(HELD);

  for (const entry of MANIFEST) {
    const name = path.basename(entry.file);
    let raw;
    try {
      raw = get(entry.file);
    } catch {
      errs.push(`${name}: per-entity catalog migration is MISSING from db/migrations/`);
      continue;
    }
    const code = stripComments(raw);

    if (!/DO NOT RUN ON PROD/i.test(raw)) {
      errs.push(`${name}: missing the 'DO NOT RUN ON PROD' held marker`);
    }
    if (!held.includes(name)) {
      errs.push(`${name}: not registered in .held-migrations.json`);
    }

    // The mechanism that makes a parity gap impossible: copy the primary's rows to every OTHER active company.
    if (!SEED_LOOP.test(code)) {
      errs.push(
        `${name}: no cross-entity seed — must copy the primary's rows to every OTHER active org.companies row (this is the LST-SEED-01 gap)`,
      );
    }
    const conflict = new RegExp(`ON CONFLICT \\(operating_company_id, ${entry.key}\\) DO NOTHING`);
    if (!conflict.test(code)) {
      errs.push(`${name}: seed must be idempotent — ON CONFLICT (operating_company_id, ${entry.key}) DO NOTHING`);
    }

    // A bare UUID literal as the SOLE primary resolution FK-fails on the fresh-from-0001 CI database,
    // where org.companies rows are seeded with generated ids. A literal is only tolerable as the first
    // arm of a COALESCE that still has a dynamic fallback.
    if (UUID_LITERAL.test(code) && !DYNAMIC_FALLBACK.test(code)) {
      errs.push(`${name}: primary company resolved by hardcoded UUID with no dynamic org.companies fallback`);
    }
    if (!UUID_LITERAL.test(code) && !DYNAMIC_FALLBACK.test(code) && !/WHERE code = 'TRANSP'/.test(code)) {
      errs.push(`${name}: primary company must be resolved dynamically from org.companies`);
    }

    // void-not-delete. Multi-table migrations REVOKE through a dynamic EXECUTE format() over an array.
    if (entry.dynamicRevoke) {
      if (!/EXECUTE format\('REVOKE DELETE ON catalogs\.%I FROM ih35_app'/.test(code)) {
        errs.push(`${name}: must REVOKE DELETE on every converted catalog from ih35_app (void-not-delete)`);
      }
    }
    for (const table of entry.revokes ?? []) {
      if (!new RegExp(`REVOKE DELETE ON ${table.replace(".", "\\.")} FROM ih35_app`).test(code)) {
        errs.push(`${name}: must REVOKE DELETE ON ${table} FROM ih35_app (void-not-delete)`);
      }
    }

    // Invariant #24 — additive only.
    const destructive = code.match(DESTRUCTIVE);
    if (destructive) {
      errs.push(`${name}: Invariant #24 violation — destructive statement '${destructive[0]}' in a catalog migration`);
    }

    if (entry.insertColumns) {
      const stmt = code.match(/INSERT INTO catalogs\.complaint_types[\s\S]*?DO NOTHING;/);
      if (!stmt) {
        errs.push(`${name}: could not locate the complaint_types INSERT ... ON CONFLICT statement`);
      } else {
        if (!stmt[0].includes(entry.insertColumns)) {
          errs.push(
            `${name}: INSERT column list must be exactly ${entry.insertColumns} (the live prod column set)`,
          );
        }
        if (/deactivated_at/.test(stmt[0])) {
          errs.push(
            `${name}: INSERT references deactivated_at — catalogs.complaint_types has no such column on prod; the statement would fail`,
          );
        }
      }
    }

    if (entry.parityAssertion) {
      const hasRaise = new RegExp(`RAISE EXCEPTION '[^']*${entry.parityAssertion}`).test(code);
      if (!hasRaise) {
        errs.push(
          `${name}: missing the in-SQL parity assertion — the apply must RAISE when an active entity is off parity`,
        );
      }
    }
  }

  return errs;
}

if (SELFTEST) {
  const live = Object.fromEntries(FILES.map((r) => [r, readDisk(r)]));
  const NEW = "db/migrations/202607970000_complaint_types_per_entity_parity_seed.sql";
  const failures = [];

  const expectCaught = (name, mutated, needle) => {
    if (JSON.stringify(mutated) === JSON.stringify(live)) {
      failures.push(`${name}: inert — the mutation did not change the source`);
      return;
    }
    const problems = assertPerEntityCatalogParitySeed(mutated);
    if (!problems.some((x) => x.includes(needle))) {
      failures.push(`${name}: NOT caught (got: ${problems.join(" | ") || "none"})`);
    }
  };

  expectCaught(
    "seed-loop-removed",
    { ...live, [NEW]: live[NEW].replace(/FROM org\.companies WHERE deactivated_at IS NULL AND id <> v_primary/g, "FROM org.companies WHERE id = v_primary") },
    "no cross-entity seed",
  );
  expectCaught(
    "on-conflict-removed",
    { ...live, [NEW]: live[NEW].replace(/ON CONFLICT \(operating_company_id, type_code\) DO NOTHING/g, "RETURNING id") },
    "must be idempotent",
  );
  expectCaught(
    "revoke-delete-removed",
    { ...live, [NEW]: live[NEW].replace(/REVOKE DELETE ON catalogs\.complaint_types FROM ih35_app/g, "GRANT SELECT ON catalogs.complaint_types TO ih35_app") },
    "void-not-delete",
  );
  expectCaught(
    "hardcoded-uuid-sole-resolution",
    {
      ...live,
      [NEW]: live[NEW]
        .replace(/\(SELECT id FROM org\.companies WHERE code = 'TRANSP' AND deactivated_at IS NULL ORDER BY created_at, id LIMIT 1\),\n/, "")
        .replace(/\(SELECT id FROM org\.companies WHERE deactivated_at IS NULL ORDER BY created_at, id LIMIT 1\)/, "'91e0bf0a-133f-4ce8-a734-2586cfa66d96'::uuid"),
    },
    "hardcoded UUID",
  );
  expectCaught(
    "invented-deactivated-at-column",
    {
      ...live,
      [NEW]: live[NEW]
        .replace("(operating_company_id, type_code, type_name, default_severity, is_active)", "(operating_company_id, type_code, type_name, default_severity, is_active, deactivated_at)")
        .replace("SELECT v_seed, type_code, type_name, default_severity, is_active", "SELECT v_seed, type_code, type_name, default_severity, is_active, deactivated_at"),
    },
    "has no such column on prod",
  );
  expectCaught(
    "parity-assertion-removed",
    { ...live, [NEW]: live[NEW].replace(/RAISE EXCEPTION 'complaint_types_parity: % active entity\(ies\) not at parity/g, "RAISE NOTICE 'complaint_types_parity: % entities skipped") },
    "missing the in-SQL parity assertion",
  );
  expectCaught(
    "destructive-truncate-introduced",
    { ...live, [NEW]: live[NEW].replace("REVOKE DELETE ON catalogs.complaint_types FROM ih35_app;", "TRUNCATE catalogs.complaint_types;\nREVOKE DELETE ON catalogs.complaint_types FROM ih35_app;") },
    "Invariant #24 violation",
  );
  expectCaught(
    "held-registration-removed",
    { ...live, [HELD]: live[HELD].replace(/202607970000_complaint_types_per_entity_parity_seed\.sql/g, "202607970000_placeholder.sql") },
    "not registered in .held-migrations.json",
  );

  const liveProblems = assertPerEntityCatalogParitySeed(live);
  if (liveProblems.length) failures.push(`live FAIL: ${liveProblems.join(" | ")}`);

  if (failures.length) {
    console.error(`${LABEL} SELFTEST FAILED:`);
    for (const f of failures) console.error(`  ${f}`);
    process.exit(1);
  }
  console.log(`${LABEL} SELFTEST PASS — 8 planted defects caught, live sources clean`);
  process.exit(0);
}

const problems = assertPerEntityCatalogParitySeed();
if (problems.length) {
  console.error(`${LABEL} FAIL:`);
  for (const p of problems) console.error(`  ✗ ${p}`);
  process.exit(1);
}
console.log(
  `${LABEL} OK — ${MANIFEST.length} per-entity catalog migrations each carry the cross-entity seed, idempotent ON CONFLICT, dynamic primary and REVOKE DELETE; complaint_types pins its live column list + parity assertion.`,
);
