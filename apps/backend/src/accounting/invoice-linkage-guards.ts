/**
 * Law §9 / P-INVOICE P0 — fail-closed guards for invoice → AR posting.
 *
 * Owner law (audit #3177): never invent CoA income accounts; never post load
 * revenue without source_load_id; refuse null income on revenue-bearing lines.
 */

/** Freight / accessorial line types that represent load revenue (ASC 606 performance). */
export const LOAD_REVENUE_LINE_TYPES = new Set([
  "linehaul",
  "fsc",
  "detention",
  "layover",
  "lumper",
  "tonu",
  "accessorial",
]);

export type InvoiceLineGuardRow = {
  id?: string | null;
  line_type: string | null;
  line_total_cents: number | null;
  account_id?: string | null;
  qbo_item_id?: string | null;
  income_account_id?: string | null;
};

export function isLoadRevenueLineType(lineType: string | null | undefined): boolean {
  return LOAD_REVENUE_LINE_TYPES.has(String(lineType ?? "").trim().toLowerCase());
}

export function isRevenueBearingLine(row: InvoiceLineGuardRow): boolean {
  const type = String(row.line_type ?? "").trim().toLowerCase();
  if (type === "tax") return false;
  const cents = row.line_total_cents != null ? Number(row.line_total_cents) : 0;
  return cents > 0;
}

/**
 * Load-revenue invoices must carry source_load_id (from-load / dispatch linkage).
 * Non-load AR (line_type other/adjustment) may omit it.
 */
export function assertLoadRevenueHasSourceLoad(
  sourceLoadId: string | null | undefined,
  lines: InvoiceLineGuardRow[]
): void {
  const hasLoadRevenue = lines.some((row) => isRevenueBearingLine(row) && isLoadRevenueLineType(row.line_type));
  if (!hasLoadRevenue) return;
  const loadId = String(sourceLoadId ?? "").trim();
  if (loadId) return;
  throw new InvoiceLoadSourceRequiredError(
    "invoice_load_source_required: load-revenue invoice lines (linehaul/fsc/detention/layover/lumper/tonu/accessorial) " +
      "require accounting.invoices.source_load_id. Create via from-load or set source_load_id — refusing orphan revenue post."
  );
}

/**
 * Every revenue-bearing line must already resolve to an income account (explicit account_id
 * or item default). Callers that only have account_id (send path) pass that; posting engine
 * passes the COALESCE'd income_account_id.
 */
export function assertRevenueLinesHaveIncomeAccount(
  operatingCompanyId: string,
  lines: InvoiceLineGuardRow[]
): void {
  for (const row of lines) {
    if (!isRevenueBearingLine(row)) continue;
    const resolved = String(row.income_account_id ?? row.account_id ?? "").trim();
    if (resolved) continue;
    throw new InvoiceLineIncomeAccountRequiredError(
      operatingCompanyId,
      row.id ?? null,
      row.qbo_item_id ?? null,
      `invoice_line_income_account_required: revenue line ${row.id ?? "(none)"} ` +
        `(line_type=${row.line_type ?? "?"}, qbo_item_id=${row.qbo_item_id ?? "none"}) has no income account ` +
        `for operating_company_id=${operatingCompanyId}. Map Product/Service default_income_account_id or set ` +
        `invoice_lines.account_id — refusing to invent a CoA account (HOLD designate if role/map missing).`
    );
  }
}

export class InvoiceLoadSourceRequiredError extends Error {
  code = "INVOICE_LOAD_SOURCE_REQUIRED" as const;
  constructor(message: string) {
    super(message);
    this.name = "InvoiceLoadSourceRequiredError";
  }
}

export class InvoiceLineIncomeAccountRequiredError extends Error {
  code = "INVOICE_LINE_INCOME_ACCOUNT_REQUIRED" as const;
  operating_company_id: string;
  invoice_line_id: string | null;
  qbo_item_id: string | null;
  constructor(
    operatingCompanyId: string,
    invoiceLineId: string | null,
    qboItemId: string | null,
    message: string
  ) {
    super(message);
    this.name = "InvoiceLineIncomeAccountRequiredError";
    this.operating_company_id = operatingCompanyId;
    this.invoice_line_id = invoiceLineId;
    this.qbo_item_id = qboItemId;
  }
}
