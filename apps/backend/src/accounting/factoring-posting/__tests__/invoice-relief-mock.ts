/**
 * Row 129 (ACCT-F11070) — test double for the one amount_paid_cents writer. Relief is an INSERT into
 * accounting.payment_applications; the database trigger accounting.recompute_invoice_paid() derives the header. This double
 * answers the relief writer's two reads and simulates the trigger, recording each application as
 * { sql, values: [invoice_id, derived_paid_after, applied_cents] }.
 */
type Rec = { sql: string; values: unknown[] };
export function makeInvoiceReliefMock(record: (c: Rec) => void) {
  const paid = new Map<string, number>();
  return {
    paid,
    handle(sql: string, values?: unknown[]): { rows: Record<string, unknown>[] } | null {
      if (sql.includes("FROM accounting.invoices") && sql.includes("AS paid") && sql.includes("FOR UPDATE")) {
        const id = String(values?.[0]);
        return { rows: [{ total: String(Number.MAX_SAFE_INTEGER), paid: String(paid.get(id) ?? 0) }] };
      }
      if (sql.includes("INSERT INTO accounting.payment_applications")) {
        const id = String(values?.[1]);
        const cents = Number(values?.[2]);
        const next = (paid.get(id) ?? 0) + cents;
        paid.set(id, next);
        record({ sql, values: [id, next, cents] });
        return { rows: [{ id: `app-${id}-${next}` }] };
      }
      return null;
    },
  };
}
