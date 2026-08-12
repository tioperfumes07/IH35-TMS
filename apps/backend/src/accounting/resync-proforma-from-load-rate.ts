/**
 * FAIL-I1 / ACCT-F270 — re-sync draft|proforma linehaul amounts when a load's rate changes.
 * Shared so BOTH dispatch updateDispatchLoad AND mdata PATCH /loads/:id run the same wire
 * (dual-path: dispatch path already had it; mdata PATCH was the silent hole).
 *
 * Only draft/proforma + non-void. Never mutates sent/paid invoices. Reuses recomputeInvoiceTotals
 * — no new GL math.
 *
 * CLS-RATE-TYPED-AFTER-BOOK-NO-INVOICE / ACCT-F289 follow-up — this function used to be pure UPDATE:
 * if no draft/proforma invoice existed yet, `resync.rows` came back empty and it silently did
 * nothing. That was fine before ACCT-F289 (PR #5998), because booking a $0-rate load THREW and the
 * load could not exist without a rate. ACCT-F289 made booking succeed on a $0-rate load by catching
 * `load_has_no_rate` and skipping proforma creation — which means a load can now reach this function
 * with rate freshly set and STILL have zero invoices, and the UPDATE above matches nothing forever.
 * The load would never get billed until someone noticed and manually forced an invoice. Mint the
 * proforma here instead, the same call booking would have made if the rate had existed at book time.
 * buildInvoiceFromLoad is itself idempotent (looks up any existing non-void invoice for the load
 * first), so calling it after a resync that touched zero rows is safe — it either creates the
 * long-overdue proforma or finds a real invoice already exists (of any status) and no-ops.
 */
import { recomputeInvoiceTotals } from "./shared.js";
import { buildInvoiceFromLoad } from "./from-load.js";

type DbClient = {
  query: <R = Record<string, unknown>>(sql: string, values?: unknown[]) => Promise<{ rows: R[] }>;
};

export async function resyncProformaInvoiceFromLoadRate(
  client: DbClient,
  input: { loadId: string; operatingCompanyId: string; newRateTotalCents: number; userId: string }
): Promise<string[]> {
  const newTotal = Number(input.newRateTotalCents ?? 0);
  if (!Number.isFinite(newTotal) || newTotal <= 0) return [];

  const resync = await client.query<{ invoice_id: string }>(
    `
      UPDATE accounting.invoice_lines l
         SET unit_amount_cents = $3::bigint,
             line_total_cents  = $3::bigint
        FROM accounting.invoices i
       WHERE l.invoice_id = i.id
         AND i.source_load_id = $1::uuid
         AND i.operating_company_id = $2::uuid
         AND i.status IN ('draft', 'proforma')
         AND i.voided_at IS NULL
         AND l.line_type = 'linehaul'
      RETURNING i.id::text AS invoice_id
    `,
    [input.loadId, input.operatingCompanyId, newTotal]
  );

  const ids: string[] = [];
  for (const row of resync.rows) {
    const id = String(row.invoice_id);
    ids.push(id);
    await recomputeInvoiceTotals(client, id);
  }

  if (ids.length === 0) {
    try {
      const built = await buildInvoiceFromLoad(client, {
        userId: input.userId,
        operatingCompanyId: input.operatingCompanyId,
        loadId: input.loadId,
        asProforma: true,
      });
      if (!built.idempotent) ids.push(String((built.invoice as { id: unknown }).id));
    } catch (error) {
      // load_has_no_rate would mean newTotal disagrees with what's actually committed (e.g. a
      // concurrent edit raced this one back to zero) — nothing to mint, not a bug in this path.
      if ((error as { code?: string }).code !== "load_has_no_rate") throw error;
    }
  }

  return ids;
}
