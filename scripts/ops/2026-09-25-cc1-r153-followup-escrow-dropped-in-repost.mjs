/**
 * ROUND 153 follow-up (self-directed, coordinator idle-wake, 10:26Z) — root-causes item 10's
 * $425.00 2100-escrow gap all the way down, and finds the real cause is much bigger than that net
 * figure: MULTIPLE "tie to AlwaysTrack total_due / settlement_control" correction JEs (this
 * session's own earlier work, already reviewed once by CC-3 as "stays hand-written, not exempted"
 * from the costs guard -- that review was about invariant-1 exemption, not about whether the
 * REPOST preserved every original line) fully REVERSED a settlement's entire original pay-run-
 * close JE, then reposted a corrected version that DROPS the escrow line entirely -- not adjusts
 * it, DROPS it. Read-only. No AUTH-<NNN> needed (measures only, writes nothing).
 *
 * METHOD: for every posted "Settlement <n> — pay-run close" JE that was itself reversed
 * (reversed_by_je_id set) and carried a 2100-00-0NN escrow line, find that same settlement number's
 * most recent NOT-reversed repost and check whether IT still carries an escrow line, and for how
 * much.
 *
 * FINDING (live, this pass): at least 18 settlements' reposts carry ZERO escrow (dropped entirely):
 * 5770, 5771, 5777, 5780, 5783, 5786, 5789, 5793, 5796, S-5797, S-5799, S-5800, S-5802, S-5805,
 * S-5806, S-5808, S-5813, S-5814 -- $2,650.00 of escrow-line amounts dropped across these instances
 * (some settlements were corrected more than once; every instance is printed, not deduplicated, so
 * this total is the gross count of drop EVENTS, not a single net balance -- item 10's own $425.00
 * figure is the NET remaining gap after other, correctly-reposted settlements for the same drivers
 * partially offset it). A smaller number of reposts instead show the escrow amount CHANGED (e.g.
 * 5769: $25.00 -> $50.00; 5775: $50.00 -> $75.00) -- these look like genuine corrections, not drops,
 * and are not flagged as defects here.
 *
 * SEPARATELY, SELF-FOUND while tracing account 2100-00-027 (Jorge Luis Infante Corona): a SIX-TIME
 * duplicate "Escrow release" posting, all sharing memo id 36ea76a6-f5b7-498d-b968-703ecadcf6db,
 * $2,500.00 debited six times ~2-14 seconds apart (2026-09-24 19:58:24 through 19:58:38) instead of
 * once -- $12,500.00 of erroneous extra debits on top of the drop above. Not investigated further
 * for other drivers/accounts in this pass; named for the same follow-up.
 *
 * NOT FIXED IN THIS PASS: correcting ~18+ settlements' escrow lines (each needs its own correct
 * amount re-derived from the ORIGINAL, already-reversed JE, then a new correcting entry posted) is
 * a substantial, careful undertaking on its own -- and touches the exact same "tie to AlwaysTrack"
 * JE family CC-2/CC-3 are actively working around tonight (the costs guard). Reported prominently,
 * not rushed through in a session tail-end pass.
 */
import pg from "pg";

const USMCA_ID = "5c854333-6ea5-4faa-af31-67cb272fef80";

function fmt(cents) {
  return `$${(Number(cents) / 100).toFixed(2)}`;
}

async function main() {
  const client = new pg.Client({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
  await client.connect();
  await client.query("BEGIN READ ONLY");
  await client.query("SET LOCAL app.bypass_rls = 'lucia'");

  const originals = await client.query(
    `SELECT je.id::text, je.memo
       FROM accounting.journal_entries je
      WHERE je.operating_company_id = $1::uuid AND je.memo LIKE 'Settlement%pay-run close%'
        AND je.status = 'posted' AND je.reversed_by_je_id IS NOT NULL
      ORDER BY je.memo`,
    [USMCA_ID]
  );

  let droppedCount = 0;
  let droppedTotalCents = 0;
  const droppedSettlements = [];

  for (const orig of originals.rows) {
    const escrowLine = await client.query(
      `SELECT a.account_number, jep.amount_cents::bigint
         FROM accounting.journal_entry_postings jep JOIN catalogs.accounts a ON a.id = jep.account_id
        WHERE jep.journal_entry_uuid = $1::uuid AND a.account_number LIKE '2100-%'`,
      [orig.id]
    );
    if (escrowLine.rows.length === 0) continue;

    const m = orig.memo.match(/^Settlement (\S+)/);
    const settlementNo = m ? m[1] : null;
    const repost = await client.query(
      `SELECT je.id::text FROM accounting.journal_entries je
        WHERE je.operating_company_id = $1::uuid AND je.memo LIKE $2 AND je.status = 'posted'
          AND je.id != $3::uuid AND je.reversed_by_je_id IS NULL
        ORDER BY je.created_at DESC LIMIT 1`,
      [USMCA_ID, `Settlement ${settlementNo} —%`, orig.id]
    );
    let repostEscrowCents = null;
    if (repost.rows[0]) {
      const repostEscrow = await client.query(
        `SELECT jep.amount_cents::bigint FROM accounting.journal_entry_postings jep JOIN catalogs.accounts a ON a.id = jep.account_id
          WHERE jep.journal_entry_uuid = $1::uuid AND a.account_number LIKE '2100-%'`,
        [repost.rows[0].id]
      );
      repostEscrowCents = repostEscrow.rows.length > 0 ? Number(repostEscrow.rows[0].amount_cents) : 0;
    }
    const origCents = Number(escrowLine.rows[0].amount_cents);
    const line = `${settlementNo}: original ${escrowLine.rows[0].account_number} ${fmt(origCents)} | repost=${repost.rows[0]?.id ?? "NONE"} repost_escrow=${repostEscrowCents === null ? "N/A" : fmt(repostEscrowCents)}`;
    console.log(line);
    if (repostEscrowCents === 0) {
      droppedCount++;
      droppedTotalCents += origCents;
      droppedSettlements.push(settlementNo);
    }
  }

  console.log(`\n--- FOLLOW-UP FINDING: ${droppedCount} repost instance(s) drop escrow entirely, ${fmt(droppedTotalCents)} total. Settlements: ${droppedSettlements.join(", ")} ---`);

  await client.query("ROLLBACK");
  await client.end();
}

main().catch((err) => {
  console.error("FAILED:", err.message);
  process.exitCode = 1;
});
