#!/usr/bin/env node
// ROUND 155.7 (Lead retraction 2026-09-28, "verify-every-bill-posting-carries-its-source-link.mjs
// -- a bill whose liability is in the GL with no source_transaction_id back-reference is the
// defect class. That is the permanent fix, and it is a linkage guard, not a money guard.")
//
// The original P0 measured GL ap_control at $0.00 against a $48,864.07 open-bill subledger and
// concluded money was missing. It was not: all 90 held driver-settlement bills' liability was
// already correctly posted (2170 Driver Net-Pay Clearing + 7200/1245/2100-00-* legs) -- the real
// gap was that journal_entry_postings.source_transaction_type/id on those postings still said
// 'driver_settlement'/<settlement_id>, never 'bill'/<bill_id>, so nothing could find the posting
// FROM the bill. Fixed live (AUTH-088, scripts/ops/2026-09-28-cc2-r1557-backfill-bill-posting-
// source-links.ts): one existing posting row per bill retagged, no new JE, no new amount.
//
// This guard is the regression lock: any live, non-draft, non-void bill whose liability is
// already known to be in the GL (i.e. it is a driver-settlement adoption, per
// driver_finance.driver_settlement_gl_bills) MUST have at least one journal_entry_postings row
// tagged source_transaction_type='bill' + source_transaction_id=<bill.id>. A bill missing that
// back-reference is exactly the ROUND 155.7 defect class recurring.
//
// Fails closed with no DATABASE_URL (ROUND 29.9-B pattern). Not a PURGE_WINDOW_GUARDS member --
// a 0 population here is not the purge's own empty-by-design case, it is a real instrument
// question (did the join predicate break?), so it fails loud rather than reaching for that
// exemption (verify-purge-window-exemption.mjs's closed 10-guard allowlist, on purpose).
import { requireLiveDbOrExit } from "./lib/require-live-db.mjs";

const LABEL = "verify-every-bill-posting-carries-its-source-link";
export const REQUIRES_LIVE_DB =
  "live-data money-linkage guard; fails closed via requireLiveDbOrExit with no DATABASE_URL (ROUND 29.9-B pattern)";
const USMCA_COMPANY_ID = "5c854333-6ea5-4faa-af31-67cb272fef80";

async function live() {
  const { client, pool } = await requireLiveDbOrExit({ label: LABEL });
  try {
    await client.query("BEGIN");
    await client.query("SELECT set_config('app.bypass_rls','lucia',true)");

    const populationRes = await client.query(
      `SELECT count(*) AS n
         FROM accounting.bills b
         JOIN driver_finance.driver_settlement_gl_bills g
           ON g.operating_company_id = b.operating_company_id AND g.accounting_bill_id = b.id
        WHERE b.operating_company_id = $1::uuid AND b.voided_at IS NULL AND b.revoked_at IS NULL`,
      [USMCA_COMPANY_ID]
    );
    const population = Number(populationRes.rows[0].n);
    if (population === 0) {
      console.error(`${LABEL}: LIVE FAIL — 0 driver-settlement-adopted bills; completeness discriminator says this is an instrument problem, not a real zero`);
      process.exit(1);
    }

    const badRes = await client.query(
      `SELECT b.id, b.status, b.amount_cents
         FROM accounting.bills b
         JOIN driver_finance.driver_settlement_gl_bills g
           ON g.operating_company_id = b.operating_company_id AND g.accounting_bill_id = b.id
        WHERE b.operating_company_id = $1::uuid AND b.voided_at IS NULL AND b.revoked_at IS NULL
          AND NOT EXISTS (
            SELECT 1 FROM accounting.journal_entry_postings p
             WHERE p.operating_company_id = b.operating_company_id
               AND p.source_transaction_type = 'bill' AND p.source_transaction_id = b.id::text
          )`,
      [USMCA_COMPANY_ID]
    );

    await client.query("COMMIT");

    if (badRes.rows.length > 0) {
      console.error(`${LABEL}: LIVE FAIL — ${badRes.rows.length} of ${population} driver-settlement-adopted bill(s) have no journal_entry_postings back-reference:`);
      for (const r of badRes.rows) console.error(`  ✗ ${r.id} status=${r.status} amount_cents=${r.amount_cents}`);
      process.exit(1);
    }
    console.log(`${LABEL}: LIVE PASS — all ${population} driver-settlement-adopted bill(s) carry a source_transaction_id back-reference on their GL posting.`);
  } finally {
    client.release();
    await pool.end();
  }
}

await live();
