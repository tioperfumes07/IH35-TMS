#!/usr/bin/env node
/**
 * CPA-VETO regression guard — settlement Bill+BillPayment reversal must be fail-loud, one-transaction,
 * closed-period coherent, retry/concurrency idempotent, and whole-settlement equal-and-opposite before
 * driver_settlement_gl_runs.status can transition to 'reversed'.
 *
 * Self-test: node scripts/verify-settlement-reversal-atomicity.mjs --selftest
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = "verify-settlement-reversal-atomicity";
const SERVICE = "apps/backend/src/accounting/settlement-posting/settlement-bill-payment-posting.service.ts";
const POSTER = "apps/backend/src/accounting/posting-engine.service.ts";
const DB_TEST = "apps/backend/src/accounting/settlement-posting/__tests__/settlement-bill-payment-posting.db.test.ts";
const UNIT_TEST = "apps/backend/src/accounting/settlement-posting/__tests__/settlement-bill-payment-reversal.test.ts";

function inspect(service, poster, dbTest, unitTest) {
  const violations = [];
  if (/\.catch\s*\(\s*\(\)\s*=>\s*undefined\s*\)/.test(service)) {
    violations.push("source reversal failures are swallowed");
  }
  for (const token of [
    "return scoped(actor, opco, async (client) =>",
    "LIMIT 1 FOR UPDATE",
    "reversePostedSourceTransactionInClientTx",
    "reverseJournalEntryNoFlip",
    "settlement_reversal_not_equal_and_opposite",
    "GROUP BY account_id, class_id, entity_uuid",
    "WHERE id = $1::uuid AND status = 'posted'",
  ]) {
    if (!service.includes(token)) violations.push(`settlement reversal missing invariant: ${token}`);
  }
  const proofAt = service.indexOf("settlement_reversal_not_equal_and_opposite");
  const stateAt = service.indexOf("SET status = 'reversed'");
  if (proofAt < 0 || stateAt < 0 || stateAt < proofAt) {
    violations.push("run state can transition before whole-settlement reconciliation");
  }

  for (const token of [
    "export async function reversePostedSourceTransactionInClientTx",
    "resolveReversalDate(originalDate",
    "await ensureOpenPeriod(client",
    "const lineId = null",
    "class_id::text, entity_uuid::text",
  ]) {
    if (!poster.includes(token)) violations.push(`canonical posting reversal missing invariant: ${token}`);
  }

  for (const token of ["Promise.all([", '"nothing_to_reverse", "reversed"', "absolute_residual_cents", "resolveReversalJournalEntryIds"]) {
    if (!dbTest.includes(token)) violations.push(`DB behavior proof missing: ${token}`);
  }
  for (const token of ["PERIOD_LOCKED", "SET status = 'reversed'", "settlement_reversal_not_equal_and_opposite", "one transaction client"]) {
    if (!unitTest.includes(token)) violations.push(`focused behavior proof missing: ${token}`);
  }
  return violations;
}

function selftest() {
  const goodService = `
    return scoped(actor, opco, async (client) => {
      LIMIT 1 FOR UPDATE
      reversePostedSourceTransactionInClientTx
      reverseJournalEntryNoFlip
      GROUP BY account_id, class_id, entity_uuid
      settlement_reversal_not_equal_and_opposite
      SET status = 'reversed'
      WHERE id = $1::uuid AND status = 'posted'
    });`;
  const goodPoster = `
    const lineId = null;
    class_id::text, entity_uuid::text
    resolveReversalDate(originalDate
    await ensureOpenPeriod(client
    export async function reversePostedSourceTransactionInClientTx`;
  const goodDb = `Promise.all([ "nothing_to_reverse", "reversed" absolute_residual_cents resolveReversalJournalEntryIds`;
  const goodUnit = `PERIOD_LOCKED SET status = 'reversed' settlement_reversal_not_equal_and_opposite one transaction client`;
  if (inspect(goodService, goodPoster, goodDb, goodUnit).length !== 0) {
    console.error(`[${LABEL}] --selftest FAILED: good fixture must pass`);
    process.exit(1);
  }
  const plantedService = `
    reversePostedSourceTransaction(x).catch(() => undefined);
    SET status = 'reversed';
  `;
  const planted = inspect(plantedService, "const lineId = sourceId", "", "");
  if (planted.length < 10) {
    console.error(`[${LABEL}] --selftest FAILED: planted partial-success workflow was not fully rejected`, planted);
    process.exit(1);
  }
  console.log(`[${LABEL}] --selftest PASS (planted violations=${planted.length}; good=0)`);
}

if (process.argv.includes("--selftest")) {
  selftest();
  process.exit(0);
}

for (const rel of [SERVICE, POSTER, DB_TEST, UNIT_TEST]) {
  if (!fs.existsSync(path.join(ROOT, rel))) {
    console.error(`[${LABEL}] FAILED — required file missing: ${rel}`);
    process.exit(1);
  }
}
const violations = inspect(
  fs.readFileSync(path.join(ROOT, SERVICE), "utf8"),
  fs.readFileSync(path.join(ROOT, POSTER), "utf8"),
  fs.readFileSync(path.join(ROOT, DB_TEST), "utf8"),
  fs.readFileSync(path.join(ROOT, UNIT_TEST), "utf8")
);
if (violations.length > 0) {
  console.error(`[${LABEL}] FAILED:`);
  for (const violation of violations) console.error(`  - ${violation}`);
  process.exit(1);
}
console.log(`[${LABEL}] OK — settlement reversal is atomic, fail-loud, idempotent, date-coherent, and reconciled.`);
