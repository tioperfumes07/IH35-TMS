#!/usr/bin/env node
/**
 * ACCT-F5723 (measured live, prod, USMCA, 2026-09-07) — postVoidReversal's reversed_by_je_id /
 * reverses_je_id FK-linking lookup (void.service.ts) required `p.posting_batch_id IS NOT NULL`, while
 * readOriginalGlPostings() — the function that finds and actually FLIPS the very same lines — was
 * already fixed under ACCT-F331 to NOT require posting_batch_id, because sub-ledger posters (e.g. the
 * revenue-recognition two-event latch) tag postings with source_transaction_type/id but never populate
 * posting_batch_id.
 *
 * Consequence, proven live: voiding invoice 13541 (load ebf7e233-b78e-48f3-bbec-2d5fdd887274, owner rate
 * correction $3,500 -> $2,500) correctly posted a balanced, net-zero reversal of the revenue-recognition
 * latch's "bill" JE (1bf5606c) via a NEW JE (df6dff65) — but reversed_by_je_id was never written on
 * 1bf5606c, because the FK-linking lookup's posting_batch_id filter matched zero rows. standingLatchJePredicate
 * (ACCT-F66) keys ONLY on journal_entries.reversed_by_je_id IS NULL to decide whether a revrec latch is
 * still "standing", so the fully-reversed, net-zero old latch JE still read as standing — and the
 * ACCT-F205 interlock in invoice-gl.service.ts refused to let the corrected, reissued invoice
 * (INV-2026-00002, $2,500) ever post its own A/R. Live effect: GL A/R for the load stayed at $0
 * (correctly net after the reversal) while the subledger correctly carried $2,500 open on the new
 * invoice — a $2,500.00 ledger.ar_tieout variance and a ledger.posted_without_posting hit, both on
 * healthz, from ONE missing FK write.
 *
 * This guard asserts the FK-linking lookup in postVoidReversal():
 *   1. Does NOT require p.posting_batch_id IS NOT NULL (the exact drift vs readOriginalGlPostings).
 *   2. Still matches on source_transaction_type + source_transaction_id, scoped to operating_company_id.
 *   3. Still excludes the just-inserted reversal JE itself (journal_entry_uuid <> reversalJeId).
 *   4. Still uses DISTINCT + LIMIT 2 and only links when exactly one candidate resolves (src.rows.length === 1)
 *      — "linked only when unambiguous" must survive this fix untouched.
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
  // Grab a generous window after the anchor — the SQL template literal plus bind array.
  return source.slice(idx, idx + 900);
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

  if (!/DISTINCT/i.test(block) || !/LIMIT\s+2/i.test(block)) {
    fail("the FK-linking lookup no longer uses DISTINCT + LIMIT 2 — 'linked only when unambiguous' depends on this shape");
  } else {
    ok("still uses DISTINCT + LIMIT 2 (unambiguous-match detection preserved)");
  }

  const afterBlockIdx = source.indexOf(extractSrcBlock(source));
  const tail = source.slice(afterBlockIdx, afterBlockIdx + 1600);
  if (!/src\.rows\.length\s*===\s*1/.test(tail)) {
    fail("the caller no longer requires src.rows.length === 1 before linking — ambiguous matches must stay unlinked");
  } else {
    ok("still requires exactly one unambiguous match before writing reversed_by_je_id/reverses_je_id");
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
          WHERE p.operating_company_id = $1::uuid
            AND p.source_transaction_type = $3
            AND p.source_transaction_id = $2
            AND p.journal_entry_uuid <> $4::uuid
          LIMIT 2
        \`,
        [params.operatingCompanyId, params.entityId, params.entityType, reversalJeId]
      );
      if (src.rows.length === 1 && src.rows[0]?.je_id) {
        // link both directions
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
