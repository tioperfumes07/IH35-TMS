#!/usr/bin/env node
/**
 * ACCT-F5723 (measured live, prod, USMCA, 2026-09-07) — postVoidReversal's reversed_by_je_id /
 * reverses_je_id FK-linking lookup (void.service.ts) required `p.posting_batch_id IS NOT NULL`, while
 * readOriginalGlPostings() — the function that finds and actually FLIPS the very same lines — was
 * already fixed under ACCT-F331 to NOT require posting_batch_id, because sub-ledger posters (e.g. the
 * revenue-recognition two-event latch) tag postings with source_transaction_type/id but never populate
 * posting_batch_id.
 *
 * ROUND 134.1 (Lead P0): multi-JE documents (common for fuel) must get reversed_by_je_id on EVERY
 * original in the (source_transaction_type, source_transaction_id) set — not only when LIMIT 2 found
 * exactly one row. DISTINCT + ORDER BY 1 ASC; loop all src.rows; reverses_je_id names the first only.
 *
 * This guard asserts the FK-linking lookup in postVoidReversal():
 *   1. Does NOT require p.posting_batch_id IS NOT NULL (ACCT-F5723).
 *   2. Still matches on source_transaction_type + source_transaction_id, scoped to operating_company_id.
 *   3. Still excludes the just-inserted reversal JE itself (journal_entry_uuid <> reversalJeId).
 *   4. Uses DISTINCT + ORDER BY (no LIMIT 2 cap) and links when src.rows.length > 0 (ROUND 134.1).
 *
 * Run:
 *   node scripts/verify-void-reversal-links-non-batch-postings.mjs --selftest   (no DB, source-only)
 *   node scripts/verify-void-reversal-links-non-batch-postings.mjs              (asserts against the real file)
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = "verify-void-reversal-links-non-batch-postings";
const TARGET = path.join(ROOT, "apps/backend/src/accounting/void.service.ts");

function fail(msg) {
  console.error(`[${LABEL}] FAIL: ${msg}`);
  process.exitCode = 1;
}

function ok(msg) {
  console.log(`[${LABEL}] ok: ${msg}`);
}

function extractSrcBlock(source) {
  const anchor = "const src = await client.query<{ je_id: string }>(";
  const idx = source.indexOf(anchor);
  if (idx === -1) return null;
  return source.slice(idx, idx + 1200);
}

function runChecks(source) {
  const block = extractSrcBlock(source);
  if (!block) {
    fail("could not find the reversed_by_je_id FK-linking `src` query in postVoidReversal — has it moved or been renamed?");
    return;
  }

  if (/posting_batch_id\s+IS\s+NOT\s+NULL/i.test(block)) {
    fail(
      "the FK-linking `src` lookup still requires posting_batch_id IS NOT NULL — this is the exact " +
        "ACCT-F5723 regression: it silently excludes non-batch posters (the revrec latch, and any future " +
        "one) from ever getting reversed_by_je_id/reverses_je_id written, so their reversed JEs read as " +
        "'standing' forever. Match readOriginalGlPostings (ACCT-F331): do NOT require posting_batch_id."
    );
  } else {
    ok("FK-linking lookup no longer requires posting_batch_id IS NOT NULL");
  }

  if (!/source_transaction_type\s*=\s*\$3/.test(block) || !/source_transaction_id\s*=\s*\$2/.test(block)) {
    fail("the FK-linking lookup no longer matches on source_transaction_type/source_transaction_id as expected");
  } else {
    ok("still matches on source_transaction_type + source_transaction_id");
  }

  if (!/operating_company_id\s*=\s*\$1/.test(block)) {
    fail("the FK-linking lookup lost its operating_company_id scope — cross-entity leak risk");
  } else {
    ok("still scoped to operating_company_id");
  }

  if (!/journal_entry_uuid\s*<>\s*\$4/.test(block)) {
    fail("the FK-linking lookup no longer excludes the just-inserted reversal JE itself (journal_entry_uuid <> $4)");
  } else {
    ok("still excludes the just-inserted reversal JE");
  }

  if (!/DISTINCT/i.test(block)) {
    fail("the FK-linking lookup no longer uses DISTINCT — ROUND 134.1 multi-JE linking depends on it");
  } else {
    ok("still uses DISTINCT");
  }

  if (/LIMIT\s+2/i.test(block)) {
    fail("the FK-linking lookup still uses LIMIT 2 — ROUND 134.1 must link every original JE in the set, not cap at two");
  } else {
    ok("no LIMIT 2 cap (ROUND 134.1 multi-JE linking)");
  }

  if (!/ORDER\s+BY\s+1\s+ASC/i.test(block)) {
    fail("the FK-linking lookup must ORDER BY 1 ASC so reverses_je_id names the lowest-id original deterministically");
  } else {
    ok("ORDER BY 1 ASC for deterministic first original");
  }

  const afterBlockIdx = source.indexOf(block);
  const tail = source.slice(afterBlockIdx, afterBlockIdx + 2000);
  if (!/src\.rows\.length\s*>\s*0/.test(tail)) {
    fail("the caller no longer gates on src.rows.length > 0 — ROUND 134.1 must link when any original resolves");
  } else {
    ok("still gates on src.rows.length > 0 before linking");
  }

  if (!/for\s*\(\s*const\s+row\s+of\s+src\.rows\s*\)/.test(tail)) {
    fail("the caller no longer loops all src.rows to write reversed_by_je_id — ROUND 134.1 regression");
  } else {
    ok("loops every src.rows entry for reversed_by_je_id (ROUND 134.1)");
  }
}

function main() {
  const selftest = process.argv.includes("--selftest");

  if (selftest) {
    const good = `
      const src = await client.query<{ je_id: string }>(
        \`
          SELECT DISTINCT p.journal_entry_uuid::text AS je_id
          FROM accounting.journal_entry_postings p
          JOIN accounting.journal_entries je2 ON je2.id = p.journal_entry_uuid
          WHERE p.operating_company_id = $1::uuid
            AND p.source_transaction_type = $3
            AND p.source_transaction_id = $2
            AND p.journal_entry_uuid <> $4::uuid
          ORDER BY 1 ASC
        \`,
        [params.operatingCompanyId, params.entityId, params.entityType, reversalJeId]
      );
      if (src.rows.length > 0) {
        for (const row of src.rows) {
          // link reversed_by_je_id
        }
      }
    `;
    runChecks(good);

    const bad = good.replace(
      "AND p.journal_entry_uuid <> $4::uuid",
      "AND p.posting_batch_id IS NOT NULL\n            AND p.journal_entry_uuid <> $4::uuid"
    );
    const before = process.exitCode;
    process.exitCode = 0;
    runChecks(bad);
    if (process.exitCode !== 1) {
      console.error(`[${LABEL}] SELFTEST FAIL: the bad fixture (posting_batch_id restored) should have failed but did not`);
      process.exitCode = 1;
    } else {
      console.log(`[${LABEL}] selftest ok: correctly detects the regression fixture`);
      process.exitCode = before ?? 0;
    }
    return;
  }

  if (!fs.existsSync(TARGET)) {
    fail(`target file not found: ${TARGET}`);
    return;
  }
  const source = fs.readFileSync(TARGET, "utf8");
  runChecks(source);
  if (process.exitCode === 1) {
    console.error(`[${LABEL}] FAILED`);
  } else {
    console.log(`[${LABEL}] PASSED`);
  }
}

main();
