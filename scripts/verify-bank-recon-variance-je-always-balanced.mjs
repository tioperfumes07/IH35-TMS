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

  // ROUND 393.2 — the two legs are written by the one posting-line writer, one call per leg in a loop over a fixed
  // two-entry legs array. The structural proof is the same: exactly two legs, one on cashSide and one on diffSide, NEITHER
  // carrying its own amount, and the single writer call inside the loop posting the ONE shared magnitude for both.
  const legsMatch = source.match(/const legs = \[([\s\S]*?)\] as const;/);
  if (!legsMatch) {
    failures.push("could not locate the two-leg `const legs = [...] as const` array the variance writer loops over");
  } else {
    const entries = legsMatch[1].split("\n").map((l) => l.trim()).filter((l) => l.startsWith("{"));
    if (entries.length !== 2) {
      failures.push(`expected exactly 2 variance legs (cash leg + offset leg), found ${entries.length}`);
    } else {
      if (!/side: cashSide\b/.test(entries[0]) || !/side: diffSide\b/.test(entries[1])) {
        failures.push("the two legs are no longer one on cashSide and one on diffSide — they could post on the SAME side");
      }
      if (entries.some((e) => /amount/i.test(e))) {
        failures.push("a leg carries its OWN amount instead of sharing the one magnitude — this can post an unbalanced JE");
      }
    }
    const loop = source.match(/for \(const leg of legs\) \{([\s\S]*?)\n  \}/);
    if (!loop) {
      failures.push("could not locate the `for (const leg of legs)` loop that writes the legs");
    } else {
      if (!/amount_cents: magnitude,/.test(loop[1])) failures.push("the leg writer no longer posts the ONE shared magnitude for every leg");
      if (!/debit_or_credit: leg\.side,/.test(loop[1])) failures.push("the leg writer no longer takes each leg's side from the legs array");
      if (!/insertPostingLineWithSpine\(/.test(loop[1])) failures.push("the legs are no longer written through the one posting-line writer");
    }
  }
  return failures;
}

function runSelftest() {
  const good = `
  const cashSide = shouldDebitCash ? "debit" : "credit";
  const diffSide = shouldDebitCash ? "credit" : "debit";
  const legs = [
    { account_id: cashAccountId, side: cashSide, description: "Bank reconciliation variance leg", key: \`bank-recon-var:\${journalEntryId}\`, seq: 1 },
    { account_id: input.difference_account_id, side: diffSide, description: "Bank reconciliation offset leg", key: \`bank-recon-off:\${journalEntryId}\`, seq: 2 },
  ] as const;
  for (const leg of legs) {
    await insertPostingLineWithSpine(client, {
      debit_or_credit: leg.side,
      amount_cents: magnitude,
      description: leg.description,
    });
  }
  `;
  if (checkVarianceJeBalancedShape(good).length !== 0) {
    throw new Error(
      "selftest: the current, correct balanced-two-leg shape must pass with zero failures — it did not: " +
        JSON.stringify(checkVarianceJeBalancedShape(good))
    );
  }

  const brokenAmounts = good.replace("side: diffSide,", "side: diffSide, amount_cents: magnitude + 1,");
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

  const brokenLegSide = good.replace("side: diffSide,", "side: cashSide,");
  if (checkVarianceJeBalancedShape(brokenLegSide).length === 0) {
    throw new Error("selftest: both legs on cashSide must be flagged — it was not");
  }
  const brokenLoop = good.replace("amount_cents: magnitude,", "amount_cents: leg.seq * magnitude,");
  if (checkVarianceJeBalancedShape(brokenLoop).length === 0) {
    throw new Error("selftest: a per-leg amount in the writer loop must be flagged — it was not");
  }
  console.log(`[${LABEL}] --selftest OK (correct shape passes; per-leg amount, same-side legs, opposite-side defs and loop-amount mutations all detected)`);
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
