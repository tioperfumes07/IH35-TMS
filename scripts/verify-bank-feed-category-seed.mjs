#!/usr/bin/env node
// CI guard — bank-feed TRANSP transaction_categories seed (§7 Q2, Jorge-approved 2026-06-28).
//
// Verifies two things:
//   1. SCOPE: the seed migration only seeds TRANSP (WHERE c.code = 'TRANSP'). TRK/USMCA must
//      remain excluded until AF-1 (#1528) merges. Fails if TRK or USMCA appear in the seed.
//   2. SUGGESTION-ONLY: the migration must NOT contain any posting code, JE inserts, or GL writes.
//      Fails if it references journal_entries, posting-engine, GL_POSTING_ENABLED, or bank_accounts
//      cash_gl_account_id writes.
//
// This is a static text guard — no DB required.

import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const MIGRATION = resolve(
  "db/migrations/202606280930_bank_feed_transp_transaction_categories_seed.sql"
);

let src;
try {
  src = readFileSync(MIGRATION, "utf8");
} catch {
  console.error(`verify-bank-feed-category-seed: cannot read ${MIGRATION}`);
  process.exit(1);
}

let failed = false;

// 1. Must seed TRANSP only — TRK and USMCA must NOT appear as entity filters.
const trkSeed = /WHERE\s+c\.code\s*=\s*'TRK'/i;
const usmcaSeed = /WHERE\s+c\.code\s*=\s*'USMCA'/i;
if (trkSeed.test(src)) {
  console.error(
    `FAIL verify-bank-feed-category-seed: migration seeds TRK — HOLD until AF-1 (#1528) merges.\n` +
      `  Only TRANSP may be seeded until catalogs.accounts is per-entity.`
  );
  failed = true;
}
if (usmcaSeed.test(src)) {
  console.error(
    `FAIL verify-bank-feed-category-seed: migration seeds USMCA — HOLD until AF-1 (#1528) merges.\n` +
      `  Only TRANSP may be seeded until catalogs.accounts is per-entity.`
  );
  failed = true;
}
// Must contain the TRANSP scope filter
if (!/WHERE\s+c\.code\s*=\s*'TRANSP'/i.test(src)) {
  console.error(
    `FAIL verify-bank-feed-category-seed: migration does not contain TRANSP-scope filter.\n` +
      `  Expected: WHERE c.code = 'TRANSP'`
  );
  failed = true;
}

// 2. Suggestion-only: no GL writes, no posting, no journal entries.
const forbidden = [
  { re: /journal_entries/i, label: "journal_entries (GL write — forbidden in suggestion-only seed)" },
  { re: /journal_entry_postings/i, label: "journal_entry_postings (GL write)" },
  { re: /posting.engine/i, label: "posting-engine reference (no posting in this seed)" },
  { re: /GL_POSTING_ENABLED/i, label: "GL_POSTING_ENABLED flag (no posting in this seed)" },
  { re: /cash_gl_account_id/i, label: "cash_gl_account_id (B-1 column — HOLD until AF-1)" },
  { re: /matched_journal_entry_id/i, label: "matched_journal_entry_id (B-2 column — HOLD until AF-1)" },
];
for (const { re, label } of forbidden) {
  if (re.test(src)) {
    console.error(`FAIL verify-bank-feed-category-seed: migration references '${label}'.`);
    failed = true;
  }
}

if (failed) process.exit(1);

console.log(
  `verify-bank-feed-category-seed OK — TRANSP-only scope confirmed, suggestion-only (no GL writes) confirmed.`
);
