#!/usr/bin/env node
/**
 * GUARD — verify-load-status-enum-abandonment-values (ACCT-F117)
 *
 * WHAT WENT WRONG, AND WHY A LEDGER GUARD WOULD NOT HAVE CAUGHT IT
 * Migration 0094 ran three `ALTER TYPE mdata.load_status_enum ADD VALUE IF NOT EXISTS` statements
 * for 'abandoned', 'driver_walkoff' and 'driver_no_show'. It is recorded applied in BOTH ledgers.
 * The labels are not on prod — verified 2026-08-05 on br-fancy-credit-akjnd07a: load_status_enum
 * carries 17 labels and none of them are these, and NO enum anywhere in the database carries them.
 * 0094 wrapped those statements in one BEGIN…COMMIT alongside schema/table/function/trigger DDL, so
 * anything that aborted in that transaction took the enum additions with it. 0040 added four values
 * from inside a guarded DO block and all four survive today.
 *
 * The cost was not theoretical. Migration 202610291200 had to rewrite
 * trg_auto_propose_escrow_on_abandon to compare NEW.status::text, because casting the missing
 * literals raised 22P02 and aborted EVERY load status UPDATE on mdata.loads — the whole
 * dispatched→delivered progression. driver-finance/abandonment.service.ts still writes
 * `SET status = 'abandoned'` uncast and throws.
 *
 * Every existing control said green throughout: the migration ran, the ledger row exists, CI passed.
 * That is the point of this guard. **A ledger row is not evidence that a migration had an effect.**
 *
 * WHAT IS ASSERTED (static — CI has no prod)
 *   1. a migration file exists whose ONLY statements are the three ADD VALUEs — nothing else may
 *      share its transaction, which is exactly how 0094 lost them;
 *   2. scripts/db-migrate.mjs still carries the POST-APPLY assertion that reads pg_enum after
 *      migrating and fails the deploy when a label is missing.
 *
 * The real proof runs at deploy time against the real database (see REQUIRED_ENUM_LABELS in
 * db-migrate.mjs). It cannot live here: CI's database is built from these same migrations, so it
 * would agree with itself no matter what prod actually contains — which is the trap that let this
 * sit unnoticed for months.
 */
import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";

const LABEL = "verify-load-status-enum-abandonment-values";
const MIGRATIONS_DIR = "db/migrations";
const RUNNER = "scripts/db-migrate.mjs";
const REQUIRED = ["abandoned", "driver_walkoff", "driver_no_show"];
const ENUM = "mdata.load_status_enum";

/** Strip SQL comments so a label named only in prose never counts as a statement. */
function stripComments(sql) {
  return sql.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*--[^\n]*$/gm, "");
}

/**
 * A migration qualifies only if, after removing comments, EVERY statement it contains is one of the
 * required ADD VALUEs. A file that also creates a table is exactly the 0094 shape and must not pass.
 */
export function findDedicatedEnumMigration(dir = MIGRATIONS_DIR) {
  let files = [];
  try {
    files = readdirSync(dir).filter((f) => f.endsWith(".sql")).sort();
  } catch {
    return null;
  }
  for (const f of files) {
    let sql;
    try {
      sql = stripComments(readFileSync(path.join(dir, f), "utf8"));
    } catch {
      continue;
    }
    const statements = sql.split(";").map((s) => s.trim()).filter(Boolean);
    if (statements.length === 0) continue;
    const covered = REQUIRED.filter((label) =>
      statements.some((s) => /ALTER\s+TYPE/i.test(s) && s.includes(ENUM) && /ADD\s+VALUE/i.test(s) && s.includes(`'${label}'`))
    );
    if (covered.length !== REQUIRED.length) continue;
    const foreign = statements.filter((s) => !(/ALTER\s+TYPE/i.test(s) && s.includes(ENUM) && /ADD\s+VALUE/i.test(s)));
    if (foreign.length > 0) continue; // 0094's shape — something else can roll the values back
    return f;
  }
  return null;
}

export function runnerAssertsEnumEffect(src) {
  return /REQUIRED_ENUM_LABELS/.test(src) && /pg_enum/.test(src) && /POST-APPLY CHECK FAILED/.test(src);
}

function check() {
  const errors = [];
  const migration = findDedicatedEnumMigration();
  if (!migration) {
    errors.push(
      `${MIGRATIONS_DIR}: no migration contains the three ${ENUM} ADD VALUE statements AND NOTHING ELSE. ` +
        `0094 has them but shares its transaction with table/function/trigger DDL, which is how they were ` +
        `lost. The restoring migration must stand alone.`
    );
  }
  let runner = "";
  try {
    runner = readFileSync(RUNNER, "utf8");
  } catch {
    runner = "";
  }
  if (!runner) errors.push(`${RUNNER}: missing — the post-apply effect assertion cannot be verified.`);
  else if (!runnerAssertsEnumEffect(runner)) {
    errors.push(
      `${RUNNER}: no post-apply pg_enum assertion. Without it a future migration can be marked applied ` +
        `while silently doing nothing — precisely what happened to 0094, undetected for months because ` +
        `every check looked at the ledger instead of the database.`
    );
  }
  return { errors, migration };
}

if (process.argv.includes("--selftest")) {
  const { errors } = check();
  if (errors.length) {
    console.error(`${LABEL} --selftest FAIL — real repo does not pass:`);
    for (const e of errors) console.error(`  - ${e}`);
    process.exit(1);
  }
  // Mutation 1: a runner without the post-apply assertion must be rejected.
  if (runnerAssertsEnumEffect("async function main() { await client.query('SELECT 1'); }")) {
    console.error(`${LABEL} --selftest FAIL — a runner with no post-apply assertion was accepted.`);
    process.exit(1);
  }
  // Mutation 2: a ledger-only check must NOT satisfy the assertion. This is the whole lesson —
  // "the migration is recorded applied" is what was true the entire time the labels were missing.
  if (runnerAssertsEnumEffect("const applied = await client.query('SELECT filename FROM _system._schema_migrations');")) {
    console.error(`${LABEL} --selftest FAIL — a ledger-row check was accepted as an effect assertion.`);
    process.exit(1);
  }
  // Mutation 3: the 0094 SHAPE must not qualify — ADD VALUEs sharing a transaction with other DDL.
  const { mkdtempSync, writeFileSync } = await import("node:fs");
  const os = await import("node:os");
  const tmp = mkdtempSync(path.join(os.tmpdir(), "enum-selftest-"));
  writeFileSync(
    path.join(tmp, "0001_like_0094.sql"),
    `BEGIN;\nCREATE SCHEMA IF NOT EXISTS dispatch;\n` +
      REQUIRED.map((l) => `ALTER TYPE ${ENUM} ADD VALUE IF NOT EXISTS '${l}';`).join("\n") +
      `\nCREATE TABLE IF NOT EXISTS dispatch.x (id uuid);\nCOMMIT;\n`
  );
  if (findDedicatedEnumMigration(tmp) !== null) {
    console.error(`${LABEL} --selftest FAIL — a 0094-shaped migration (ADD VALUE + other DDL) was accepted.`);
    process.exit(1);
  }
  // Mutation 4: a standalone file with only two of the three labels must not qualify.
  const tmp2 = mkdtempSync(path.join(os.tmpdir(), "enum-selftest2-"));
  writeFileSync(
    path.join(tmp2, "0001_partial.sql"),
    `ALTER TYPE ${ENUM} ADD VALUE IF NOT EXISTS 'abandoned';\nALTER TYPE ${ENUM} ADD VALUE IF NOT EXISTS 'driver_walkoff';\n`
  );
  if (findDedicatedEnumMigration(tmp2) !== null) {
    console.error(`${LABEL} --selftest FAIL — a migration missing driver_no_show was accepted.`);
    process.exit(1);
  }
  console.log(`${LABEL} --selftest PASS — 4 mutations detected; repo clean.`);
  process.exit(0);
}

const { errors, migration } = check();
if (errors.length > 0) {
  console.error(`${LABEL} FAIL — ${errors.length} problem(s):`);
  for (const e of errors) console.error(`  - ${e}`);
  process.exit(1);
}
console.log(
  `${LABEL} PASS — ${migration} carries the three ${ENUM} ADD VALUE statements and nothing else; ` +
    `${RUNNER} asserts the labels exist in pg_enum after every apply (effect, not ledger row).`
);
