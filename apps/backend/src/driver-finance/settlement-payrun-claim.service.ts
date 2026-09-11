import { assertNoHistoricalSettlementCoverage } from "./settlement-historical-attribution.service.js";
import { appendCrudAudit } from "../audit/crud-audit.js";
type Client = { query: <T = Record<string, unknown>>(sql: string, values?: unknown[]) => Promise<{ rows: T[]; rowCount?: number }> };
type Run = { id: string; journal_entry_id: string | null; status?: string };

/** Mutable idempotency anchor only: journals and the reversal/repost audit history remain immutable. */
export async function claimSettlementPayRunInClientTx(client: Client, input: {
  operatingCompanyId: string; settlementId: string; actorUserId: string;
}): Promise<{ claimed: boolean; run: Run }> {
  await assertNoHistoricalSettlementCoverage(client, input.operatingCompanyId, input.settlementId);
  const args = [input.operatingCompanyId, input.settlementId, input.actorUserId];
  const inserted = await client.query<Run>(`
    INSERT INTO driver_finance.payrun_gl_runs
      (operating_company_id, settlement_id, status, created_by_user_id)
    VALUES ($1::uuid, $2::uuid, 'posted', $3::uuid)
    ON CONFLICT (operating_company_id, settlement_id) DO NOTHING
    RETURNING id::text, journal_entry_id::text
  `, args);
  if (inserted.rows[0]) return { claimed: true, run: inserted.rows[0] };
  const previous = await client.query<Run>(`
    SELECT id::text, journal_entry_id::text, status FROM driver_finance.payrun_gl_runs
    WHERE operating_company_id = $1::uuid AND settlement_id = $2::uuid FOR UPDATE
  `, args.slice(0, 2));
  const run = previous.rows[0];
  if (!run) throw new Error("Pay-run claim disappeared");
  if (run.status !== "void") return { claimed: false, run };
  if (run.journal_entry_id) {
    const reversal = await client.query<{ id: string }>(`
      SELECT reversal.id::text FROM accounting.journal_entries original
      JOIN accounting.journal_entries reversal ON reversal.operating_company_id = original.operating_company_id
      WHERE original.id = $1::uuid AND original.operating_company_id = $2::uuid
        AND (reversal.id::text = to_jsonb(original)->>'reversed_by_je_id' OR EXISTS (
          SELECT 1 FROM accounting.transaction_source_links tsl
          JOIN accounting.journal_entry_postings jep ON jep.id = tsl.journal_entry_posting_id
          WHERE tsl.operating_company_id = original.operating_company_id
            AND tsl.linked_object_type = 'journal_entry' AND tsl.linked_object_id = original.id::text
            AND tsl.relationship_role = 'reversal_of' AND jep.journal_entry_uuid = reversal.id
        ))
        AND EXISTS (SELECT 1 FROM accounting.journal_entry_postings p
          WHERE p.journal_entry_uuid = reversal.id AND p.operating_company_id = original.operating_company_id)
      LIMIT 2
    `, [run.journal_entry_id, input.operatingCompanyId]);
    if (reversal.rows.length !== 1) throw new Error("Voided pay-run has no unique posted reversal; repost refused");
  }
  // The original JE remains in accounting.journal_entries. Its reversing JE and full dimensional
  // proof are permanently recorded by reverseSettlementPayRunInClientTx before it marks this void.
  await appendCrudAudit(client, input.actorUserId, "driver_finance.settlement.payrun_repost_started", {
    resource_type: "driver_finance.driver_settlements", resource_id: input.settlementId,
    operating_company_id: input.operatingCompanyId, run_id: run.id,
    superseded_journal_entry_id: run.journal_entry_id,
  }, "warning", "REG-040");
  const restarted = await client.query<Run>(`
    UPDATE driver_finance.payrun_gl_runs SET status = 'posted', journal_entry_id = NULL
    WHERE id = $1::uuid AND operating_company_id = $2::uuid AND status = 'void'
    RETURNING id::text, journal_entry_id::text
  `, [run.id, input.operatingCompanyId]);
  if (!restarted.rows[0]) throw new Error("Voided pay-run could not be claimed for repost");
  return { claimed: true, run: restarted.rows[0] };
}
