#!/usr/bin/env node
import fs from "node:fs";

function read(path) {
  return fs.readFileSync(path, "utf8");
}

function assertIncludes(source, needle, message) {
  if (!source.includes(needle)) throw new Error(message);
}

function assertMatches(source, regex, message) {
  if (!regex.test(source)) throw new Error(message);
}

try {
  const servicePath = "apps/backend/src/accounting/posting-engine.service.ts";
  const routesPath = "apps/backend/src/accounting/posting-engine.routes.ts";
  const testsPath = "apps/backend/src/accounting/posting-engine.service.test.ts";
  const service = read(servicePath);
  const routes = read(routesPath);
  const tests = read(testsPath);

  // CORRECTED 2026-08-03. This previously asserted the LITERAL text
  //   /type PostingSourceType = "invoice" | "bill" | "customer_payment" | "bill_payment"/
  // with the message "not limited to exactly four MVP types". The regex was UNANCHORED, so it only ever
  // matched a PREFIX — the union has carried ten source types (cash_advance, driver_advance, expense,
  // bank_categorization, driver_reimbursement, transfer, ...) for a long time while this guard stayed
  // green and reported "exactly four". It asserted something untrue, which is worse than asserting
  // nothing: it read as coverage.
  //
  // What actually matters, and what is checked now: the four MVP source types must still be DECLARED
  // (removing one would break posting for a shipped path), and the type must be DERIVED from that single
  // declaration rather than hand-maintained in parallel with the runtime validator — the duplication
  // that made a half-applied source type possible in the first place.
  // Scope the membership check to the ARRAY LITERAL. A first attempt used
  // /POSTING_SOURCE_TYPES[\s\S]*?"<type>"/ against the whole file — mutation-testing showed that passed
  // even with "customer_payment" DELETED from the array, because the lazy span simply reached a later
  // occurrence elsewhere in the file. A guard that matches anywhere in a file is not a membership check.
  const sourceTypesBlock = /export const POSTING_SOURCE_TYPES = \[([\s\S]*?)\] as const;/.exec(service);
  if (!sourceTypesBlock) {
    throw new Error("POSTING_SOURCE_TYPES array literal not found — the single source of posting types is gone");
  }
  for (const mvpType of ["invoice", "bill", "customer_payment", "bill_payment"]) {
    assertIncludes(
      sourceTypesBlock[1],
      `"${mvpType}"`,
      `MVP posting source type "${mvpType}" is no longer declared in POSTING_SOURCE_TYPES`,
    );
  }
  assertMatches(
    service,
    /export type PostingSourceType = \(typeof POSTING_SOURCE_TYPES\)\[number\]/,
    "PostingSourceType is no longer DERIVED from POSTING_SOURCE_TYPES — a hand-written union can drift from the runtime validator",
  );
  assertMatches(
    service,
    /INVOICE_ELIGIBLE_STATUSES = new Set\(\["sent", "partial", "paid", "factored"\]\)/,
    "Invoice eligibility map does not match MVP decisions",
  );
  assertIncludes(
    service,
    "ih35:posting-mvp:v1",
    "Idempotency key prefix format is missing",
  );
  assertIncludes(
    service,
    "getExistingPostingResultByIdempotencyKey(",
    "Service-level idempotency pre-check helper is missing",
  );
  // P1-BILLPAY-GL extracted the posting body into executePostingOnClient (client-accepting, so payBill can
  // post atomically in its own txn); postSourceTransaction is now a thin wrapper. The idempotency-before-
  // batch-insert invariant lives in executePostingOnClient — check it there (invariant unchanged, relocated).
  const postFnStart = service.indexOf("async function executePostingOnClient(");
  const postFnEnd = service.indexOf("export async function postSourceTransactionInClientTx(");
  if (postFnStart < 0 || postFnEnd < 0 || postFnEnd <= postFnStart) {
    throw new Error("executePostingOnClient function boundaries not found");
  }
  const postFnSource = service.slice(postFnStart, postFnEnd);
  const existingIdx = postFnSource.indexOf("const existing = await getExistingPostingResultByIdempotencyKey(");
  const insertBatchIdx = postFnSource.indexOf("INSERT INTO accounting.posting_batches");
  if (existingIdx < 0 || insertBatchIdx < 0 || existingIdx > insertBatchIdx) {
    throw new Error("Idempotency pre-check must run before posting batch insert");
  }
  assertIncludes(
    service,
    "runPostingEngineMvpBackfill",
    "Backlog backfill path is missing",
  );
  assertIncludes(
    routes,
    "/api/v1/accounting/posting-engine-mvp/backfill",
    "Backfill route is missing",
  );
  assertIncludes(
    tests,
    "INVOICE_NOT_POSTING_ELIGIBLE",
    "Contract test for ineligible invoice rejection is missing",
  );
  assertIncludes(
    tests,
    "already_posted",
    "Contract test for duplicate posting prevention is missing",
  );

  console.log("✅ Posting engine MVP contract guard passed");
} catch (error) {
  console.error(`✘ ${error.message}`);
  process.exit(1);
}
