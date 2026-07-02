import { upsertFaroDailyImport } from "../data-infra/data-infra.service.js";
import { postReserveMovement } from "./reserve.service.js";
import { isEnabled } from "../lib/feature-flags/service.js";
import {
  FACTORING_GL_POSTING_FLAG,
  postFactoringAdvanceEvent,
} from "../accounting/factoring-posting/poster.service.js";

export const FARO_CSV_REQUIRED_HEADERS = [
  "invoice number",
  "customer name",
  "gross",
  "advance",
  "reserve",
  "fee",
  "chargeback",
  "net",
] as const;

export type FaroCsvLine = {
  invoice_number: string;
  customer_name?: string;
  gross_amount_cents: number;
  advance_amount_cents: number;
  reserve_amount_cents: number;
  fee_amount_cents: number;
  chargeback_amount_cents: number;
  net_amount_cents: number;
  due_on?: string;
};

export type FaroCsvParseResult = {
  headers: string[];
  lines: FaroCsvLine[];
  statement_date?: string;
};

export class FaroCsvImportError extends Error {
  constructor(
    readonly code: "invalid_csv" | "missing_headers" | "empty_csv" | "commit_failed",
    message: string
  ) {
    super(message);
  }
}

function normalizeHeader(value: string) {
  return value.trim().toLowerCase().replace(/\s+/g, " ");
}

function parseCsvRow(line: string): string[] {
  const cells: string[] = [];
  let current = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i += 1) {
    const ch = line[i];
    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') {
        current += '"';
        i += 1;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }
    if (ch === "," && !inQuotes) {
      cells.push(current.trim());
      current = "";
      continue;
    }
    current += ch;
  }
  cells.push(current.trim());
  return cells;
}

function parseMoneyToCents(raw: string): number {
  const cleaned = raw.replace(/[$,\s]/g, "");
  if (!cleaned) return 0;
  const value = Number(cleaned);
  if (!Number.isFinite(value)) return 0;
  return Math.round(value * 100);
}

function parseDueDate(raw: string | undefined): string | undefined {
  if (!raw?.trim()) return undefined;
  const trimmed = raw.trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) return trimmed;
  const parsed = new Date(trimmed);
  if (Number.isNaN(parsed.getTime())) return undefined;
  return parsed.toISOString().slice(0, 10);
}

function headerIndex(headers: string[], aliases: string[]) {
  const normalized = headers.map(normalizeHeader);
  for (const alias of aliases) {
    const idx = normalized.indexOf(alias);
    if (idx >= 0) return idx;
  }
  return -1;
}

export function parseFaroCsv(csvText: string): FaroCsvParseResult {
  const rows = csvText
    .replace(/^\uFEFF/, "")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
  if (rows.length < 2) throw new FaroCsvImportError("empty_csv", "CSV must include a header row and at least one data row");

  const headers = parseCsvRow(rows[0] ?? "");
  const normalizedHeaders = headers.map(normalizeHeader);
  for (const required of FARO_CSV_REQUIRED_HEADERS) {
    if (!normalizedHeaders.includes(required)) {
      throw new FaroCsvImportError("missing_headers", `Missing required column: ${required}`);
    }
  }

  const invoiceIdx = headerIndex(headers, ["invoice number", "invoice #", "invoice"]);
  const customerIdx = headerIndex(headers, ["customer name", "customer", "debtor"]);
  const grossIdx = headerIndex(headers, ["gross", "invoice amount", "face amount"]);
  const advanceIdx = headerIndex(headers, ["advance", "advance amount"]);
  const reserveIdx = headerIndex(headers, ["reserve", "reserve amount", "withholding"]);
  const feeIdx = headerIndex(headers, ["fee", "factor fee"]);
  const chargebackIdx = headerIndex(headers, ["chargeback", "chargeback amount"]);
  const netIdx = headerIndex(headers, ["net", "net amount"]);
  const dueIdx = headerIndex(headers, ["due date", "due on", "due"]);

  const lines: FaroCsvLine[] = [];
  for (const row of rows.slice(1)) {
    const cells = parseCsvRow(row);
    const invoice_number = String(cells[invoiceIdx] ?? "").trim();
    if (!invoice_number) continue;
    lines.push({
      invoice_number,
      customer_name: customerIdx >= 0 ? String(cells[customerIdx] ?? "").trim() || undefined : undefined,
      gross_amount_cents: parseMoneyToCents(String(cells[grossIdx] ?? "0")),
      advance_amount_cents: parseMoneyToCents(String(cells[advanceIdx] ?? "0")),
      reserve_amount_cents: parseMoneyToCents(String(cells[reserveIdx] ?? "0")),
      fee_amount_cents: parseMoneyToCents(String(cells[feeIdx] ?? "0")),
      chargeback_amount_cents: parseMoneyToCents(String(cells[chargebackIdx] ?? "0")),
      net_amount_cents: parseMoneyToCents(String(cells[netIdx] ?? "0")),
      due_on: dueIdx >= 0 ? parseDueDate(String(cells[dueIdx] ?? "")) : undefined,
    });
  }

  if (lines.length === 0) throw new FaroCsvImportError("invalid_csv", "No invoice rows found in CSV");

  const statementDate = lines[0]?.due_on ?? new Date().toISOString().slice(0, 10);
  return { headers, lines, statement_date: statementDate };
}

type Queryable = {
  query: <R = Record<string, unknown>>(sql: string, values?: unknown[]) => Promise<{ rows: R[]; rowCount?: number }>;
};

async function resolveActiveFactorId(client: Queryable, companyId: string): Promise<string | null> {
  const res = await client.query<{ id: string }>(
    `
      SELECT v.id::text
      FROM mdata.vendors v
      JOIN (
        SELECT factoring_company_vendor_id AS vendor_id
        FROM mdata.customers
        WHERE operating_company_id = $1::uuid
          AND factoring_company_vendor_id IS NOT NULL
        GROUP BY factoring_company_vendor_id
        ORDER BY COUNT(*) DESC
        LIMIT 1
      ) c ON c.vendor_id = v.id
      WHERE v.operating_company_id = $1::uuid
      LIMIT 1
    `,
    [companyId]
  );
  return res.rows[0]?.id ?? null;
}

async function applyInvoiceAndReserveUpdates(
  client: Queryable,
  companyId: string,
  lines: FaroCsvLine[],
  factorId: string | null
) {
  let invoices_updated = 0;
  let reserve_movements = 0;

  for (const line of lines) {
    const invoiceRes = await client.query<{ id: string }>(
      `
        UPDATE accounting.invoices
        SET factoring_status = 'advanced',
            updated_at = now()
        WHERE operating_company_id = $1::uuid
          AND display_id = $2::text
          AND COALESCE(factoring_status, 'not_factored') IN ('not_factored', 'submitted')
        RETURNING id::text
      `,
      [companyId, line.invoice_number]
    );
    if (invoiceRes.rows[0]) invoices_updated += 1;

    if (line.reserve_amount_cents > 0) {
      await postReserveMovement(null, companyId, "credit", line.reserve_amount_cents, `faro_csv:${line.invoice_number}`, {
        client,
        factorId,
      });
      reserve_movements += 1;
    }
  }

  return { invoices_updated, reserve_movements };
}

// CODER-34 scope C — the FARO funding report is the posting TRIGGER + the reconciliation ("match our
// numbers with FARO's") point. We map each imported invoice line to its factoring_advance (batch), sum
// FARO's ACTUAL gross/reserve/fee per advance, and (1) flag any variance vs our expected figures BEFORE
// posting, and (2) when FACTORING_GL_POSTING_ENABLED is ON for this entity, drive the secured-borrowing
// FUNDING post with FARO's actuals. The poster is idempotent (memo-keyed) so a re-import cannot double-post
// (draft-vs-posted immutability): a funded batch's funding JE posts once; a later FARO correction is a
// separate, reason-coded true-up adjustment, never a silent edit of the posted entry.
export type FaroFundingVariance = {
  factoring_advance_id: string;
  display_id: string;
  expected_invoice_total_cents: number;
  actual_gross_cents: number;
  expected_reserve_cents: number;
  actual_reserve_cents: number;
  expected_fee_cents: number;
  actual_fee_cents: number;
  has_variance: boolean;
};

type AdvanceActuals = {
  factoring_advance_id: string;
  display_id: string;
  expected_invoice_total_cents: number;
  expected_reserve_cents: number;
  expected_fee_cents: number;
  actual_gross_cents: number;
  actual_reserve_cents: number;
  actual_fee_cents: number;
};

async function aggregateFaroActualsByAdvance(
  client: Queryable,
  companyId: string,
  lines: FaroCsvLine[]
): Promise<AdvanceActuals[]> {
  const byAdvance = new Map<string, AdvanceActuals>();
  for (const line of lines) {
    const res = await client.query<{
      factoring_advance_id: string | null;
      display_id: string | null;
      invoice_total_cents: number | null;
      reserve_amount_cents: number | null;
      factor_fee_cents: number | null;
    }>(
      `
        SELECT
          fa.id::text            AS factoring_advance_id,
          fa.display_id          AS display_id,
          fa.invoice_total_cents::int AS invoice_total_cents,
          fa.reserve_amount_cents::int AS reserve_amount_cents,
          fa.factor_fee_cents::int     AS factor_fee_cents
        FROM accounting.invoices i
        JOIN accounting.factoring_advances fa ON fa.id = i.factoring_advance_id
        WHERE i.operating_company_id = $1::uuid
          AND i.display_id = $2::text
        LIMIT 1
      `,
      [companyId, line.invoice_number]
    );
    const row = res.rows[0];
    if (!row?.factoring_advance_id) continue;
    const key = row.factoring_advance_id;
    const entry = byAdvance.get(key) ?? {
      factoring_advance_id: key,
      display_id: String(row.display_id ?? ""),
      expected_invoice_total_cents: Number(row.invoice_total_cents ?? 0),
      expected_reserve_cents: Number(row.reserve_amount_cents ?? 0),
      expected_fee_cents: Number(row.factor_fee_cents ?? 0),
      actual_gross_cents: 0,
      actual_reserve_cents: 0,
      actual_fee_cents: 0,
    };
    entry.actual_gross_cents += Number(line.gross_amount_cents ?? 0);
    entry.actual_reserve_cents += Number(line.reserve_amount_cents ?? 0);
    entry.actual_fee_cents += Number(line.fee_amount_cents ?? 0);
    byAdvance.set(key, entry);
  }
  return Array.from(byAdvance.values());
}

function toVariance(a: AdvanceActuals): FaroFundingVariance {
  const has_variance =
    a.actual_gross_cents !== a.expected_invoice_total_cents ||
    a.actual_reserve_cents !== a.expected_reserve_cents ||
    a.actual_fee_cents !== a.expected_fee_cents;
  return {
    factoring_advance_id: a.factoring_advance_id,
    display_id: a.display_id,
    expected_invoice_total_cents: a.expected_invoice_total_cents,
    actual_gross_cents: a.actual_gross_cents,
    expected_reserve_cents: a.expected_reserve_cents,
    actual_reserve_cents: a.actual_reserve_cents,
    expected_fee_cents: a.expected_fee_cents,
    actual_fee_cents: a.actual_fee_cents,
    has_variance,
  };
}

export async function commitFaroCsvImport(input: {
  userId: string;
  operatingCompanyId: string;
  csvText: string;
  statementDate?: string;
  statementReference?: string;
  sourceFilename?: string;
}) {
  const parsed = parseFaroCsv(input.csvText);
  const statementDate = input.statementDate ?? parsed.statement_date ?? new Date().toISOString().slice(0, 10);
  const statementReference = input.statementReference ?? "faro-csv";

  const importResult = await upsertFaroDailyImport(input.userId, {
    operatingCompanyId: input.operatingCompanyId,
    statementDate,
    statementReference,
    sourceFilename: input.sourceFilename,
    notes: "Imported via Faro CSV upload (P5-T22)",
    lines: parsed.lines,
  });

  const { withCurrentUser } = await import("../auth/db.js");
  const { sideEffects, advanceActuals, postingEnabled } = await withCurrentUser(input.userId, async (client) => {
    await client.query("SELECT set_config('app.operating_company_id', $1, true)", [input.operatingCompanyId]);
    const factorId = await resolveActiveFactorId(client, input.operatingCompanyId);
    const effects = await applyInvoiceAndReserveUpdates(client, input.operatingCompanyId, parsed.lines, factorId);
    // Reconciliation point 2 (at funding): aggregate FARO's actuals per advance for variance flagging + the
    // funding-post trigger. Read-only here (posting happens after this tx, via the flag-gated poster).
    const actuals = await aggregateFaroActualsByAdvance(client, input.operatingCompanyId, parsed.lines);
    const enabled = await isEnabled(client, FACTORING_GL_POSTING_FLAG, { operating_company_id: input.operatingCompanyId });
    return { sideEffects: effects, advanceActuals: actuals, postingEnabled: enabled };
  });

  const variances = advanceActuals.map(toVariance);

  // FUNDING post trigger — only when the per-entity flag is ON (default OFF => inert). The poster itself
  // re-checks the flag and is idempotent, so this is safe even if the flag flips between the read and the call.
  const funding_posts: Array<{ factoring_advance_id: string; posted: boolean; reason?: string; journal_entry_id?: string }> = [];
  if (postingEnabled) {
    for (const a of advanceActuals) {
      const result = await postFactoringAdvanceEvent({
        operating_company_id: input.operatingCompanyId,
        factoring_advance_id: a.factoring_advance_id,
        actor_user_id: input.userId,
        advanced_at_iso: statementDate,
        funding_figures: {
          invoice_total_cents: a.actual_gross_cents,
          reserve_cents: a.actual_reserve_cents,
          fee_cents: a.actual_fee_cents,
          ach_cents: 0, // FARO CSV carries no ACH/transaction-fee column; supply via funding_figures when available.
        },
      });
      funding_posts.push({
        factoring_advance_id: a.factoring_advance_id,
        posted: result.posted,
        reason: result.reason,
        journal_entry_id: result.journal_entry_id,
      });
    }
  }

  return {
    import_id: importResult.id,
    line_count: parsed.lines.length,
    ...sideEffects,
    factoring_gl_posting_enabled: postingEnabled,
    variances,
    variance_count: variances.filter((v) => v.has_variance).length,
    funding_posts,
  };
}
