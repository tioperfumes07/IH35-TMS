/**
 * Guard: BANK-DOM-06 — fuel-card OVERAGE must reach the driver as a recoverable receivable, and it
 * must do so through the EXISTING canonical hop (no new GL math, no bespoke receivable table).
 *
 * The defect this locks out: a fleet-card purchase over the owner's authorized limit — or a non-fuel
 * item on the card — was paid in full by the company with NO recovery path at all. `overage` did not
 * exist anywhere in the codebase.
 *
 * Enforced as RULES, not as a spot-patch:
 *   1) BOTH canonical fuel writers (CSV import route + Relay ingest cron) flush the overage path
 *      after commit — a new fuel writer that skips it is caught the day it is written.
 *   2) The recovery is flag-gated on FUEL_CARD_OVERAGE_RECOVERY_ENABLED via isEnabled(...).
 *   3) The recovery REUSES createSettlementDeduction and writes NO GL: no journal-entry insert, no
 *      debit/credit line, no posting-batch. Money math stays in the FIN-18 settlement poster.
 *   4) deduction_type 'fuel' resolves to the REGISTERED `fuel_advance_recovery` role in BOTH
 *      settlement math modules. The naive `${type}_recovery` derivation yields 'fuel_recovery',
 *      which is registered NOWHERE and makes FIN-18 fail closed on every fuel deduction.
 *   5) The migration seeds the flag DEFAULT OFF, ships the idempotency UNIQUE index, and both
 *      directions of the fuel-txn <-> deduction link (Rule 14 forward + reverse).
 *
 * Run against pre-fix origin/main this FAILS (none of the files or symbols exist).
 * --selftest runs FIRST and is proven CAPABLE OF FAILING: it mutates the REAL source into each
 * defect shape, asserts each is caught, asserts no mutation was inert, and asserts the shipped
 * source is clean.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");

const OVERAGE_SERVICE = "apps/backend/src/fuel/fuel-card-overage.service.ts";
const OVERAGE_MATH = "apps/backend/src/fuel/fuel-card-overage.math.ts";
const IMPORT_ROUTES = "apps/backend/src/fuel/fuel-transaction-import.routes.ts";
const RELAY_CRON = "apps/backend/src/integrations/relay-payments/relay-fuel-ingest.cron.ts";
const DEDUCTIONS_SERVICE = "apps/backend/src/driver-finance/deductions.service.ts";
const BILL_PAY_MATH = "apps/backend/src/accounting/settlement-posting/settlement-bill-payment.math.ts";
const POSTING_MATH = "apps/backend/src/accounting/settlement-posting/settlement-posting.math.ts";
const MIGRATION = "db/migrations/202609150000_bank_dom_06_fuel_card_overage_driver_recovery.sql";

const FLAG = "FUEL_CARD_OVERAGE_RECOVERY_ENABLED";

function readFile(rel, sources) {
  if (sources && Object.prototype.hasOwnProperty.call(sources, rel)) return sources[rel];
  const abs = path.join(root, rel);
  if (!fs.existsSync(abs)) return null;
  return fs.readFileSync(abs, "utf8");
}

/** Returns an array of problem strings. Pure over `sources` so the selftest can inject mutations. */
function collectProblems(sources) {
  const problems = [];
  const need = (rel) => {
    const src = readFile(rel, sources);
    if (src === null) problems.push(`missing ${rel}`);
    return src;
  };

  const service = need(OVERAGE_SERVICE);
  const math = need(OVERAGE_MATH);
  const importRoutes = need(IMPORT_ROUTES);
  const cron = need(RELAY_CRON);
  const deductions = need(DEDUCTIONS_SERVICE);
  const billPayMath = need(BILL_PAY_MATH);
  const postingMath = need(POSTING_MATH);
  const migration = need(MIGRATION);

  // (1) Both canonical fuel writers must flush the overage path after commit.
  for (const [rel, src] of [
    [IMPORT_ROUTES, importRoutes],
    [RELAY_CRON, cron],
  ]) {
    if (src && !src.includes("flushFuelCardOverageAfterCommit")) {
      problems.push(`${rel} must call flushFuelCardOverageAfterCommit after the ingest commit`);
    }
  }

  // (2) Flag-gated, default OFF, resolved through the shared feature-flag service.
  if (service) {
    if (!service.includes(FLAG)) problems.push(`${OVERAGE_SERVICE} must gate on ${FLAG}`);
    if (!service.includes("isEnabled(")) {
      problems.push(`${OVERAGE_SERVICE} must resolve the flag via isEnabled(`);
    }
  }

  // (3) Reuse the canonical deduction writer; write NO GL from the fuel path.
  if (service) {
    if (!service.includes("createSettlementDeduction")) {
      problems.push(
        `${OVERAGE_SERVICE} must REUSE createSettlementDeduction (no bespoke receivable writer)`
      );
    }
    if (/INSERT\s+INTO\s+driver_finance\.driver_settlement_deductions/i.test(service)) {
      problems.push(
        `${OVERAGE_SERVICE} must not INSERT deductions directly — call createSettlementDeduction`
      );
    }
    for (const glTable of [
      "accounting.journal_entries",
      "accounting.journal_entry_postings",
      "accounting.posting_batches",
    ]) {
      const re = new RegExp(`INSERT\\s+INTO\\s+${glTable.replace(".", "\\.")}`, "i");
      if (re.test(service)) {
        problems.push(`${OVERAGE_SERVICE} must write NO GL — found an INSERT INTO ${glTable}`);
      }
    }
    if (/debit_or_credit/.test(service)) {
      problems.push(`${OVERAGE_SERVICE} must write NO GL math — found a debit_or_credit line`);
    }
  }

  // (3b) The overage amount itself must come from the pure, tested math module.
  if (service && !service.includes("computeFuelCardOverageCents")) {
    problems.push(`${OVERAGE_SERVICE} must derive the amount via computeFuelCardOverageCents`);
  }
  if (math && !/recover_non_fuel_purchases/.test(math)) {
    problems.push(`${OVERAGE_MATH} must key off the owner policy (recover_non_fuel_purchases)`);
  }
  // No policy -> no charge. The math must fail safe on a null policy.
  if (math && !/if\s*\(!policy\)\s*return NO_OVERAGE/.test(math)) {
    problems.push(`${OVERAGE_MATH} must return zero overage when the owner designated NO policy`);
  }

  // (4) 'fuel' must alias to the REGISTERED role in BOTH settlement math modules.
  for (const [rel, src] of [
    [BILL_PAY_MATH, billPayMath],
    [POSTING_MATH, postingMath],
  ]) {
    if (!src) continue;
    if (!/fuel_advance_recovery/.test(src)) {
      problems.push(
        `${rel} must alias deduction_type 'fuel' to the registered fuel_advance_recovery role ` +
          `('fuel_recovery' is registered nowhere and fails closed)`
      );
    }
  }

  // (5) Provenance + idempotency + both-way linkage.
  if (deductions && !deductions.includes("source_fuel_transaction_id")) {
    problems.push(`${DEDUCTIONS_SERVICE} must persist source_fuel_transaction_id provenance`);
  }
  if (migration) {
    if (!new RegExp(`'${FLAG}'`).test(migration)) {
      problems.push(`${MIGRATION} must seed the ${FLAG} flag`);
    }
    // The flag must be seeded OFF. Anchor on the QUOTED flag literal (which only appears inside the
    // INSERT ... VALUES tuple) — anchoring on the bare name would match the header comment and let a
    // `true` seed slip through.
    const quoted = `'${FLAG}'`;
    const flagAt = migration.indexOf(quoted);
    if (flagAt !== -1) {
      const tupleEnd = migration.indexOf("ON CONFLICT", flagAt);
      const tuple = migration.slice(flagAt, tupleEnd === -1 ? flagAt + 1200 : tupleEnd);
      if (/\btrue\b/i.test(tuple)) {
        problems.push(`${MIGRATION} must seed ${FLAG} DEFAULT OFF (false), never true`);
      }
      if (!/\bfalse\b/i.test(tuple)) {
        problems.push(`${MIGRATION} must explicitly seed ${FLAG} with default_enabled = false`);
      }
    }
    if (!/CREATE UNIQUE INDEX[\s\S]{0,240}source_fuel_transaction_id/i.test(migration)) {
      problems.push(
        `${MIGRATION} must ship the partial UNIQUE index on source_fuel_transaction_id ` +
          `(hard idempotency — a re-imported card file must not double-charge a driver)`
      );
    }
    if (!/overage_deduction_id/.test(migration)) {
      problems.push(`${MIGRATION} must add the REVERSE link fuel_transactions.overage_deduction_id`);
    }
    if (!/fuel_card_overage_policies/.test(migration)) {
      problems.push(`${MIGRATION} must create the owner-designated overage policy table`);
    }
  }

  return problems;
}

/* ------------------------------------------------------------------ selftest */

function selftest() {
  const baseline = collectProblems(null);
  if (baseline.length) {
    console.error("verify-fuel-card-overage-driver-recovery SELFTEST FAIL — shipped source is not clean:");
    for (const p of baseline) console.error("  - " + p);
    process.exit(1);
  }

  const real = (rel) => readFile(rel, null);

  const mutations = [
    {
      name: "import route stops flushing the overage path",
      sources: {
        [IMPORT_ROUTES]: real(IMPORT_ROUTES).replaceAll("flushFuelCardOverageAfterCommit", "noop"),
      },
    },
    {
      name: "relay cron stops flushing the overage path",
      sources: {
        [RELAY_CRON]: real(RELAY_CRON).replaceAll("flushFuelCardOverageAfterCommit", "noop"),
      },
    },
    {
      name: "flag gate removed (would charge drivers with the feature OFF)",
      sources: { [OVERAGE_SERVICE]: real(OVERAGE_SERVICE).replaceAll(FLAG, "SOME_OTHER_FLAG") },
    },
    {
      name: "isEnabled gate removed",
      sources: { [OVERAGE_SERVICE]: real(OVERAGE_SERVICE).replaceAll("isEnabled(", "alwaysOn(") },
    },
    {
      name: "bespoke deduction INSERT instead of the canonical writer",
      sources: {
        [OVERAGE_SERVICE]: real(OVERAGE_SERVICE).replace(
          "const deduction = await createSettlementDeduction(",
          "await client.query(`INSERT INTO driver_finance.driver_settlement_deductions (id) VALUES (1)`);\n      const deduction = await notTheWriter("
        ),
      },
    },
    {
      name: "new GL math smuggled into the fuel path",
      sources: {
        [OVERAGE_SERVICE]:
          real(OVERAGE_SERVICE) +
          "\n// INSERT INTO accounting.journal_entries (operating_company_id) VALUES ($1)\n",
      },
    },
    {
      name: "debit/credit line smuggled into the fuel path",
      sources: {
        [OVERAGE_SERVICE]: real(OVERAGE_SERVICE) + "\nconst x = { debit_or_credit: 'debit' };\n",
      },
    },
    {
      name: "amount no longer derived from the tested math module",
      sources: {
        [OVERAGE_SERVICE]: real(OVERAGE_SERVICE).replaceAll(
          "computeFuelCardOverageCents",
          "guessOverage"
        ),
      },
    },
    {
      name: "math charges a driver even with NO owner policy",
      sources: {
        [OVERAGE_MATH]: real(OVERAGE_MATH).replace(
          "if (!policy) return NO_OVERAGE;",
          "if (!policy) { /* charge anyway */ }"
        ),
      },
    },
    {
      name: "fuel role alias reverted in settlement-bill-payment.math (FIN-18 fails closed)",
      sources: {
        [BILL_PAY_MATH]: real(BILL_PAY_MATH).replaceAll("fuel_advance_recovery", "fuel_recovery"),
      },
    },
    {
      name: "fuel role alias reverted in settlement-posting.math (FIN-18 fails closed)",
      sources: {
        [POSTING_MATH]: real(POSTING_MATH).replaceAll("fuel_advance_recovery", "fuel_recovery"),
      },
    },
    {
      name: "deduction provenance column dropped",
      sources: {
        [DEDUCTIONS_SERVICE]: real(DEDUCTIONS_SERVICE).replaceAll("source_fuel_transaction_id", "x"),
      },
    },
    {
      name: "flag seeded ON in the migration",
      sources: {
        [MIGRATION]: real(MIGRATION).replace(
          "      false,\n      0\n    )",
          "      true,\n      0\n    )"
        ),
      },
    },
    {
      name: "idempotency UNIQUE index dropped (re-import double-charges the driver)",
      sources: {
        [MIGRATION]: real(MIGRATION).replace(
          "CREATE UNIQUE INDEX IF NOT EXISTS uq_driver_settlement_deductions_source_fuel_txn",
          "CREATE INDEX IF NOT EXISTS uq_driver_settlement_deductions_source_fuel_txn"
        ),
      },
    },
    {
      name: "reverse link dropped from the migration",
      sources: { [MIGRATION]: real(MIGRATION).replaceAll("overage_deduction_id", "unused_col") },
    },
  ];

  const inert = [];
  for (const mutation of mutations) {
    // Prove the mutation actually changed the file it targets — a no-op mutation would make the
    // selftest pass vacuously.
    let changed = false;
    for (const [rel, mutated] of Object.entries(mutation.sources)) {
      if (mutated !== real(rel)) changed = true;
    }
    if (!changed) {
      inert.push(`${mutation.name}: mutation was INERT (source unchanged)`);
      continue;
    }
    const problems = collectProblems(mutation.sources);
    if (problems.length === 0) {
      inert.push(`${mutation.name}: NOT CAUGHT by the guard`);
    }
  }

  // Two benign shapes must NOT be flagged.
  const benign = [
    {
      name: "a comment mentioning journal entries",
      sources: {
        [OVERAGE_SERVICE]:
          real(OVERAGE_SERVICE) + "\n// The FIN-18 poster owns the journal entry, not this file.\n",
      },
    },
    {
      name: "reformatted whitespace in the migration",
      sources: { [MIGRATION]: real(MIGRATION) + "\n\n-- trailing comment\n" },
    },
  ];
  for (const b of benign) {
    const problems = collectProblems(b.sources);
    if (problems.length > 0) {
      inert.push(`${b.name}: FALSE POSITIVE — ${problems.join("; ")}`);
    }
  }

  if (inert.length) {
    console.error("verify-fuel-card-overage-driver-recovery SELFTEST FAIL:");
    for (const e of inert) console.error("  - " + e);
    process.exit(1);
  }
  console.log(
    `verify-fuel-card-overage-driver-recovery SELFTEST OK — ${mutations.length} defect mutations caught, ` +
      `${benign.length} benign shapes not flagged, shipped source clean`
  );
}

/* ---------------------------------------------------------------------- main */

if (process.argv.includes("--selftest")) {
  selftest();
} else {
  const problems = collectProblems(null);
  if (problems.length) {
    console.error("verify-fuel-card-overage-driver-recovery FAIL:");
    for (const p of problems) console.error("  - " + p);
    process.exit(1);
  }
  console.log(
    "verify-fuel-card-overage-driver-recovery OK — overage flushed by both fuel writers, " +
      `${FLAG} gate present (default OFF), canonical deduction writer reused with zero GL math, ` +
      "fuel -> fuel_advance_recovery alias present, idempotency + both-way linkage shipped"
  );
}
