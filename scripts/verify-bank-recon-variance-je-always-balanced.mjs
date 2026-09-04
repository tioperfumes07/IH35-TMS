#!/usr/bin/env node
/**
 * verify-bank-recon-variance-je-always-balanced.mjs
 *
 * BANK-F9998 F8 — "Tier-1 balanced-JE proof". MatchDrawer.tsx's own comment
 * (VARIANCE_HELD_NOTE = "Variance posting pending balanced-JE proof (Tier-1)") holds Confirm
 * disabled for any non-exact-amount match until that proof exists. This IS that proof — a static,
 * structural guarantee, not a live-data claim: match.service.ts's postDifferenceJournalEntry
 * (the only writer on this path) inserts exactly two journal_entry_postings rows for a variance
 * JE, and BOTH rows use the identical `magnitude` value for amount_cents while `cashSide` and
 * `diffSide` are, by their own definitions two lines apart, always mutually exclusive
 * (cashSide = shouldDebitCash ? 'debit' : 'credit'; diffSide is the opposite). Two lines, equal
 * magnitude, opposite sides -> SUM(debit) - SUM(credit) = 0 for ANY variance amount, by
 * construction, not by having tested every case.
 *
 * This guard proves the SOURCE still has that shape (same shared amount param on both INSERT
 * VALUES rows, complementary side variables) so nobody can silently break the invariant by, say,
 * hardcoding one side's amount independently. It does NOT flip MatchDrawer's canConfirm gate —
 * whether/when a variance match becomes live-postable in the UI is a separate, owner-reserved
 * (Tier-1 / HOLD-FOR-JORGE) decision, unaffected by this guard either way.
 *
 * Read-only, no DB connection required — pure source-text check.
 *
 * Usage:  node scripts/verify-bank-recon-variance-je-always-balanced.mjs
 *         node scripts/verify-bank-recon-variance-je-always-balanced.mjs --selftest
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const LABEL = "verify-bank-recon-variance-je-always-balanced";
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const SERVICE = path.join(ROOT, "apps/backend/src/accounting/bank-recon/match.service.ts");

/** Mirror of the shape check — pure string logic so --selftest can prove it with fixtures. */
export function checkVarianceJeBalancedShape(source) {
  const failures = [];

  const cashSideMatch = source.match(/const cashSide = shouldDebitCash \? "debit" : "credit";/);
  const diffSideMatch = source.match(/const diffSide = shouldDebitCash \? "credit" : "debit";/);
  if (!cashSideMatch || !diffSideMatch) {
    failures.push(
      "cashSide/diffSide are no longer defined as complementary opposites of the same " +
        "shouldDebitCash boolean — the two legs could end up on the SAME side, which would not " +
        "balance. Expected exactly: cashSide = shouldDebitCash ? \"debit\" : \"credit\"; " +
        "diffSide = shouldDebitCash ? \"credit\" : \"debit\";"
    );
  }

  // Both posting-line VALUES rows must reference the SAME amount placeholder ($5 today, but this
  // matches whichever placeholder is shared rather than hardcoding the number) — if a future edit
  // gives the two legs independently-computed amounts, the structural balance guarantee breaks.
  const insertBlockMatch = source.match(
    /INSERT INTO accounting\.journal_entry_postings[\s\S]{0,400}?VALUES\s*\n([\s\S]{0,600}?)RETURNING/
  );
  if (!insertBlockMatch) {
    failures.push("could not locate the two-leg journal_entry_postings INSERT ... VALUES block at all");
  } else {
    const valuesBlock = insertBlockMatch[1];
    const rows = valuesBlock
      .split("\n")
      .map((l) => l.trim())
      .filter((l) => l.startsWith("("));
    if (rows.length !== 2) {
      failures.push(`expected exactly 2 posting VALUES rows (cash leg + offset leg), found ${rows.length}`);
    } else {
      // Extract every $N placeholder used for amount_cents (5th positional column in each row).
      const amountPlaceholders = rows.map((row) => {
        const cols = row.replace(/^\(|\)[,]?$/g, "").split(",").map((c) => c.trim());
        return cols[4]; // amount_cents is the 5th column, 0-indexed 4
      });
      if (amountPlaceholders[0] !== amountPlaceholders[1]) {
        failures.push(
          `the two posting rows use DIFFERENT amount placeholders (${amountPlaceholders[0]} vs ` +
            `${amountPlaceholders[1]}) instead of sharing one magnitude value — this can post an unbalanced JE`
        );
      }
    }
  }

  return failures;
}

function runSelftest() {
  const good = `
  const cashSide = shouldDebitCash ? "debit" : "credit";
  const diffSide = shouldDebitCash ? "credit" : "debit";
  const linesRes = await client.query<{ id: string }>(
    \`
      INSERT INTO accounting.journal_entry_postings (
        operating_company_id, journal_entry_uuid, account_id, debit_or_credit, amount_cents,
        description, line_sequence, idempotency_key, created_at, updated_at
      )
      VALUES
        ($1::uuid, $2::uuid, $3::uuid, $4::text, $5::int, 'Bank reconciliation variance leg', 1, concat('bank-recon-var:', $2::text), now(), now()),
        ($1::uuid, $2::uuid, $6::uuid, $7::text, $5::int, 'Bank reconciliation offset leg',  2, concat('bank-recon-off:', $2::text), now(), now())
      RETURNING id::text
    \`,
    [input.operating_company_id, journalEntryId, cashAccountId, cashSide, magnitude, input.difference_account_id, diffSide]
  );
  `;
  if (checkVarianceJeBalancedShape(good).length !== 0) {
    throw new Error(
      "selftest: the current, correct balanced-two-leg shape must pass with zero failures — it did not: " +
        JSON.stringify(checkVarianceJeBalancedShape(good))
    );
  }

  const brokenAmounts = good
    .replace("($1::uuid, $2::uuid, $6::uuid, $7::text, $5::int,", "($1::uuid, $2::uuid, $6::uuid, $7::text, $8::int,");
  if (checkVarianceJeBalancedShape(brokenAmounts).length === 0) {
    throw new Error("selftest: two posting rows with DIFFERENT amount placeholders must be flagged — it was not");
  }

  const brokenSides = good.replace(
    'const diffSide = shouldDebitCash ? "credit" : "debit";',
    'const diffSide = shouldDebitCash ? "debit" : "credit";'
  );
  if (checkVarianceJeBalancedShape(brokenSides).length === 0) {
    throw new Error("selftest: diffSide matching cashSide instead of opposing it must be flagged — it was not");
  }

  console.log(`[${LABEL}] --selftest OK (correct shape passes; mismatched-amount and same-side mutations both correctly detected)`);
}

if (process.argv.includes("--selftest")) {
  try {
    runSelftest();
  } catch (err) {
    console.error(String(err?.message ?? err));
    process.exit(1);
  }
  process.exit(0);
}

let source;
try {
  source = fs.readFileSync(SERVICE, "utf8");
} catch (err) {
  console.error(`${LABEL} — FAILED: cannot read ${SERVICE}: ${err?.message ?? err}`);
  process.exit(1);
}

const failures = checkVarianceJeBalancedShape(source);
if (failures.length) {
  console.error(`${LABEL} — FAILED`);
  for (const f of failures) console.error(`  ✗ ${f}`);
  process.exit(1);
}

console.log(`[${LABEL}] OK — the variance JE's two posting legs share one magnitude on opposite sides, provably balanced by construction for any variance amount (Tier-1 proof, BANK-F9998 F8)`);
