import { upsertFaroDailyImport } from "../data-infra/data-infra.service.js";
import { postReserveMovement } from "./reserve.service.js";

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
  const sideEffects = await withCurrentUser(input.userId, async (client) => {
    await client.query(`SET LOCAL app.operating_company_id = '${input.operatingCompanyId}'`);
    const factorId = await resolveActiveFactorId(client, input.operatingCompanyId);
    return applyInvoiceAndReserveUpdates(client, input.operatingCompanyId, parsed.lines, factorId);
  });

  return {
    import_id: importResult.id,
    line_count: parsed.lines.length,
    ...sideEffects,
  };
}
