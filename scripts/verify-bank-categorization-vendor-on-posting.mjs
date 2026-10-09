#!/usr/bin/env node
/**
 * GUARD (ROUND 442.1 BANK-F3): a categorized bank line whose categorization_vendor_id is set MUST land
 * a posting line with entity_type='vendor' and entity_uuid=<that vendor> on the category leg (the leg on
 * categorization_gl_account_id, not the bank leg). Without this, the vendor is captured at categorize
 * time and silently dropped, never appearing in vendor history, the vendor register, or 1099 totals.
 *
 * STATIC (always runs), on apps/backend/src/accounting/posting-engine.service.ts:
 *   S1 buildBankCategorizationLines SELECTs categorization_vendor_id from bank_transactions
 *   S2 the category leg (catLine) sets entity_uuid = txn.categorization_vendor_id and entity_type = 'vendor'
 *   S3 the PostingLineDraft-to-PostingLineWrite mapping passes entity_uuid and entity_type through
 *
 * LIVE (with DATABASE_URL): every posted, live bank_categorization posting where the source transaction
 * has categorization_vendor_id set must have entity_uuid populated on the category leg.
 *   L1 no category-leg posting with categorization_vendor_id set has entity_uuid NULL
 *
 * Run: node scripts/verify-bank-categorization-vendor-on-posting.mjs [--selftest]
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = "verify-bank-categorization-vendor-on-posting";
export const ALLOW_OFFLINE_SKIP = "static S1–S3 always run and fail closed; live L1 runs whenever DATABASE_URL is set";

const FILE = "apps/backend/src/accounting/posting-engine.service.ts";

export function staticProblems(src) {
  const p = [];
  // S1: categorization_vendor_id must be fetched from bank_transactions
  if (!/categorization_vendor_id::text AS categorization_vendor_id/.test(src)) {
    p.push("S1: buildBankCategorizationLines does not SELECT categorization_vendor_id from bank_transactions");
  }
  // S2a: catLine must set entity_uuid from vendor id
  if (!/entity_uuid:\s*txn\.categorization_vendor_id/.test(src)) {
    p.push("S2a: catLine does not set entity_uuid = txn.categorization_vendor_id on the category leg");
  }
  // S2b: catLine must set entity_type conditionally
  if (!/entity_type:\s*txn\.categorization_vendor_id\s*\?/.test(src)) {
    p.push("S2b: catLine does not conditionally set entity_type = 'vendor' when categorization_vendor_id is set");
  }
  // S3a: the PostingLineDraft mapping must pass entity_uuid through
  if (!/entity_uuid:\s*line\.entity_uuid/.test(src)) {
    p.push("S3a: the PostingLineDraft-to-PostingLineWrite mapping does not pass entity_uuid through");
  }
  // S3b: the PostingLineDraft mapping must pass entity_type through
  if (!/entity_type:\s*line\.entity_type/.test(src)) {
    p.push("S3b: the PostingLineDraft-to-PostingLineWrite mapping does not pass entity_type through");
  }
  return p;
}

const src = fs.readFileSync(path.join(ROOT, FILE), "utf8");

if (process.argv.includes("--selftest")) {
  const real = staticProblems(src);
  if (real.length) {
    console.error(`${LABEL} --selftest FAIL — real tree is not green:\n  - ${real.join("\n  - ")}`);
    process.exit(1);
  }
  // Prove each rule can catch its defect
  const cases = [
    ["S1", staticProblems(src.replace("categorization_vendor_id::text AS categorization_vendor_id", "/* removed */"))],
    ["S2a", staticProblems(src.replace("entity_uuid: txn.categorization_vendor_id", "entity_uuid: null"))],
    ["S2b", staticProblems(src.replace("entity_type: txn.categorization_vendor_id ?", "entity_type: null //"))],
    ["S3a", staticProblems(src.replace("entity_uuid: line.entity_uuid", "/* removed */"))],
    ["S3b", staticProblems(src.replace("entity_type: line.entity_type", "/* removed */"))],
  ];
  const missed = cases.filter(([rule, probs]) => !probs.some((x) => x.startsWith(rule))).map(([r]) => r);
  if (missed.length) {
    console.error(`${LABEL} --selftest FAIL — rules not proven to fail: ${missed.join(", ")}`);
    process.exit(1);
  }
  console.log(`${LABEL} --selftest PASS — real tree clean; ${cases.length}/${cases.length} rules proven able to fail (S1, S2a, S2b, S3a, S3b)`);
  process.exit(0);
}

const problems = staticProblems(src);
const url = process.env.DATABASE_URL;
let checked = null;
if (url) {
  const pgMod = await import("pg");
  const pg = pgMod.default ?? pgMod;
  const c = new pg.Client({ connectionString: url });
  await c.connect();
  try {
    await c.query("BEGIN READ ONLY");
    await c.query(`SET LOCAL app.bypass_rls = 'lucia'`);
    // L1: find category-leg postings where the source bt has a vendor but the posting has no entity_uuid.
    // Category leg = the leg on categorization_gl_account_id (not the bank ledger account).
    const r = await c.query(`
      SELECT count(*)::int AS n
        FROM banking.bank_transactions bt
        JOIN accounting.journal_entry_postings p
          ON p.source_transaction_type = 'bank_categorization'
         AND p.source_transaction_id   = bt.id::text
         AND p.operating_company_id    = bt.operating_company_id
         AND p.account_id              = bt.categorization_gl_account_id
         AND p.entity_uuid             IS NULL
        JOIN accounting.journal_entries je ON je.id = p.journal_entry_uuid
       WHERE bt.categorization_vendor_id IS NOT NULL
         AND je.status = 'posted'
         AND je.voided_at IS NULL
         AND je.reversed_by_je_id IS NULL
    `);
    await c.query("ROLLBACK");
    checked = Number(r.rows[0]?.n ?? 0);
    if (checked > 0) {
      problems.push(`L1: ${checked} categorized posting line(s) have categorization_vendor_id set on the bank transaction but entity_uuid NULL — run the 202610090300 backfill migration`);
    }
  } finally {
    await c.end();
  }
}
if (problems.length) {
  console.error(`${LABEL}: FAIL — ${problems.length} issue(s):`);
  for (const x of problems) console.error(`  ✗ ${x}`);
  process.exit(1);
}
console.log(`${LABEL}: OK — vendor is carried to every categorization posting${checked === null ? " (static only — no DATABASE_URL)" : `; live: ${checked} orphan(s) — 0 expected`}`);
