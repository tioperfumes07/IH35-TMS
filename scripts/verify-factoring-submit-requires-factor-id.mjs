#!/usr/bin/env node
// BANK-F9513-FACTORING-SUBMIT-NULL-FACTOR
//
// apps/backend/src/factoring/batch.service.ts's createDraftBatch resolves factor_id from
// getFactorForCustomer(customer_id, as_of_date) and writes NULL when a customer has no
// factoring-company assignment (or none active as-of that date). submitBatch previously had no
// gate on this — a draft could move straight to "submitted" (the status the funding/reserve
// pipeline treats as "actively pledged to a factor") with no factor on record at all. A batch
// "submitted to nobody" cannot actually be funded/reconciled downstream.
//
// This guard statically asserts submitBatch() selects factor_id and rejects the transition when
// it is NULL, before performing the UPDATE to status='submitted'.
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const TARGET = path.join(__dirname, "..", "apps/backend/src/factoring/batch.service.ts");

function check(src) {
  const start = src.indexOf("export async function submitBatch");
  if (start === -1) return { ok: false, reason: "submitBatch not found" };
  const end = src.indexOf("\nexport async function fundBatch", start);
  const fn = src.slice(start, end === -1 ? undefined : end);

  if (!/factor_id/.test(fn)) {
    return { ok: false, reason: "submitBatch never references factor_id at all" };
  }
  const updateIdx = fn.indexOf("SET status = 'submitted'");
  if (updateIdx === -1) return { ok: false, reason: "the status='submitted' UPDATE not found" };
  const beforeUpdate = fn.slice(0, updateIdx);
  if (!/currentRow\.factor_id/.test(beforeUpdate)) {
    return { ok: false, reason: "no check on currentRow.factor_id before the UPDATE to submitted" };
  }
  if (!/throw new FactoringBatchError/.test(beforeUpdate.slice(beforeUpdate.indexOf("currentRow.factor_id")))) {
    return { ok: false, reason: "currentRow.factor_id is referenced but doesn't guard a thrown rejection" };
  }
  return { ok: true };
}

function selftest() {
  const REGRESSED = `
export async function submitBatch(batchId, tenantId, deps) {
  const current = await deps.client.query(
    \`SELECT id::text, status FROM factoring.batch WHERE id = $1::uuid AND tenant_id = $2::uuid LIMIT 1\`,
    [batchId, tenantId]
  );
  const currentRow = current.rows[0];
  if (!currentRow) throw new FactoringBatchError("batch_not_found", 404);
  if (String(currentRow.status) === "submitted") throw new FactoringBatchError("batch_already_submitted", 409);
  if (String(currentRow.status) === "funded") throw new FactoringBatchError("batch_already_funded", 409);
  if (String(currentRow.status) !== "draft") {
    throw new FactoringBatchError("invalid_status_transition", 409, { from: String(currentRow.status), to: "submitted" });
  }
  const updated = await deps.client.query(
    \`UPDATE factoring.batch SET status = 'submitted', submitted_at = now() WHERE id = $1::uuid AND tenant_id = $2::uuid RETURNING *\`,
    [batchId, tenantId]
  );
  return mapBatchRow(updated.rows[0]);
}

export async function fundBatch(batchId, actualFundedCents, tenantId, deps) {
}
`;
  const r1 = check(REGRESSED);
  if (r1.ok) throw new Error("selftest FAILED to catch the original no-factor_id-check regression");

  const FIXED = `
export async function submitBatch(batchId, tenantId, deps) {
  const current = await deps.client.query(
    \`SELECT id::text, status, factor_id::text FROM factoring.batch WHERE id = $1::uuid AND tenant_id = $2::uuid LIMIT 1\`,
    [batchId, tenantId]
  );
  const currentRow = current.rows[0];
  if (!currentRow) throw new FactoringBatchError("batch_not_found", 404);
  if (String(currentRow.status) === "submitted") throw new FactoringBatchError("batch_already_submitted", 409);
  if (String(currentRow.status) === "funded") throw new FactoringBatchError("batch_already_funded", 409);
  if (String(currentRow.status) !== "draft") {
    throw new FactoringBatchError("invalid_status_transition", 409, { from: String(currentRow.status), to: "submitted" });
  }
  if (!currentRow.factor_id) {
    throw new FactoringBatchError("batch_factor_id_missing", 409);
  }
  const updated = await deps.client.query(
    \`UPDATE factoring.batch SET status = 'submitted', submitted_at = now() WHERE id = $1::uuid AND tenant_id = $2::uuid RETURNING *\`,
    [batchId, tenantId]
  );
  return mapBatchRow(updated.rows[0]);
}

export async function fundBatch(batchId, actualFundedCents, tenantId, deps) {
}
`;
  const r2 = check(FIXED);
  if (!r2.ok) throw new Error("selftest FAILED to accept the real fix shape: " + r2.reason);

  console.log("  selftest: OK (regression caught, fix accepted)");
}

const isSelftest = process.argv.includes("--selftest");
selftest();
if (isSelftest) {
  console.log("PASS (selftest only)");
  process.exit(0);
}

let src;
try {
  src = readFileSync(TARGET, "utf8");
} catch (err) {
  console.error(`FAIL(gated): cannot read ${TARGET}: ${err.message}`);
  process.exit(1);
}

const result = check(src);
if (!result.ok) {
  console.error(`FAIL(gated): batch.service.ts submitBatch — ${result.reason}`);
  process.exit(1);
}

console.log("PASS: submitBatch() rejects the draft->submitted transition when factor_id is NULL");
process.exit(0);
