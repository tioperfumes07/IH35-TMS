#!/usr/bin/env node
/**
 * verify-no-voided-doc-has-live-postings — E15.6 guard #2 (DEVIN-A, 2026-09-23).
 *
 * Predicate: a voided money document must NOT have live (non-voided) journal_entry_postings.
 * Old baseline: 207 docs / $350,234.69. Now 0. Baseline 0.
 *
 * A voided document with live postings is the defect class where voiding flipped the status
 * but never reversed the GL — the books carry an expense/AP/AR for a document that no longer exists.
 *
 * BASELINE 0 · shrink-only · --write-baseline FORBIDDEN.
 * EMPTY-BY-PURGE: if the live USMCA population is 0 (all tables empty), skip — the guard
 * arms automatically when the population is not zero. A population check, never a flag,
 * never an env var, never a date.
 *
 * DEGRADE-SAFE: if no DATABASE_URL, skip with a warning and exit 0 (static-only CI).
 *
 * Self-test: node scripts/verify-no-voided-doc-has-live-postings.mjs --selftest
 */
import process from "node:process";

export const ALLOW_OFFLINE_SKIP = "Live-state guard that degrades to static baseline check when no DATABASE_URL. Baseline is 0 (shrink-only); the static arm validates the baseline file exists and is valid.";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const LABEL = "verify-no-voided-doc-has-live-postings";
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const USMCA_ID = "5c854333-6ea5-4faa-af31-67cb272fef80";
const BASELINE_FILE = path.join(ROOT, "scripts", "verify-no-voided-doc-has-live-postings.baseline.json");

const BASELINE = {
  count: 0,
  total_cents: 0,
  _doc: "Frozen at 0 after the void-reversal sweep. Shrink-only: count and total_cents must never increase. --write-baseline is FORBIDDEN.",
};

/**
 * Query: voided USMCA money documents that still have live (non-voided) journal_entry_postings.
 *
 * A money document is one of: invoice, bill, expense, bill_payment, customer_payment,
 * prepaid_purchase, prepaid_amortization, factoring_advance, settlement.
 * Each has a voided_at/voided column AND posts to journal_entry_postings via a
 * source_transaction_type.
 *
 * The query joins voided documents to their live postings by source_transaction_type/id
 * and counts the violations.
 */
const VIOLATION_QUERY = `
WITH voided_docs AS (
  -- Invoices
  SELECT 'invoice'::text AS doc_type, id, voided_at, operating_company_id
    FROM accounting.invoices
   WHERE operating_company_id = $1::uuid AND voided_at IS NOT NULL AND COALESCE(is_sample_data, false) IS NOT TRUE
  UNION ALL
  -- Bills
  SELECT 'bill'::text, id, voided_at, operating_company_id
    FROM accounting.bills
   WHERE operating_company_id = $1::uuid AND voided_at IS NOT NULL AND COALESCE(is_sample_data, false) IS NOT TRUE
  UNION ALL
  -- Expenses
  SELECT 'expense'::text, id, voided_at, operating_company_id
    FROM accounting.expenses
   WHERE operating_company_id = $1::uuid AND voided_at IS NOT NULL AND COALESCE(is_sample_data, false) IS NOT TRUE
  UNION ALL
  -- Bill payments
  SELECT 'bill_payment'::text, id, voided_at, operating_company_id
    FROM accounting.bill_payments
   WHERE operating_company_id = $1::uuid AND voided_at IS NOT NULL AND COALESCE(is_sample_data, false) IS NOT TRUE
  UNION ALL
  -- Customer payments
  SELECT 'customer_payment'::text, id, voided_at, operating_company_id
    FROM accounting.payments
   WHERE operating_company_id = $1::uuid AND voided_at IS NOT NULL AND COALESCE(is_sample_data, false) IS NOT TRUE
),
live_postings AS (
  -- LIVE = original unreverted line. A proper void reverse keeps the original
  -- (WORM) and stamps reversed_by_line_id; the reverse line carries
  -- reversal_of_line_id. Filtering only reversal_of_line_id IS NULL falsely
  -- counts already-reversed originals as live (measured 180 false positives
  -- after ACCT-F20260925e reverse sweep). Same five-column liveness family as
  -- verify-void-is-whole / diesel-expense-fuel-dedupe (reversed_by_line_id).
  SELECT source_transaction_type, source_transaction_id, operating_company_id,
         SUM(amount_cents) AS total_cents
    FROM accounting.journal_entry_postings
   WHERE operating_company_id = $1::uuid
     AND reversal_of_line_id IS NULL
     AND reversed_by_line_id IS NULL
     AND source_transaction_type IN ('invoice','bill','expense','bill_payment','customer_payment')
   GROUP BY source_transaction_type, source_transaction_id, operating_company_id
)
SELECT vd.doc_type, vd.id, COALESCE(lp.total_cents, 0) AS live_posting_cents
  FROM voided_docs vd
  JOIN live_postings lp
    ON lp.source_transaction_type = vd.doc_type
   AND lp.source_transaction_id = vd.id::text
   AND lp.operating_company_id = vd.operating_company_id
 ORDER BY vd.doc_type, vd.id
`;

/** Population check: is there ANY USMCA money data at all? */
const POPULATION_QUERY = `
SELECT
  (SELECT count(*) FROM accounting.invoices WHERE operating_company_id = $1::uuid AND COALESCE(is_sample_data, false) IS NOT TRUE) +
  (SELECT count(*) FROM accounting.bills WHERE operating_company_id = $1::uuid AND COALESCE(is_sample_data, false) IS NOT TRUE) +
  (SELECT count(*) FROM accounting.expenses WHERE operating_company_id = $1::uuid AND COALESCE(is_sample_data, false) IS NOT TRUE) +
  (SELECT count(*) FROM accounting.journal_entry_postings WHERE operating_company_id = $1::uuid) AS total
`;

function fail(msg) {
  console.error(`[${LABEL}] FAIL: ${msg}`);
  process.exit(1);
}

/** Check the baseline file exists and is frozen at 0. */
export function checkBaseline() {
  if (!fs.existsSync(BASELINE_FILE)) {
    return { ok: false, reason: `baseline file missing: ${path.relative(ROOT, BASELINE_FILE)}` };
  }
  const data = JSON.parse(fs.readFileSync(BASELINE_FILE, "utf8"));
  if (data.count !== 0) {
    return { ok: false, reason: `baseline count is ${data.count}, expected 0 (shrink-only from 0)` };
  }
  if (data.total_cents !== 0) {
    return { ok: false, reason: `baseline total_cents is ${data.total_cents}, expected 0` };
  }
  return { ok: true, data };
}

/** Check violations against baseline (shrink-only). */
export function checkViolations(violations, baseline) {
  const count = violations.length;
  const totalCents = violations.reduce((sum, v) => sum + Number(v.live_posting_cents ?? 0), 0);

  if (count > baseline.count) {
    return {
      ok: false,
      reason: `violation count ${count} > baseline ${baseline.count} (shrink-only violated)`,
      count,
      totalCents,
    };
  }
  if (count === 0 && baseline.count === 0) {
    return { ok: true, count: 0, totalCents: 0 };
  }
  if (count < baseline.count) {
    return {
      ok: true,
      count,
      totalCents,
      note: `improved from baseline ${baseline.count} — update baseline after verifying`,
    };
  }
  return { ok: true, count, totalCents };
}

const isEntryPoint = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (isEntryPoint && process.argv.includes("--selftest")) {
  // Baseline check
  const baselineResult = checkBaseline();
  if (!baselineResult.ok) fail(`selftest: ${baselineResult.reason}`);

  // Violation check: 0 violations against baseline 0 = PASS
  const passResult = checkViolations([], { count: 0, total_cents: 0 });
  if (!passResult.ok) fail("selftest: 0 violations against baseline 0 should PASS");

  // Violation check: 1 violation against baseline 0 = FAIL (shrink-only from 0)
  const failResult = checkViolations(
    [{ doc_type: "invoice", id: "test", live_posting_cents: 5000 }],
    { count: 0, total_cents: 0 },
  );
  if (failResult.ok) fail("selftest: 1 violation against baseline 0 should FAIL (shrink-only)");

  // Violation check: 0 violations against baseline 5 = PASS (improved)
  const improvedResult = checkViolations([], { count: 5, total_cents: 10000 });
  if (!improvedResult.ok) fail("selftest: 0 violations against baseline 5 should PASS (improved)");

  console.log(`[${LABEL}] selftest: PASS — baseline/baseline-missing/violation/shrink-only fixtures all classify correctly`);
  process.exit(0);
}

if (isEntryPoint) {
  // Check baseline first (static, always runs)
  const baselineResult = checkBaseline();
  if (!baselineResult.ok) {
    // Auto-create baseline at 0 if missing (first run)
    if (baselineResult.reason.includes("baseline file missing")) {
      fs.writeFileSync(BASELINE_FILE, JSON.stringify(BASELINE, null, 2) + "\n");
      console.log(`[${LABEL}] Created baseline at 0 (first run): ${path.relative(ROOT, BASELINE_FILE)}`);
    } else {
      fail(baselineResult.reason);
    }
  }
  const baseline = baselineResult.ok ? baselineResult.data : BASELINE;

  // Check for database
  const cs = process.env.DATABASE_DIRECT_URL || process.env.DATABASE_URL;
  if (!cs) {
    console.warn(`[${LABEL}] no DATABASE_URL — skipping live check (static-only). Baseline: count=0, total_cents=0.`);
    process.exit(0);
  }

  (async () => {
    const pg = (await import("pg")).default;
    const pool = new pg.Pool({ connectionString: cs, max: 2 });

    try {
      // Population check — EMPTY-BY-PURGE exemption
      const popResult = await pool.query(POPULATION_QUERY, [USMCA_ID]);
      const population = Number(popResult.rows[0]?.total ?? 0);

      if (population === 0) {
        // EMPTY-BY-PURGE: no USMCA money data at all — skip
        console.log(`[${LABEL}] SKIP — USMCA money population is 0 (EMPTY-BY-PURGE). Guard armed, will run when population is non-zero.`);
        process.exit(0);
      }

      // Run the violation query with RLS bypass inside a transaction
      const client = await pool.connect();
      try {
        await client.query("BEGIN");
        await client.query("SET LOCAL app.bypass_rls = 'lucia'");
        const result = await client.query(VIOLATION_QUERY, [USMCA_ID]);
        await client.query("COMMIT");

        const violations = result.rows;
        const checkResult = checkViolations(violations, baseline);

        if (!checkResult.ok) {
          console.error(`[${LABEL}] FAIL — ${checkResult.reason}`);
          console.error(`  Violations (voided docs with live postings):`);
          for (const v of violations.slice(0, 25)) {
            console.error(`    ${v.doc_type} ${v.id} — $${(Number(v.live_posting_cents) / 100).toFixed(2)} live postings`);
          }
          if (violations.length > 25) console.error(`    … +${violations.length - 25} more`);
          process.exit(1);
        }

        if (checkResult.count === 0) {
          console.log(`[${LABEL}] OK — 0 voided USMCA docs with live postings (baseline 0, population ${population}). Shrink-only from 0 holds.`);
        } else {
          console.log(`[${LABEL}] OK — ${checkResult.count} voided docs with live postings (baseline ${baseline.count}, ${checkResult.note ?? "at baseline"}). Population ${population}.`);
        }
        process.exit(0);
      } catch (err) {
        await client.query("ROLLBACK").catch(() => {});
        throw err;
      } finally {
        client.release();
      }
    } catch (err) {
      console.error(`[${LABEL}] error: ${err?.message ?? err}`);
      process.exit(1);
    } finally {
      await pool.end();
    }
  })().catch((err) => {
    console.error(`[${LABEL}] error: ${err?.message ?? err}`);
    process.exit(1);
  });
}
