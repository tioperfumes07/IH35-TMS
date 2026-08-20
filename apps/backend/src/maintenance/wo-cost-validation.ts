export type WoInvoiceMismatchError = Error & {
  code: "WO_INVOICE_MISMATCH";
  total_line_items_cents: number;
  vendor_invoice_cents: number;
  delta_cents: number;
  source: "parts_invoice_links" | "accounting.bills";
};

function moneyToCents(value: unknown): number {
  const n = Number(value ?? 0);
  if (!Number.isFinite(n)) return 0;
  return Math.round(n * 100);
}

function throwMismatch(input: {
  totalLineCents: number;
  invoiceCents: number;
  source: WoInvoiceMismatchError["source"];
}): never {
  const delta = Math.abs(input.totalLineCents - input.invoiceCents);
  const err = new Error("WO_INVOICE_MISMATCH") as WoInvoiceMismatchError;
  err.code = "WO_INVOICE_MISMATCH";
  err.total_line_items_cents = input.totalLineCents;
  err.vendor_invoice_cents = input.invoiceCents;
  err.delta_cents = delta;
  err.source = input.source;
  throw err;
}

export function isWoInvoiceMismatch(error: unknown): error is WoInvoiceMismatchError {
  return Boolean(error && typeof error === "object" && (error as WoInvoiceMismatchError).code === "WO_INVOICE_MISMATCH");
}

export async function validateWoVendorInvoiceTotals(
  client: { query: (sql: string, args?: unknown[]) => Promise<{ rows: Array<Record<string, unknown>> }> },
  woId: string
): Promise<void> {
  const linesRes = await client.query(
    `
      SELECT COALESCE(SUM(total_cost::numeric), 0)::numeric AS total
      FROM maintenance.work_order_lines
      WHERE work_order_uuid = $1::uuid
        AND section IN ('A', 'B')
    `,
    [woId]
  );
  const lineTotal = linesRes.rows[0]?.total ?? 0;

  // ACCT-F5626 — total_actual_cost is set ONCE at WO creation (two-section-service.ts) and NEVER
  // written again. Both callers of this function (the line-item add/delete routes,
  // work-orders.routes.ts) insert/delete maintenance.work_order_lines rows and then call this
  // function to VALIDATE the new sum against any already-linked bill/parts-invoice — but validating
  // is not persisting, and nothing else in the codebase ever writes this column post-creation (no
  // UPDATE, no trigger). autoCreateBillFromWO / autoCreateExpenseFromWO both derive the auto-posted
  // AP amount directly from total_actual_cost, so editing a WO's lines before its bill/expense is
  // generated silently posts the STALE, creation-time total — under- or over-billing the vendor by
  // the exact delta the edit was supposed to correct. Written here, at the single choke point both
  // line-item routes already call, on every successful validation pass (including the early-return
  // case below where no bill/parts-invoice is linked yet, which is the exact case most exposed to
  // going stale since nothing else checks it at all).
  await client.query(
    `UPDATE maintenance.work_orders SET total_actual_cost = $2::numeric WHERE id = $1::uuid`,
    [woId, lineTotal]
  );

  const partsRes = await client.query(
    `
      SELECT
        COUNT(*)::int AS cnt,
        COALESCE(SUM(vendor_invoice_amount::numeric * GREATEST(qty_used, 1)), 0)::numeric AS total
      FROM maintenance.parts_invoice_links
      WHERE work_order_id = $1::uuid
    `,
    [woId]
  );
  const partsCount = Number(partsRes.rows[0]?.cnt ?? 0);
  const partsTotal = partsRes.rows[0]?.total ?? 0;

  let billsCount = 0;
  let billsTotal: unknown = 0;
  const billsTable = await client.query(`SELECT to_regclass('accounting.bills') IS NOT NULL AS ok`);
  if (billsTable.rows[0]?.ok) {
    const bRes = await client.query(
      `
        SELECT
          COUNT(*)::int AS cnt,
          COALESCE(SUM(total_amount::numeric), 0)::numeric AS total
        FROM accounting.bills
        WHERE linked_work_order_uuid = $1::uuid
          AND revoked_at IS NULL
      `,
      [woId]
    );
    billsCount = Number(bRes.rows[0]?.cnt ?? 0);
    billsTotal = bRes.rows[0]?.total ?? 0;
  }

  if (partsCount === 0 && billsCount === 0) return;

  const lineCents = moneyToCents(lineTotal);
  if (partsCount > 0) {
    const invCents = moneyToCents(partsTotal);
    if (Math.abs(lineCents - invCents) > 1) {
      throwMismatch({ totalLineCents: lineCents, invoiceCents: invCents, source: "parts_invoice_links" });
    }
  }
  if (billsCount > 0) {
    const invCents = moneyToCents(billsTotal);
    if (Math.abs(lineCents - invCents) > 1) {
      throwMismatch({ totalLineCents: lineCents, invoiceCents: invCents, source: "accounting.bills" });
    }
  }
}
