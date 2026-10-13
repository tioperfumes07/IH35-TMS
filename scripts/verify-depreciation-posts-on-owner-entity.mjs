#!/usr/bin/env node
/**
 * verify-depreciation-posts-on-owner-entity (FLT-04)
 *
 * FINDING: postDepreciation selected/posted JEs on input.operatingCompanyId and never read
 * owner_operating_company_id. Depreciation must book on the TITLE-HOLDER (TRK), distinct from the
 * lessee (TRANSP) that books lease expense.
 *
 * Usage: node scripts/verify-depreciation-posts-on-owner-entity.mjs [--selftest]
 */
import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";

const SRC = "apps/backend/src/accounting/amortization-posting/amortization-posting.service.ts";

export function assertOwnerBooks(src) {
  const problems = [];
  const fnStart = src.indexOf("export async function postDepreciation");
  if (fnStart < 0) {
    problems.push("postDepreciation not found");
    return problems;
  }
  // Bound to next exported function if present
  const nextExport = src.indexOf("\nexport async function ", fnStart + 1);
  const body = nextExport > 0 ? src.slice(fnStart, nextExport) : src.slice(fnStart);

  if (!/owner_operating_company_id/.test(body)) {
    problems.push("postDepreciation must SELECT / read owner_operating_company_id");
  }
  if (!/booksCompanyId/.test(body) && !/OWNER_BOOKS_MISSING/.test(body)) {
    problems.push("postDepreciation must resolve booksCompanyId from owner_operating_company_id (or fail OWNER_BOOKS_MISSING)");
  }
  // JE path must use owner books — not only input.operatingCompanyId for insertJournalEntryHeader
  if (!/insertJournalEntryHeader\s*\(\s*[\s\S]*?booksCompanyId/.test(body)) {
    problems.push("insertJournalEntryHeader must receive booksCompanyId (owner books)");
  }
  // 443.99: ROUND 300 (fadc8e0c28) replaced the existing-post lookup findExistingPostedJe with resolvePostingAttempt
  // (attempt keys after a reversal). The law is unchanged: the lookup runs on the owner's books.
  if (!/(?:findExistingPostedJe|resolvePostingAttempt)\s*\(\s*client\s*,\s*booksCompanyId\b/.test(body)) {
    problems.push("the existing-post lookup (resolvePostingAttempt / findExistingPostedJe) must receive booksCompanyId (owner books)");
  }
  if (/(?:findExistingPostedJe|resolvePostingAttempt)\s*\(\s*client\s*,\s*input\.operatingCompanyId/.test(body)) {
    problems.push("the existing-post lookup still runs on input.operatingCompanyId");
  }
  if (!/buildDepreciationIdempotencyKey\s*\(\s*booksCompanyId/.test(body)) {
    problems.push("idempotency key must be scoped to booksCompanyId (owner books)");
  }
  // Planted defect: JE still only on input.operatingCompanyId
  if (
    /insertJournalEntryHeader\s*\(\s*\n?\s*client,\s*\n?\s*input\.operatingCompanyId/.test(body) &&
    !/insertJournalEntryHeader\s*\(\s*\n?\s*client,\s*\n?\s*booksCompanyId/.test(body)
  ) {
    problems.push("insertJournalEntryHeader still posts on input.operatingCompanyId only");
  }
  return problems;
}

function run() {
  const abs = resolve(process.cwd(), SRC);
  if (!existsSync(abs)) {
    console.error(`FAIL: ${SRC} missing`);
    return false;
  }
  const problems = assertOwnerBooks(readFileSync(abs, "utf8"));
  if (problems.length) {
    console.error(`[verify-depreciation-posts-on-owner-entity] FAILED — ${problems.length}:`);
    for (const p of problems) console.error(`  ✗ ${p}`);
    return false;
  }
  console.log("[verify-depreciation-posts-on-owner-entity] OK — depreciation JE books on owner entity");
  return true;
}

function selftest() {
  const good = `
export async function postDepreciation() {
  SELECT owner_operating_company_id::text
  const booksCompanyId = asset.owner_operating_company_id;
  if (!booksCompanyId) throw new AmortizationPostingError("OWNER_BOOKS_MISSING", "...");
  buildDepreciationIdempotencyKey(booksCompanyId, input.assetId, row.period_number);
  findExistingPostedJe(client, booksCompanyId, idempotencyKey);
  insertJournalEntryHeader(
          client,
          booksCompanyId,
          row.period_date,
  );
}
export async function other() {}
`;
  const bad = `
export async function postDepreciation() {
  findExistingPostedJe(client, input.operatingCompanyId, idempotencyKey);
  insertJournalEntryHeader(
          client,
          input.operatingCompanyId,
          row.period_date,
  );
}
export async function other() {}
`;
  // ROUND 300 shape: resolvePostingAttempt on owner books passes; on input.operatingCompanyId fails.
  const goodR300 = good.replace("findExistingPostedJe(client, booksCompanyId, idempotencyKey);", "const attempt = await resolvePostingAttempt(client, booksCompanyId, buildDepreciationIdempotencyKey(booksCompanyId, input.assetId, row.period_number));");
  const badR300 = goodR300.replace("resolvePostingAttempt(client, booksCompanyId", "resolvePostingAttempt(client, input.operatingCompanyId");
  if (goodR300 === good || badR300 === goodR300) { console.error("SELFTEST SETUP FAILED"); process.exit(1); }
  if (assertOwnerBooks(good).length || !assertOwnerBooks(bad).length || assertOwnerBooks(goodR300).length || !assertOwnerBooks(badR300).length) {
    console.error("SELFTEST FAIL", assertOwnerBooks(good), assertOwnerBooks(bad), assertOwnerBooks(goodR300), assertOwnerBooks(badR300));
    process.exit(1);
  }
  console.log("SELFTEST PASS");
}

if (process.argv.includes("--selftest")) selftest();
else process.exit(run() ? 0 : 1);
