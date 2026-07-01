#!/usr/bin/env node
// Guard (BLOCK-03 / CHAIN-05): the bank-feed categorization → GL posting gap-closure must stay wired the
// way it was built and can't silently regress:
//   1. 'bank_categorization' is a registered PostingSourceType + a buildPostingDraft branch (reuse the ONE
//      posting engine — no new GL writer).
//   2. The line-builder derives direction from is_credit and posts Math.abs(amount_cents) — NEVER the sign
//      (money-out is stored negative). Both legs of the direction rule are present.
//   3. The categorize route calls the service; the service is gated by BANK_FEED_GL_POSTING_ENABLED and
//      keeps the three double-post interlocks (driver-advance cede, matched-bill skip, transfer skip).
//   4. No banking route/service writes journal entries inline (no `INSERT INTO accounting.journal_entries`
//      / `journal_entry_postings` outside the posting engine) — all GL flows through postSourceTransaction.
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const fail = (m) => {
  console.error(`FAIL verify-bank-feed-gl-posting: ${m}`);
  process.exit(1);
};

const engine = readFileSync(join(root, "apps/backend/src/accounting/posting-engine.service.ts"), "utf8");
const service = readFileSync(join(root, "apps/backend/src/banking/bank-feed-gl-posting.service.ts"), "utf8");
const route = readFileSync(join(root, "apps/backend/src/banking/categorization.routes.ts"), "utf8");

// 1. Source type + build branch registered in the ONE posting engine.
if (!/"bank_categorization"/.test(engine)) fail("'bank_categorization' must be a registered PostingSourceType in posting-engine.service.ts");
if (!/sourceType === "bank_categorization"\)\s*return buildBankCategorizationLines/.test(engine)) {
  fail("buildPostingDraft must route 'bank_categorization' to buildBankCategorizationLines");
}
if (!/function buildBankCategorizationLines/.test(engine)) fail("buildBankCategorizationLines must exist in posting-engine.service.ts");

// 2. Direction from is_credit, magnitude via Math.abs — never the amount_cents sign.
if (!/Math\.abs\(Number\(txn\.amount_cents/.test(engine)) fail("buildBankCategorizationLines must post Math.abs(amount_cents) (sign landmine)");
if (!/txn\.is_credit === true/.test(engine)) fail("buildBankCategorizationLines must derive direction from is_credit === true");
// The direction must NOT be decided by the sign of amount_cents anywhere in the builder.
const builder = engine.slice(engine.indexOf("function buildBankCategorizationLines"), engine.indexOf("async function buildPostingDraft"));
if (/amount_cents\s*[<>]=?\s*0/.test(builder)) fail("direction must derive from is_credit, NOT the sign of amount_cents");

// 3. Route wires the service; service gated by the OFF flag + keeps the interlocks.
if (!/maybePostBankCategorizationToGl/.test(route)) fail("categorize route must call maybePostBankCategorizationToGl");
if (!/BANK_FEED_GL_POSTING_ENABLED/.test(service)) fail("service must gate on BANK_FEED_GL_POSTING_ENABLED");
if (!/isEnabled\(/.test(service)) fail("service must resolve the flag via isEnabled (per-entity)");
if (!/reason:\s*"driver_advance_branch"/.test(service)) fail("driver-advance CEDE interlock (driver_advance_branch) must exist");
if (!/reason:\s*"already_matched_to_bill"/.test(service)) fail("matched-to-bill interlock (already_matched_to_bill) must exist");
if (!/reason:\s*"is_transfer"/.test(service)) fail("own-bank transfer interlock (is_transfer) must exist");
if (!/postSourceTransaction\(/.test(service)) fail("service must post via postSourceTransaction (reuse the engine — no new GL math)");

// 4. No inline GL writes in banking routes/services.
for (const [name, src] of [
  ["categorization.routes.ts", route],
  ["bank-feed-gl-posting.service.ts", service],
]) {
  if (/INSERT\s+INTO\s+accounting\.journal_entr/i.test(src)) {
    fail(`${name} must not write accounting.journal_entries/journal_entry_postings inline — post via the engine`);
  }
}

console.log("PASS verify-bank-feed-gl-posting");
