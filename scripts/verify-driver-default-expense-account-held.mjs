#!/usr/bin/env node
/**
 * verify-driver-default-expense-account-held.mjs
 *
 * GUARD banking-b4: the driver-keyed default-account mapping migration
 * (mdata.drivers.default_expense_account_id) must stay a HELD, additive, recommendation-only change:
 *   - migration file exists, carries the DO-NOT-RUN-ON-PROD marker, and is registered in
 *     db/migrations/.held-migrations.json (so it can never silently fire on a prod deploy)
 *   - column is ADD COLUMN IF NOT EXISTS (idempotent), FK -> catalogs.accounts ON DELETE SET NULL
 *   - the column comment declares RECOMMENDATION ONLY (Option-B law — pre-fill, never auto-post)
 *
 * Usage:
 *   node scripts/verify-driver-default-expense-account-held.mjs
 *   node scripts/verify-driver-default-expense-account-held.mjs --selftest
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = "verify-driver-default-expense-account-held";
const MIGRATION = "db/migrations/202607680000_drivers_default_expense_account.sql";
const REGISTRY = "db/migrations/.held-migrations.json";

/** Pure checks — takes text so --selftest can inject fixtures. */
export function check({ migration, registry }) {
  const f = [];

  if (!migration) {
    f.push(`${MIGRATION}: missing`);
  } else {
    if (!/DO NOT RUN ON PROD/i.test(migration.slice(0, 1200))) {
      f.push(`${MIGRATION}: header must carry the DO NOT RUN ON PROD marker (held migration law)`);
    }
    if (!/ALTER TABLE mdata\.drivers\s+ADD COLUMN IF NOT EXISTS default_expense_account_id uuid REFERENCES catalogs\.accounts\(id\) ON DELETE SET NULL/.test(migration)) {
      f.push(`${MIGRATION}: must ADD COLUMN IF NOT EXISTS default_expense_account_id uuid FK catalogs.accounts ON DELETE SET NULL`);
    }
    if (!/RECOMMENDATION ONLY/.test(migration)) {
      f.push(`${MIGRATION}: must declare RECOMMENDATION ONLY (Option-B: pre-fill, user overrides, never auto-post)`);
    }
    if (/UPDATE\s+accounting\.|INSERT INTO accounting\./i.test(migration)) {
      f.push(`${MIGRATION}: must not write accounting.* (mapping is master-data only, no GL)`);
    }
  }

  if (!registry) {
    f.push(`${REGISTRY}: missing`);
  } else {
    let parsed;
    try {
      parsed = JSON.parse(registry);
    } catch {
      f.push(`${REGISTRY}: invalid JSON`);
      return f;
    }
    const entry = (parsed.held || []).find((h) => h.file === path.basename(MIGRATION));
    if (!entry) {
      f.push(`${REGISTRY}: ${path.basename(MIGRATION)} must be registered as held (or db:migrate fires it on prod)`);
    } else if (!/HOLD-FOR-JORGE/.test(String(entry.reason ?? ""))) {
      f.push(`${REGISTRY}: held entry reason must carry HOLD-FOR-JORGE`);
    }
  }

  return f;
}

export function run() {
  const read = (rel) => {
    try {
      return fs.readFileSync(path.join(ROOT, rel), "utf8");
    } catch {
      return null;
    }
  };
  return check({ migration: read(MIGRATION), registry: read(REGISTRY) });
}

if (process.argv.includes("--selftest")) {
  const goodMigration = `-- [HOLD-FOR-JORGE — TIER 1] banking-b4
-- *** DO NOT RUN ON PROD. ***
-- RECOMMENDATION ONLY
ALTER TABLE mdata.drivers
  ADD COLUMN IF NOT EXISTS default_expense_account_id uuid REFERENCES catalogs.accounts(id) ON DELETE SET NULL;`;
  const goodRegistry = JSON.stringify({
    held: [{ file: "202607680000_drivers_default_expense_account.sql", reason: "[HOLD-FOR-JORGE — TIER 1] banking-b4" }],
  });

  const checks = [
    ["healthy held migration passes", check({ migration: goodMigration, registry: goodRegistry }).length === 0],
    [
      "lost DO-NOT-RUN marker caught",
      check({ migration: goodMigration.replace("DO NOT RUN ON PROD", "safe"), registry: goodRegistry }).some((x) =>
        x.includes("DO NOT RUN ON PROD"),
      ),
    ],
    [
      "unregistered held migration caught",
      check({ migration: goodMigration, registry: JSON.stringify({ held: [] }) }).some((x) =>
        x.includes("must be registered"),
      ),
    ],
    [
      "non-idempotent / wrong FK caught",
      check({
        migration: goodMigration.replace("ADD COLUMN IF NOT EXISTS", "ADD COLUMN"),
        registry: goodRegistry,
      }).some((x) => x.includes("ADD COLUMN IF NOT EXISTS")),
    ],
    [
      "GL write in mapping migration caught",
      check({
        migration: goodMigration + "\nINSERT INTO accounting.journal_entries VALUES (1);",
        registry: goodRegistry,
      }).some((x) => x.includes("accounting")),
    ],
  ];

  const failed = checks.filter(([, ok]) => !ok);
  if (failed.length) {
    console.error(`${LABEL} --selftest FAIL:`);
    for (const [n] of failed) console.error("  ✗ " + n);
    process.exit(1);
  }
  console.log(`${LABEL} --selftest PASS (${checks.length} checks)`);
  process.exit(0);
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  const f = run();
  if (f.length) {
    console.error(`${LABEL} FAIL:`);
    for (const x of f) console.error("  ✗ " + x);
    process.exit(1);
  }
  console.log(`${LABEL}: OK — banking-b4 driver default-account mapping is held, registered, additive, recommendation-only`);
  process.exit(0);
}
