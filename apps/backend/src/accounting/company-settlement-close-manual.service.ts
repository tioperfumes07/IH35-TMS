// M.3 (STANDING-DIRECTIVES-2026-09-05.md §CC-1): "human-confirmed close via journal-entries.service"
// -- a standalone, explicitly human-triggered close, DISTINCT from the automatic
// closeCompanySettlementAlongsideDriverSettlement (company-settlement-close.service.ts), which only
// ever fires as a side effect inside driver-pwa/tour-close.service.ts's own transaction.
//
// CANONICAL-CHECK / "never new GL math": this function posts NO journal entry of its own. A company
// settlement is a REPORTING rollup over its linked driver settlements' own real money (the 5784
// waterfall, company-settlement-report.service.ts) -- the actual GL postings for that money are the
// driver settlements' own (driver_finance.driver_settlement_gl_bills ->
// accounting.journal_entries, written by settlement-bill-payment-posting.service.ts, the canonical
// poster). Closing a company settlement therefore means CONFIRMING that real GL work already
// happened for every driver settlement it covers -- never inventing a company-level JE, never
// re-deriving driver pay. Fail-closed: refuses to close (never silently skips) if any linked driver
// settlement has zero linked GL bills/journal entries yet.
//
// human-confirmed: the caller (route) requires an explicit confirm=true from the request body --
// this function itself also refuses a bare re-entry without it, so it can never be reached by an
// automated/background path the way the tour-close-triggered sibling can.

type DbClient = {
  query: <T = Record<string, unknown>>(sql: string, values?: unknown[]) => Promise<{ rows: T[] }>;
};

export class CompanySettlementCloseError extends Error {
  code: string;
  details?: Record<string, unknown>;
  constructor(code: string, message: string, details?: Record<string, unknown>) {
    super(message);
    this.name = "CompanySettlementCloseError";
    this.code = code;
    this.details = details;
  }
}

export type CompanySettlementCloseResult = {
  company_settlement_id: string;
  display_id: string;
  status: string;
  already_closed: boolean;
  gl_verified_journal_entry_ids: string[];
};

export async function closeCompanySettlementManual(
  client: DbClient,
  input: { operatingCompanyId: string; companySettlementId: string; actorUserId: string; confirm: boolean }
): Promise<CompanySettlementCloseResult> {
  if (input.confirm !== true) {
    throw new CompanySettlementCloseError("confirmation_required", "Closing a company settlement requires explicit human confirmation (confirm=true)");
  }

  const headerRes = await client.query<{ id: string; display_id: string; status: string; voided_at: string | null }>(
    `
      SELECT id::text, display_id, status, voided_at::text
      FROM accounting.company_settlements
      WHERE id = $1::uuid AND operating_company_id = $2::uuid
      LIMIT 1
    `,
    [input.companySettlementId, input.operatingCompanyId]
  );
  const header = headerRes.rows[0];
  if (!header) {
    throw new CompanySettlementCloseError("company_settlement_not_found", "Company settlement not found");
  }
  if (header.voided_at) {
    throw new CompanySettlementCloseError("company_settlement_voided", "A voided company settlement cannot be closed");
  }
  if (header.status === "closed") {
    return {
      company_settlement_id: header.id,
      display_id: header.display_id,
      status: header.status,
      already_closed: true,
      gl_verified_journal_entry_ids: [],
    };
  }

  const linkedRes = await client.query<{ driver_settlement_id: string; display_id: string }>(
    `
      SELECT csds.driver_settlement_id::text, ds.display_id
      FROM accounting.company_settlement_driver_settlements csds
      JOIN driver_finance.driver_settlements ds ON ds.id = csds.driver_settlement_id
      WHERE csds.company_settlement_id = $1::uuid
    `,
    [input.companySettlementId]
  );
  if (linkedRes.rows.length === 0) {
    throw new CompanySettlementCloseError("no_linked_driver_settlements", "This company settlement has no linked driver settlements to close");
  }

  // The real GL-posting linkage: driver_finance.driver_settlement_gl_bills is written ONLY by the
  // canonical poster (settlement-bill-payment-posting.service.ts) when SETTLEMENT_GL_POSTING_ENABLED
  // actually posted this driver settlement's bills. Zero rows for a driver settlement here means it
  // was never posted -- fail closed, name exactly which ones, never guess or skip.
  const glRes = await client.query<{ settlement_id: string; bill_journal_entry_id: string | null }>(
    `
      SELECT settlement_id::text, bill_journal_entry_id::text
      FROM driver_finance.driver_settlement_gl_bills
      WHERE operating_company_id = $1::uuid
        AND settlement_id = ANY($2::uuid[])
    `,
    [input.operatingCompanyId, linkedRes.rows.map((r) => r.driver_settlement_id)]
  );
  const postedSettlementIds = new Set(glRes.rows.map((r) => r.settlement_id));
  const unpostedDisplayIds = linkedRes.rows.filter((r) => !postedSettlementIds.has(r.driver_settlement_id)).map((r) => r.display_id);
  if (unpostedDisplayIds.length > 0) {
    throw new CompanySettlementCloseError(
      "linked_driver_settlements_not_gl_posted",
      `${unpostedDisplayIds.length} of ${linkedRes.rows.length} linked driver settlement(s) have not been posted to the GL yet: ${unpostedDisplayIds.join(", ")}`,
      { unposted_display_ids: unpostedDisplayIds }
    );
  }

  // Confirm the linked journal entries are real and not voided -- reusing accounting.journal_entries
  // (the same table journal-entries.service.ts's own listJournalEntries/getJournalEntrySourceLinks
  // read), never a second/competing GL truth.
  const journalEntryIds = [...new Set(glRes.rows.map((r) => r.bill_journal_entry_id).filter((id): id is string => Boolean(id)))];
  if (journalEntryIds.length > 0) {
    const jeRes = await client.query<{ id: string; status: string }>(
      `SELECT id::text, status FROM accounting.journal_entries WHERE id = ANY($1::uuid[]) AND operating_company_id = $2::uuid`,
      [journalEntryIds, input.operatingCompanyId]
    );
    const voided = jeRes.rows.filter((r) => r.status === "voided").map((r) => r.id);
    if (voided.length > 0) {
      throw new CompanySettlementCloseError(
        "linked_journal_entry_voided",
        `${voided.length} linked journal entry(ies) have been voided -- cannot close a company settlement whose GL postings were reversed`,
        { voided_journal_entry_ids: voided }
      );
    }
  }

  const closeRes = await client.query<{ id: string; display_id: string; status: string }>(
    `
      UPDATE accounting.company_settlements
      SET status = 'closed',
          closed_at = now(),
          closed_by_user_id = $2::uuid,
          updated_at = now()
      WHERE id = $1::uuid AND voided_at IS NULL AND status <> 'closed'
      RETURNING id::text, display_id, status
    `,
    [input.companySettlementId, input.actorUserId]
  );
  const closed = closeRes.rows[0];
  if (!closed) {
    throw new CompanySettlementCloseError("close_race", "Company settlement state changed concurrently -- retry");
  }

  return {
    company_settlement_id: closed.id,
    display_id: closed.display_id,
    status: closed.status,
    already_closed: false,
    gl_verified_journal_entry_ids: journalEntryIds,
  };
}
