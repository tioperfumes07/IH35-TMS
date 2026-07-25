#!/usr/bin/env node
/**
 * BANK-LINK-01 (ranked FAIL BANK-F04) guard — banking.bank_transactions counterparty columns must
 * carry a real, SAME-ENTITY foreign key into mdata.vendors / mdata.customers, not a bare uuid that only
 * resolves by application convention.
 *
 * The regression this exists to stop: categorization_vendor_id / categorization_customer_id shipped in
 * migration 0165 as bare `uuid` columns with no constraint. The categorize backend has always written
 * and JOINed them against mdata.vendors/mdata.customers correctly, so nothing ever LOOKED broken — but
 * nothing at the database layer stopped a bank line from resolving to another entity's vendor/customer,
 * or from pointing at a row that never existed. verify-bank-surfaces-and-counterparty.mjs (step 1441)
 * already asserts the CODE side (writes + JOINs); this guard asserts the missing DB-schema half: the
 * migration that turns those columns into a real, entity-safe constraint. A single-column FK would pass
 * a naive "has an FK" check while still allowing a cross-entity leak, so this guard demands the
 * SAME-ENTITY composite form (mirrors verify-expense-category-fk-wired.mjs / ACCT-LINK-04).
 *
 *   node scripts/verify-bank-link-01-counterparty-fk.mjs
 *   node scripts/verify-bank-link-01-counterparty-fk.mjs --selftest
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = "verify-bank-link-01-counterparty-fk";

const MIGRATION = "db/migrations/202608050000_bank_link_01_counterparty_same_entity_fk.sql";
const HELD_LEDGER = "db/migrations/.held-migrations.json";
const CATEGORIZE_ROUTES = "apps/backend/src/banking/categorization.routes.ts";

function read(rel, failures) {
  const abs = path.join(ROOT, rel);
  if (!fs.existsSync(abs)) {
    failures.push(`missing ${rel}`);
    return "";
  }
  return fs.readFileSync(abs, "utf8");
}

const UUID_LITERAL_RE = /'[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}'/i;

function checkMigration(sql, failures) {
  if (!sql) return;

  if (!/HOLD-FOR-JORGE/.test(sql) || !/DO NOT RUN ON PROD/.test(sql)) {
    failures.push(`${MIGRATION}: must carry the HOLD-FOR-JORGE / DO NOT RUN ON PROD marker (financial cluster)`);
  }

  if (!/ADD CONSTRAINT bank_tx_categorization_vendor_same_entity_fkey/.test(sql)) {
    failures.push(`${MIGRATION}: must add bank_tx_categorization_vendor_same_entity_fkey`);
  }
  if (
    !/FOREIGN KEY \(operating_company_id, categorization_vendor_id\)\s*REFERENCES mdata\.vendors \(operating_company_id, id\)/.test(
      sql
    )
  ) {
    failures.push(
      `${MIGRATION}: the vendor FK must be the SAME-ENTITY composite (operating_company_id, categorization_vendor_id) -> mdata.vendors (operating_company_id, id)`
    );
  }

  if (!/ADD CONSTRAINT bank_tx_categorization_customer_same_entity_fkey/.test(sql)) {
    failures.push(`${MIGRATION}: must add bank_tx_categorization_customer_same_entity_fkey`);
  }
  if (
    !/FOREIGN KEY \(operating_company_id, categorization_customer_id\)\s*REFERENCES mdata\.customers \(operating_company_id, id\)/.test(
      sql
    )
  ) {
    failures.push(
      `${MIGRATION}: the customer FK must be the SAME-ENTITY composite (operating_company_id, categorization_customer_id) -> mdata.customers (operating_company_id, id)`
    );
  }

  if (!/uq_vendors_company_id/.test(sql)) {
    failures.push(`${MIGRATION}: mdata.vendors needs UNIQUE (operating_company_id, id) to be referenced`);
  }
  if (!/uq_customers_company_id/.test(sql)) {
    failures.push(`${MIGRATION}: mdata.customers needs UNIQUE (operating_company_id, id) to be referenced`);
  }

  if (!/RAISE EXCEPTION/.test(sql) || !/ORPHAN/.test(sql)) {
    failures.push(
      `${MIGRATION}: must fail loud (RAISE EXCEPTION) on a pre-existing orphan/cross-entity pointer instead of silently skipping the constraint (Rule 16)`
    );
  }

  if (!/IF NOT EXISTS/.test(sql) || !(sql.match(/pg_constraint/g) || []).length) {
    failures.push(`${MIGRATION}: FK/UNIQUE adds must be guarded via pg_constraint IF NOT EXISTS (idempotent, apply-twice safe)`);
  }

  if (/\bDROP TABLE\b|\bDELETE FROM\b|\bDROP COLUMN\b/i.test(sql)) {
    failures.push(`${MIGRATION}: never-delete law — this migration must be purely additive`);
  }

  if (/\bDISABLE ROW LEVEL SECURITY\b/i.test(sql)) {
    failures.push(`${MIGRATION}: must never disable RLS — inherits the tables' existing FORCE RLS`);
  }

  if (UUID_LITERAL_RE.test(sql)) {
    failures.push(`${MIGRATION}: no hardcoded UUID literal — this migration seeds no rows, so none is legitimate here`);
  }

  if (!/categorization_memo/.test(sql)) {
    failures.push(`${MIGRATION}: header must document that categorization_memo (display value) is retained untouched`);
  }
}

function checkHeldLedger(ledgerRaw, failures) {
  if (!ledgerRaw) return;
  let ledger;
  try {
    ledger = JSON.parse(ledgerRaw);
  } catch {
    failures.push(`${HELD_LEDGER}: not valid JSON`);
    return;
  }
  const held = Array.isArray(ledger.held) ? ledger.held : [];
  const entry = held.find((h) => h.file === "202608050000_bank_link_01_counterparty_same_entity_fk.sql");
  if (!entry) {
    failures.push(`${HELD_LEDGER}: missing registration for 202608050000_bank_link_01_counterparty_same_entity_fk.sql`);
  } else if (!/HOLD-FOR-JORGE/.test(entry.reason || "")) {
    failures.push(`${HELD_LEDGER}: registered entry must carry the HOLD-FOR-JORGE marker in its reason`);
  }
}

function checkCategorizeRoutes(src, failures) {
  if (!src) return;
  for (const col of ["categorization_vendor_id", "categorization_customer_id"]) {
    if (!src.includes(col)) failures.push(`${CATEGORIZE_ROUTES}: must still write/read ${col} (memo-retained, FK-backed)`);
  }
}

function collectFailures(files) {
  const failures = [];
  checkMigration(files.migration, failures);
  checkHeldLedger(files.ledger, failures);
  checkCategorizeRoutes(files.routes, failures);
  return failures;
}

function selftest() {
  const good = {
    migration: `
      -- HOLD-FOR-JORGE — TIER 1 · FINANCIAL CLUSTER
      -- DO NOT RUN ON PROD until owner Neon-applies.
      -- categorization_memo (display text) untouched/retained.
      DO $$ BEGIN
        IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'uq_vendors_company_id') THEN
          ALTER TABLE mdata.vendors ADD CONSTRAINT uq_vendors_company_id UNIQUE (operating_company_id, id);
        END IF;
      END $$;
      DO $$ BEGIN
        IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'uq_customers_company_id') THEN
          ALTER TABLE mdata.customers ADD CONSTRAINT uq_customers_company_id UNIQUE (operating_company_id, id);
        END IF;
      END $$;
      DO $$ BEGIN
        IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'bank_tx_categorization_vendor_same_entity_fkey') THEN
          IF EXISTS (SELECT 1 FROM banking.bank_transactions WHERE 1=0) THEN
            RAISE EXCEPTION 'E_BANK_TX_VENDOR_ORPHAN: orphan';
          END IF;
          ALTER TABLE banking.bank_transactions
            ADD CONSTRAINT bank_tx_categorization_vendor_same_entity_fkey
            FOREIGN KEY (operating_company_id, categorization_vendor_id)
            REFERENCES mdata.vendors (operating_company_id, id);
        END IF;
      END $$;
      DO $$ BEGIN
        IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'bank_tx_categorization_customer_same_entity_fkey') THEN
          IF EXISTS (SELECT 1 FROM banking.bank_transactions WHERE 1=0) THEN
            RAISE EXCEPTION 'E_BANK_TX_CUSTOMER_ORPHAN: orphan';
          END IF;
          ALTER TABLE banking.bank_transactions
            ADD CONSTRAINT bank_tx_categorization_customer_same_entity_fkey
            FOREIGN KEY (operating_company_id, categorization_customer_id)
            REFERENCES mdata.customers (operating_company_id, id);
        END IF;
      END $$;
    `,
    ledger: JSON.stringify({
      held: [
        {
          file: "202608050000_bank_link_01_counterparty_same_entity_fk.sql",
          reason: "[HOLD-FOR-JORGE — TIER 1] test",
        },
      ],
    }),
    routes: "categorization_vendor_id\ncategorization_customer_id\n",
  };

  if (collectFailures(good).length) {
    console.error(`${LABEL} SELFTEST FAILED — good fixture rejected:`);
    for (const f of collectFailures(good)) console.error(`  - ${f}`);
    process.exit(1);
  }

  const singleColumnFk = {
    ...good,
    migration: good.migration.replace(
      /FOREIGN KEY \(operating_company_id, categorization_vendor_id\)[\s\S]*?REFERENCES mdata\.vendors \(operating_company_id, id\);/,
      "FOREIGN KEY (categorization_vendor_id) REFERENCES mdata.vendors (id);"
    ),
  };
  if (!collectFailures(singleColumnFk).some((f) => f.includes("SAME-ENTITY composite"))) {
    console.error(`${LABEL} SELFTEST FAILED — a cross-entity single-column vendor FK was not caught`);
    process.exit(1);
  }

  const noOrphanCheck = { ...good, migration: good.migration.replace(/RAISE EXCEPTION[^;]*;/g, "") };
  if (!collectFailures(noOrphanCheck).some((f) => f.includes("fail loud"))) {
    console.error(`${LABEL} SELFTEST FAILED — a missing orphan-check RAISE EXCEPTION was not caught`);
    process.exit(1);
  }

  const notRegistered = { ...good, ledger: JSON.stringify({ held: [] }) };
  if (!collectFailures(notRegistered).some((f) => f.includes("missing registration"))) {
    console.error(`${LABEL} SELFTEST FAILED — an unregistered held migration was not caught`);
    process.exit(1);
  }

  const droppedTable = { ...good, migration: good.migration + "\nDROP TABLE banking.bank_transactions;" };
  if (!collectFailures(droppedTable).some((f) => f.includes("never-delete"))) {
    console.error(`${LABEL} SELFTEST FAILED — a DROP TABLE was not caught`);
    process.exit(1);
  }

  const hardcodedUuid = {
    ...good,
    migration: good.migration + "\n-- seed '11111111-1111-1111-1111-111111111111'::uuid\n",
  };
  if (!collectFailures(hardcodedUuid).some((f) => f.includes("hardcoded UUID"))) {
    console.error(`${LABEL} SELFTEST FAILED — a hardcoded UUID literal was not caught`);
    process.exit(1);
  }

  const noHoldMarker = { ...good, migration: good.migration.replace("HOLD-FOR-JORGE", "").replace("DO NOT RUN ON PROD", "") };
  if (!collectFailures(noHoldMarker).some((f) => f.includes("HOLD-FOR-JORGE"))) {
    console.error(`${LABEL} SELFTEST FAILED — a missing HOLD-FOR-JORGE marker was not caught`);
    process.exit(1);
  }

  console.log(`${LABEL}: selftest PASS`);
}

if (process.argv.includes("--selftest")) {
  selftest();
  process.exit(0);
}

const failures = [];
const files = {
  migration: read(MIGRATION, failures),
  ledger: read(HELD_LEDGER, failures),
  routes: read(CATEGORIZE_ROUTES, failures),
};
failures.push(...collectFailures(files));

if (failures.length) {
  console.error(`${LABEL}: FAIL`);
  for (const f of failures) console.error(`  - ${f}`);
  process.exit(1);
}
console.log(
  `${LABEL}: PASS — banking.bank_transactions -> mdata.vendors/mdata.customers same-entity FK declared (BUILD-AND-HOLD; not yet Neon-applied)`
);
process.exit(0);
