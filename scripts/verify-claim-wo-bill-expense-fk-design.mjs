#!/usr/bin/env node
/**
 * Accounting audit ranked-PR queue item 12/22 — "Claim→WO→Bill/Expense FKs" (HOLD financial + Neon).
 *
 * This is a DESIGN-ONLY guard for a held migration — it cannot query live Neon (no DB credentials in
 * CI for this HOLD lane), so it fails CLOSED on the static evidence instead: the migration must exist,
 * carry the DO-NOT-RUN marker, be registered as held, add EXACTLY the three documented
 * insurance_claim_id FK columns (maintenance.work_orders, accounting.bills, accounting.expenses ->
 * insurance.claim(id) ON DELETE SET NULL), and must not smuggle in any GL/JE write, backfill, or flag
 * flip. It also asserts the honest gap this migration is designed to close is still documented in the
 * claim graph API (apps/backend/src/insurance/claim.routes.ts) — if that comment disappears without
 * the columns actually existing on prod, someone silently deleted the evidence of the gap instead of
 * closing it.
 *
 * Until Jorge Neon-applies db/migrations/202607740000_claim_wo_bill_expense_fk_linkage.sql and
 * ledger-backfills, insurance_claim_id does NOT exist on any of the three tables on prod. This guard
 * proves the DESIGN is correct and safely held — it does NOT prove the columns are live. See
 * docs/trackers/DESIGN-HOLD-ACCT-CLAIM-WO-BILL-FK-2026-07-22.md for the Neon-apply ceremony + exact SQL.
 *
 * Self-test: node scripts/verify-claim-wo-bill-expense-fk-design.mjs --selftest
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = "verify-claim-wo-bill-expense-fk-design";
const MIGRATION_PATH = "db/migrations/202607740000_claim_wo_bill_expense_fk_linkage.sql";
const REGISTRY_PATH = "db/migrations/.held-migrations.json";
const CLAIM_ROUTES_PATH = "apps/backend/src/insurance/claim.routes.ts";

const TARGETS = [
  { table: "maintenance.work_orders", idx: "idx_work_orders_insurance_claim" },
  { table: "accounting.bills", idx: "idx_bills_insurance_claim" },
  { table: "accounting.expenses", idx: "idx_expenses_insurance_claim" },
];

/**
 * @param {{ migration: string | null, registry: string | null, claimRoutes: string }} sources
 * @returns {string[]}
 */
export function computeFailures(sources) {
  const errors = [];
  const { migration, registry, claimRoutes } = sources;

  if (!migration) {
    errors.push(`${MIGRATION_PATH}: missing`);
  } else {
    if (!/DO NOT RUN ON PROD/i.test(migration.slice(0, 2000))) {
      errors.push(`${MIGRATION_PATH}: header must carry the DO NOT RUN ON PROD marker (held migration law)`);
    }
    for (const { table } of TARGETS) {
      const addRe = new RegExp(
        `ALTER TABLE ${table.replace(".", "\\.")}\\s+ADD COLUMN IF NOT EXISTS insurance_claim_id uuid REFERENCES insurance\\.claim\\(id\\) ON DELETE SET NULL`,
      );
      if (!addRe.test(migration)) {
        errors.push(`${MIGRATION_PATH}: must ADD COLUMN IF NOT EXISTS insurance_claim_id uuid REFERENCES insurance.claim(id) ON DELETE SET NULL on ${table}`);
      }
    }
    for (const { table, idx } of TARGETS) {
      const idxRe = new RegExp(`CREATE INDEX IF NOT EXISTS ${idx}\\s+ON ${table.replace(".", "\\.")} \\(insurance_claim_id\\)`);
      if (!idxRe.test(migration)) {
        errors.push(`${MIGRATION_PATH}: must CREATE INDEX IF NOT EXISTS ${idx} on ${table}(insurance_claim_id)`);
      }
    }
    // Must never widen scope to a bare `claim_id` (naming drift vs the insurance_claim_id convention
    // already used by legal.matters / safety.accident_reports / safety.incidents).
    if (/ADD COLUMN IF NOT EXISTS claim_id\b/.test(migration)) {
      errors.push(`${MIGRATION_PATH}: must use insurance_claim_id, not bare claim_id (naming drift vs established convention)`);
    }
    if (/INSERT INTO accounting\.|UPDATE accounting\.|journal_entries|_ENABLED\s*=\s*(true|'on'|1)\b/i.test(migration)) {
      errors.push(`${MIGRATION_PATH}: must not write accounting.*/journal_entries or flip a feature flag — pure schema linkage, no GL posting`);
    }
    if (/insurance_claim_id uuid NOT NULL\b/.test(migration)) {
      errors.push(`${MIGRATION_PATH}: new insurance_claim_id columns must be nullable (all-NULL on add so the inline FK holds trivially — no backfill required)`);
    }
  }

  if (!registry) {
    errors.push(`${REGISTRY_PATH}: missing`);
  } else {
    let parsed;
    try {
      parsed = JSON.parse(registry);
    } catch {
      errors.push(`${REGISTRY_PATH}: invalid JSON`);
      return errors;
    }
    const entry = [...(parsed.held || []), ...(parsed.applied_held || [])].find(
      (h) => h.file === path.basename(MIGRATION_PATH)
    );
    if (!entry) {
      errors.push(`${REGISTRY_PATH}: ${path.basename(MIGRATION_PATH)} must be registered as held (or db:migrate fires it on prod)`);
    } else if (!/HOLD-FOR-JORGE/.test(String(entry.reason ?? ""))) {
      errors.push(`${REGISTRY_PATH}: held entry reason must carry HOLD-FOR-JORGE`);
    }
  }

  // The design's own justification is the honest gap documented in the claim graph API. If that
  // comment vanishes while the migration is still held/unapplied, the gap's evidence was deleted
  // instead of the gap being closed — a false-fixed regression.
  if (!/no accounting\.expenses\.claim_id \(or equivalent\) on prod/.test(claimRoutes)) {
    errors.push(`${CLAIM_ROUTES_PATH}: the documented gaps.expense honest-gap string must remain until this migration is actually Neon-applied (removing it without applying the migration would misrepresent the gap as closed)`);
  }
  if (!/no maintenance\.work_orders\.claim_id on prod/.test(claimRoutes)) {
    errors.push(`${CLAIM_ROUTES_PATH}: the documented gaps.work_order honest-gap string must remain until this migration is actually Neon-applied`);
  }

  return errors;
}

function read(rel) {
  try {
    return fs.readFileSync(path.join(ROOT, rel), "utf8");
  } catch {
    return null;
  }
}

function goodFixture() {
  const columnBlock = (table, idx) => `
ALTER TABLE ${table}
  ADD COLUMN IF NOT EXISTS insurance_claim_id uuid REFERENCES insurance.claim(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS ${idx}
  ON ${table} (insurance_claim_id)
  WHERE insurance_claim_id IS NOT NULL;
`;
  return {
    migration: `-- [HOLD-FOR-JORGE — TIER 1 · FINANCIAL CLUSTER] DO NOT RUN ON PROD
BEGIN;
${TARGETS.map((t) => columnBlock(t.table, t.idx)).join("\n")}
COMMIT;
`,
    registry: JSON.stringify({
      held: [{ file: "202607740000_claim_wo_bill_expense_fk_linkage.sql", reason: "[HOLD-FOR-JORGE — TIER 1] design" }],
    }),
    claimRoutes: `
        gaps: {
          expense: "no accounting.expenses.claim_id (or equivalent) on prod",
          work_order: "no maintenance.work_orders.claim_id on prod",
          settlement_deduction: "no driver_finance.driver_settlement_deductions.source claim FK on prod",
        },
`,
  };
}

function selftest() {
  const good = goodFixture();
  const goodFails = computeFailures(good);
  if (goodFails.length !== 0) {
    console.error(`${LABEL} selftest FAIL: good fixture rejected:`, goodFails);
    process.exit(1);
  }

  const cases = [
    ["migration", (f) => { f.migration = f.migration.replace("DO NOT RUN ON PROD", "safe"); }, "DO NOT RUN ON PROD"],
    ["migration", (f) => { f.migration = f.migration.replace("ADD COLUMN IF NOT EXISTS insurance_claim_id uuid REFERENCES insurance.claim(id) ON DELETE SET NULL;\n\nCREATE INDEX IF NOT EXISTS idx_bills_insurance_claim", "ADD COLUMN insurance_claim_id uuid REFERENCES insurance.claim(id) ON DELETE SET NULL;\n\nCREATE INDEX IF NOT EXISTS idx_bills_insurance_claim"); }, "accounting.bills"],
    ["migration", (f) => { f.migration = f.migration.replace(/CREATE INDEX IF NOT EXISTS idx_expenses_insurance_claim[\s\S]*?insurance_claim_id IS NOT NULL;\n/, ""); }, "idx_expenses_insurance_claim"],
    ["migration", (f) => { f.migration += "\nALTER TABLE maintenance.work_orders ADD COLUMN IF NOT EXISTS claim_id uuid;"; }, "naming drift"],
    ["migration", (f) => { f.migration += "\nINSERT INTO accounting.journal_entries VALUES (1);"; }, "no GL posting"],
    ["migration", (f) => { f.migration = f.migration.replace("REFERENCES insurance.claim(id) ON DELETE SET NULL;\n\nCREATE INDEX IF NOT EXISTS idx_work_orders_insurance_claim", "NOT NULL REFERENCES insurance.claim(id) ON DELETE SET NULL;\n\nCREATE INDEX IF NOT EXISTS idx_work_orders_insurance_claim"); }, "must be nullable"],
    ["registry", (f) => { f.registry = JSON.stringify({ held: [] }); }, "must be registered as held"],
    ["registry", (f) => { f.registry = JSON.stringify({ held: [{ file: "202607740000_claim_wo_bill_expense_fk_linkage.sql", reason: "not a hold" }] }); }, "must carry HOLD-FOR-JORGE"],
    ["claimRoutes", (f) => { f.claimRoutes = f.claimRoutes.replace('expense: "no accounting.expenses.claim_id (or equivalent) on prod",', ""); }, "gaps.expense"],
    ["claimRoutes", (f) => { f.claimRoutes = f.claimRoutes.replace('work_order: "no maintenance.work_orders.claim_id on prod",', ""); }, "gaps.work_order"],
  ];

  const problems = [];
  for (const [key, mutate, expectFragment] of cases) {
    const fixture = goodFixture();
    mutate(fixture);
    const failures = computeFailures(fixture);
    if (!failures.some((msg) => msg.includes(expectFragment))) {
      problems.push(`planted regression in ${key} ("${expectFragment}") was NOT caught`);
    }
  }

  if (problems.length) {
    console.error(`${LABEL} SELFTEST FAILED:`);
    for (const p of problems) console.error("  •", p);
    process.exit(1);
  }
  console.log(`✓ ${LABEL} --selftest OK — good fixture passes; ${cases.length} planted regressions all caught`);
}

function main() {
  if (process.argv.includes("--selftest")) {
    selftest();
    return;
  }

  const sources = {
    migration: read(MIGRATION_PATH),
    registry: read(REGISTRY_PATH),
    claimRoutes: read(CLAIM_ROUTES_PATH) ?? "",
  };

  const failures = computeFailures(sources);
  if (failures.length > 0) {
    console.error(`✗ ${LABEL}: FAIL`);
    for (const f of failures) console.error(`  - ${f}`);
    process.exit(1);
  }
  console.log(`✓ ${LABEL}: Claim→WO→Bill/Expense FK design (12/22) held + registered; honest gap still documented pending Neon-apply.`);
}

main();
