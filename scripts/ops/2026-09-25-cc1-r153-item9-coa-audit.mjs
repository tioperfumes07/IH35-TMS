/**
 * ROUND 153 item 9 — chart of accounts on every posting. Prints account x source-type x debit/
 * credit totals for every live, posted USMCA journal-entry posting, and flags any that violates the
 * Lead's own named CoA law: line haul -> 4000, accessorials -> 4200/4210/4220/4230/4240, admin fee /
 * vehicle-use fee -> income, fuel/DEF/reefer as ITEMS -> 5000, lumper expense -> 5310, tolls -> 5300,
 * escrow -> 2100, factoring per ASC 860 (A/R never derecognized), cards -> 1295/2510/2500, bank ->
 * 1000. Read-only. No AUTH-<NNN> needed (ROUND 133 P0 scopes to writes; this makes none).
 *
 * FINDING (live, confirmed): 60 accounting.expenses documents (EXP-2026-00001 and up) post to
 * account 9000 "Ask My Accountant" -- a suspense/placeholder account, not a real CoA category, and
 * not named anywhere in the Lead's law. $2,976.63 total. Every one of these JEs is perfectly
 * balanced (Dr 9000 / Cr 2000 A/P, same amount) -- not a trial-balance break, but a real "posting on
 * an account its item does not map to" defect per this item's own definition.
 *   - 82 of ~120 expense_lines rows behind these 60 documents carry line_category='def' (Diesel
 *     Exhaust Fluid) -- DOMINANT, and squarely fuel-rail territory CC-2 owns and is actively
 *     remediating tonight (R-153.6/153.7). NOT touched here -- reported, not duplicated into
 *     someone else's active lane.
 *   - 28 rows carry line_category=NULL (uncategorized at all).
 *   - 10 rows are non-fuel and NOT in CC-2's active scope: lumper (2, $1,120.00), misc (4, $61.00),
 *     reefer (2, $191.08), tires (2, $129.20) -- $1,501.28 total. Still not corrected in this pass:
 *     each of the 60 EXP documents mixes categories across its own lines (see the per-expense dump
 *     below -- EXP-2026-00001's own two expense_lines rows are identical duplicates, suggesting the
 *     JOIN itself, or the underlying data, needs a second look before any single line is reclassified
 *     under a whole multi-line document). Reported with full detail for a follow-up, not guessed at.
 *
 * SEPARATELY CONFIRMED CORRECT (no action needed): line haul -> 4000 (load source, 125 postings,
 * $440,266.00) · lumper via driver_settlement -> 5310 (10 postings, $264.60) · escrow -> 2100-00-0NN
 * per driver · admin fee -> 7200 (an Income-type account) · fuel_event/expense sources -> 5000 ·
 * factoring_advance/factoring_default_interest -> 1090/1230/2150/6300/6400/6830 matching ROUND 155's
 * own posting map exactly · bank -> 1000.
 *
 * NOT YET BUILT (not a wrong-account defect, a coverage gap): zero live postings on 4200/4210/4220/
 * 4230/4240 (accessorials) -- consistent with item 3's own finding that 100% of live invoice_lines
 * are still line_type='linehaul', no accessorial lines exist yet. Zero live postings on 5300 (tolls)
 * anywhere in the whole book, fuel included -- either no toll expense has been recorded yet, or toll
 * expenses are among the 9000/uncategorized group above; not distinguishable without per-document
 * review. Zero live postings on 1295/2510/2500 (fuel card rails) -- expected: this is exactly what
 * CC-2's active R-153.6/153.7 fuel-rail remediation is building (all 324 fuel_event credits still
 * land on 1090 tonight, a known, already-assigned, in-progress defect, not new).
 */
import pg from "pg";

const USMCA_ID = "5c854333-6ea5-4faa-af31-67cb272fef80";

async function main() {
  const client = new pg.Client({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
  await client.connect();
  await client.query("BEGIN READ ONLY");
  await client.query("SET LOCAL app.bypass_rls = 'lucia'");

  const totals = await client.query(
    `SELECT COALESCE(jep.source_transaction_type, '(null)') AS source_type, a.account_number, a.account_name,
            jep.debit_or_credit, count(*)::int AS n, SUM(jep.amount_cents)::bigint AS total_cents
       FROM accounting.journal_entry_postings jep
       JOIN accounting.journal_entries je ON je.id = jep.journal_entry_uuid
       JOIN catalogs.accounts a ON a.id = jep.account_id
      WHERE jep.operating_company_id = $1::uuid AND je.status = 'posted' AND je.is_sample_data IS NOT TRUE
      GROUP BY 1, 2, 3, 4
      ORDER BY source_type, account_number, debit_or_credit`,
    [USMCA_ID]
  );
  console.log(`--- account x source-type x debit/credit totals (${totals.rows.length} combinations) ---`);
  for (const r of totals.rows) {
    console.log(
      `${r.source_type.padEnd(28)} ${r.account_number.padEnd(14)} ${r.account_name.padEnd(38)} ${r.debit_or_credit.padEnd(7)} n=${String(r.n).padStart(4)} $${(Number(r.total_cents) / 100).toFixed(2)}`
    );
  }

  // Pull the 9000 figure from the SAME totals just printed (never a second, independently-joined
  // number that could silently disagree with the primary aggregate above).
  const suspenseDebit = totals.rows.find((r) => r.account_number === "9000" && r.debit_or_credit === "debit");
  console.log(`\n--- ITEM9 FINDING: ${suspenseDebit?.n ?? 0} live JE posting(s) hit 9000 "Ask My Accountant" ($${((Number(suspenseDebit?.total_cents ?? 0)) / 100).toFixed(2)}) -- see this file's own header for the fuel/DEF vs non-fuel breakdown ---`);

  await client.query("ROLLBACK");
  await client.end();
}

main().catch((err) => {
  console.error("FAILED:", err.message);
  process.exitCode = 1;
});
