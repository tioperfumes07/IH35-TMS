type Client = { query: <T = Record<string, unknown>>(sql: string, values?: unknown[]) => Promise<{ rows: T[] }> };
export type RecoverySnapshot = { id: string; liability_id: string | null; recovered_cents: number };

/** Exact inverse attribution, never the advance's original principal after a partial recovery. */
export async function loadPayRunRecoveryReversal(client: Client, input: {
  operatingCompanyId: string; settlementId: string; journalEntryId: string;
}): Promise<RecoverySnapshot[]> {
  const audit = await client.query<{ payload: { recovery_snapshots?: RecoverySnapshot[]; recovered_advance_ids?: string[]; advance_recoveries_cents?: number } }>(`
    SELECT payload FROM audit.audit_events
    WHERE event_class = 'driver_finance.settlement.payrun_closed'
      AND payload->>'operating_company_id' = $1 AND payload->>'resource_id' = $2
      AND payload->>'journal_entry_id' = $3 ORDER BY created_at DESC LIMIT 1
  `, [input.operatingCompanyId, input.settlementId, input.journalEntryId]);
  const event = audit.rows[0]?.payload;
  if (!event || !Number.isSafeInteger(Number(event.advance_recoveries_cents))) throw new Error("Pay-run recovery audit missing; exact reversal cannot be proven");
  const total = Number(event.advance_recoveries_cents);
  const snapshots = event.recovery_snapshots;
  const ids = snapshots?.map(s => s.id) ?? event.recovered_advance_ids ?? [];
  const advances = await client.query<{ id: string; amount_cents: string; liability_id: string | null; recovered_in_settlement_id: string | null }>(`
    SELECT id::text, round(amount * 100)::bigint::text AS amount_cents,
           liability_id::text, recovered_in_settlement_id::text
    FROM driver_finance.driver_advances
    WHERE operating_company_id = $1::uuid
      AND (id = ANY($3::uuid[]) OR recovered_in_settlement_id = $2::uuid) FOR UPDATE
  `, [input.operatingCompanyId, input.settlementId, ids]);
  const byId = new Map(advances.rows.map(a => [a.id, a]));
  const plan = snapshots ?? advances.rows.filter(a => a.recovered_in_settlement_id === input.settlementId).map(a => ({
    id: a.id, liability_id: a.liability_id, recovered_cents: Number(a.amount_cents),
  }));
  if (new Set(plan.map(s => s.id)).size !== plan.length || plan.reduce((n, s) => n + s.recovered_cents, 0) !== total
      || ids.length !== plan.length || ids.some(id => !plan.some(p => p.id === id))) {
    throw new Error("Pay-run recovery history is partial or ambiguous; reverse the attributed recovery before continuing");
  }
  for (const s of plan) {
    const current = byId.get(s.id);
    if (!current || !Number.isSafeInteger(s.recovered_cents) || s.recovered_cents <= 0 || current.liability_id !== s.liability_id
        || (current.recovered_in_settlement_id && current.recovered_in_settlement_id !== input.settlementId)) {
      throw new Error("Pay-run recovery has a later settlement or invalid attribution; reverse in chronological order");
    }
  }
  return plan;
}
