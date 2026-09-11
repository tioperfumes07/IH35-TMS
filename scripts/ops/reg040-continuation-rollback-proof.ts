// Existing real settlement only. Always ROLLBACK; no commit mode, no fixture creation, no booking.
import fs from "node:fs";
import assert from "node:assert/strict";
import pg from "pg";
const url = fs.readFileSync("/tmp/gpt-reg040-proof-connection", "utf8").trim();
process.env.DATABASE_URL = url;
process.env.DATABASE_DIRECT_URL = url;
const { reopenSettlementForContinuationInClientTx } = await import("../../apps/backend/src/driver-finance/settlement-continuation.service.js");
const { stampTripClosedForBookendedSettlement } = await import("../../apps/backend/src/driver-finance/settlements-load-bookended.service.js");
const { closeSettlementPayRun } = await import("../../apps/backend/src/driver-finance/settlement-payrun-close.service.js");
const company = "5c854333-6ea5-4faa-af31-67cb272fef80";
const settlement = "035cbd68-e76b-42a6-9f5a-c7ab7cf6328a";
const load = "43809ccf-30c9-487b-bef8-28822ed83a77";
const actor = "e4117991-d2c0-406d-8cda-74e98d95bccd";
const payment = "81f95ee0-fb05-4b73-a0b6-867e02ed2117";
const db = new pg.Client({ connectionString: url });
const client = { query: async (sql: string, values?: unknown[]) => {
  if (/\bCOMMIT\b/i.test(sql)) throw new Error("COMMIT prohibited in rollback proof");
  return db.query(sql, values);
} };
await db.connect();
async function scope() {
  await db.query("BEGIN");
  await db.query("SET LOCAL app.bypass_rls = 'lucia'");
  await db.query("SET LOCAL lock_timeout = '5s'");
  await db.query("SET LOCAL statement_timeout = '45s'");
  await db.query("SELECT set_config('app.operating_company_id', $1, true), set_config('app.user_uuid', $2, true)", [company, actor]);
}
async function snapshot() {
  const r = await db.query(`SELECT
    (SELECT to_jsonb(s) FROM driver_finance.driver_settlements s WHERE s.id=$1 AND s.operating_company_id=$2) AS settlement,
    (SELECT to_jsonb(r) FROM driver_finance.payrun_gl_runs r WHERE r.settlement_id=$1 AND r.operating_company_id=$2) AS run,
    (SELECT count(*)::int FROM accounting.journal_entries WHERE operating_company_id=$2) AS journal_count,
    (SELECT count(*)::int FROM accounting.journal_entry_postings WHERE operating_company_id=$2) AS posting_count,
    (SELECT count(*)::int FROM driver_finance.settlement_lines WHERE settlement_id=$1) AS line_count,
    (SELECT jsonb_agg(to_jsonb(p) ORDER BY p.id) FROM accounting.journal_entry_postings p
      WHERE p.journal_entry_uuid=(SELECT journal_entry_id FROM driver_finance.payrun_gl_runs WHERE settlement_id=$1 AND operating_company_id=$2)) AS current_postings,
    (SELECT jsonb_agg(to_jsonb(e) ORDER BY e.id) FROM accounting.escrow_postings e WHERE e.source_id=$1 AND e.operating_company_id=$2) AS escrow_postings,
    (SELECT jsonb_agg(to_jsonb(c) ORDER BY c.id) FROM accounting.company_settlements c
      JOIN accounting.company_settlement_driver_settlements link ON link.company_settlement_id=c.id
      WHERE link.driver_settlement_id=$1 AND c.operating_company_id=$2) AS company_settlements`, [settlement, company]);
  return r.rows[0];
}
let baseline: Awaited<ReturnType<typeof snapshot>>;
try {
  await scope();
  baseline = await snapshot();
  assert.equal(baseline.settlement.is_sample_data, false);
  assert.equal(baseline.settlement.first_load_id, load);
  assert.equal(baseline.run.status, "posted");
  const originalJe = baseline.run.journal_entry_id;
  await reopenSettlementForContinuationInClientTx(client as never, { operatingCompanyId: company, settlementId: settlement, loadId: load, actorUserId: actor });
  const reopened = await snapshot();
  assert.equal(reopened.settlement.id, baseline.settlement.id);
  assert.equal(reopened.settlement.display_id, baseline.settlement.display_id);
  assert.equal(reopened.settlement.first_load_id, load);
  assert.equal(reopened.run.status, "void");
  // Real original bill/lines only: existing close materializes idempotently and recomputes totals.
  const closeStamp = await stampTripClosedForBookendedSettlement(client as never, { operatingCompanyId: company, settlementId: settlement, actorUserId: actor });
  const args = { operatingCompanyId: company, settlementId: settlement, paymentMethodId: payment };
  const first = await closeSettlementPayRun(args, { userId: actor }, { client: client as never });
  assert.equal(first.result, "posted");
  assert.notEqual(first.journal_entry_id, originalJe);
  const afterPost = await snapshot();
  assert.equal(afterPost.journal_count - baseline.journal_count, 2);
  const originalPostings = await db.query("SELECT jsonb_agg(to_jsonb(p) ORDER BY p.id) AS postings FROM accounting.journal_entry_postings p WHERE p.journal_entry_uuid=$1 AND p.operating_company_id=$2", [originalJe, company]);
  assert.deepEqual(originalPostings.rows[0].postings, baseline.current_postings);
  const retry = await closeSettlementPayRun(args, { userId: actor }, { client: client as never });
  const afterRetry = await snapshot();
  assert.equal(retry.journal_entry_id, first.journal_entry_id);
  assert.equal(afterRetry.journal_count, afterPost.journal_count);
  assert.equal(afterRetry.posting_count, afterPost.posting_count);
  assert.equal(afterRetry.line_count, afterPost.line_count);
  const balance = await db.query(`SELECT journal_entry_uuid::text AS id,
    SUM(CASE WHEN debit_or_credit='debit' THEN amount_cents ELSE -amount_cents END)::text AS imbalance
    FROM accounting.journal_entry_postings WHERE operating_company_id=$1
      AND journal_entry_uuid=ANY($2::uuid[]) GROUP BY journal_entry_uuid`, [company, [originalJe, first.journal_entry_id]]);
  assert.equal(balance.rows.length, 2);
  for (const row of balance.rows) assert.equal(row.imbalance, "0");
  console.log(JSON.stringify({ proof: "existing real original load replay, NOT a new NB booking", settlement_id: settlement, display_id: baseline.settlement.display_id,
    original_journal: originalJe, reposted_journal: first.journal_entry_id, close_stamp: closeStamp,
    preserved_identity: true, repost_balanced: true, retry_created_journals: 0, journal_delta: afterPost.journal_count-baseline.journal_count }));
} finally {
  await db.query("ROLLBACK");
  if (baseline!) {
    await scope();
    const restored = await snapshot();
    assert.deepEqual(restored, baseline!);
    console.log(JSON.stringify({ rollback_verified: true, settlement_and_run_unchanged: true, journal_and_posting_counts_unchanged: true }));
    await db.query("ROLLBACK");
  }
  await db.end();
}
