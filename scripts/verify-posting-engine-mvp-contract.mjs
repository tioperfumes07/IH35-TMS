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

  assertMatches(
    service,
    /type PostingSourceType = "invoice" \| "bill" \| "customer_payment" \| "bill_payment"/,
    "Posting source type scope is not limited to exactly four MVP types",
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
  const postFnStart = service.indexOf("export async function postSourceTransaction(");
  const postFnEnd = service.indexOf("export async function reversePostedSourceTransaction(");
  if (postFnStart < 0 || postFnEnd < 0 || postFnEnd <= postFnStart) {
    throw new Error("postSourceTransaction function boundaries not found");
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
