import { upsertFaroDailyImportOnClient } from "../data-infra/data-infra.service.js";
import { postReserveMovement } from "./reserve.service.js";
import { isEnabled } from "../lib/feature-flags/service.js";
import { companyBusinessDate } from "../lib/company-business-date.js";
import { requireEffectiveFaroFullRecourseAgreement } from "../accounting/factoring-posting/faro-agreement-gate.js";
import { ensureDefaultInterestAccruedThroughDate } from "../accounting/factoring-posting/default-interest.service.js";
import {
  FACTORING_GL_POSTING_FLAG,
  FactoringEntryDateError,
  loadExactLinkedChargebackAmounts,
  postFactoringAdvanceEvent,
  postFactoringChargebackEvent,
  resolveCanonicalEntryDate,
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

export type FaroCsvPreviewLine = FaroCsvLine & {
  invoice_id?: string | null;
  customer_id?: string | null;
  customer_display_name?: string | null;
};

export type FaroCsvParseResult = {
  headers: string[];
  lines: FaroCsvLine[];
  statement_date?: string;
};

export class FaroCsvImportError extends Error {
  constructor(
    readonly code:
      | "invalid_csv"
      | "missing_headers"
      | "empty_csv"
      | "commit_failed"
      | "policy_faro_agreement"
      | "policy_invalid_statement_date"
      | "policy_future_statement_date"
      | "policy_missing_statement_date",
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

// Parse a FARO money cell to integer cents.
//   Behavior (documented — a money importer must not silently corrupt stored reserve/gross):
//   * Empty / whitespace-only cell           => 0        (an absent value is legitimately zero).
//   * Accounting-format negative "(3,000.00)" => -300000  (parenthesis wrapper = negative; chargebacks
//                                                          and reversals arrive this way).
//   * Leading-minus negative "-50.00"         => -5000.
//   * Normal positive "$1,234.56"             => 123456.
//   * Non-empty but UNPARSEABLE ("abc", "1.2.3", "()", "$") => THROW FaroCsvImportError (fail-loud).
//     We deliberately do NOT fall back to 0 here: a garbage money cell silently becoming $0 is exactly
//     the corruption this importer must prevent — the whole import must reject instead.
export function parseMoneyToCents(raw: string): number {
  const trimmed = raw.trim();
  if (!trimmed) return 0;
  // Accounting-format negative: a single (...) wrapper around the number.
  const parenMatch = /^\((.*)\)$/.exec(trimmed);
  const isNegativeParen = parenMatch !== null;
  const body = isNegativeParen ? (parenMatch[1] ?? "") : trimmed;
  const cleaned = body.replace(/[$,\s]/g, "");
  if (!cleaned) {
    throw new FaroCsvImportError("invalid_csv", `Unparseable money value: "${raw}"`);
  }
  const value = Number(cleaned);
  if (!Number.isFinite(value)) {
    throw new FaroCsvImportError("invalid_csv", `Unparseable money value: "${raw}"`);
  }
  const cents = Math.round(value * 100);
  return isNegativeParen ? -cents : cents;
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

  // Economic/statement date from parsed due_on when present — never invent UTC "today".
  const statementDate = lines.find((l) => l.due_on)?.due_on;
  return { headers, lines, statement_date: statementDate };
}

type Queryable = {
  query: <R = Record<string, unknown>>(sql: string, values?: unknown[]) => Promise<{ rows: R[]; rowCount?: number }>;
};

/** Preview-only: resolve TMS invoice + customer ids for Faro CSV invoice numbers (Law §9 reverse drill). */
export async function enrichFaroPreviewLines(
  client: Queryable,
  companyId: string,
  lines: FaroCsvLine[]
): Promise<FaroCsvPreviewLine[]> {
  if (lines.length === 0) return [];
  const numbers = Array.from(new Set(lines.map((l) => l.invoice_number).filter(Boolean)));
  if (numbers.length === 0) return lines.map((line) => ({ ...line, invoice_id: null, customer_id: null }));

  const res = await client.query<{
    id: string;
    display_id: string;
    customer_id: string | null;
    customer_name: string | null;
  }>(
    `
      SELECT
        i.id::text,
        i.display_id::text,
        i.customer_id::text,
        c.customer_name::text AS customer_name
      FROM accounting.invoices i
      LEFT JOIN mdata.customers c
             ON c.id = i.customer_id
            AND c.operating_company_id = i.operating_company_id
      WHERE i.operating_company_id = $1::uuid
        AND i.display_id = ANY($2::text[])
    `,
    [companyId, numbers]
  );
  const byDisplay = new Map(res.rows.map((row) => [row.display_id, row]));
  return lines.map((line) => {
    const match = byDisplay.get(line.invoice_number);
    return {
      ...line,
      invoice_id: match?.id ?? null,
      customer_id: match?.customer_id ?? null,
      customer_display_name: match?.customer_name ?? line.customer_name ?? null,
    };
  });
}

/** Resolve CSV statement/economic date — fail closed; never salvage to today. */
export function resolveFaroCsvStatementDate(
  supplied?: string | null,
  parsed?: string | null
): string {
  try {
    const ymd = resolveCanonicalEntryDate(supplied, parsed);
    if (ymd > companyBusinessDate()) {
      throw new FaroCsvImportError(
        "policy_future_statement_date",
        `Faro CSV statement date ${ymd} is in the future vs company business date — refuse import`
      );
    }
    return ymd;
  } catch (e) {
    if (e instanceof FaroCsvImportError) throw e;
    if (e instanceof FactoringEntryDateError) {
      throw new FaroCsvImportError(
        e.reason === "policy_missing_entry_date"
          ? "policy_missing_statement_date"
          : "policy_invalid_statement_date",
        e.message
      );
    }
    throw e;
  }
}

/** Authoritative Faro full-recourse vendor as-of statement/economic date — never today fallback. */
async function resolveActiveFactorId(
  client: Queryable,
  companyId: string,
  asOfStatementDate: string
): Promise<string | null> {
  const gate = await requireEffectiveFaroFullRecourseAgreement(
    client as never,
    companyId,
    asOfStatementDate
  );
  if (!gate.ok) return null;
  return gate.vendorId;
}

async function applyInvoiceAndReserveUpdates(
  client: Queryable,
  companyId: string,
  lines: FaroCsvLine[],
  factorId: string | null,
  postingEnabled: boolean
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

    // ACCT-F5614 — honest flag-OFF = ZERO financial rows written (the same "TIER-1 FINANCIAL,
    // BUILD-AND-HOLD" law this codebase enforces everywhere else, e.g.
    // settlement-payrun-close.service.ts's own header). This write previously ran unconditionally
    // on EVERY CSV line regardless of FACTORING_GL_POSTING_FLAG, so factoring.reserve_movement /
    // factoring.v_factor_reserve_balance (served live via GET /factoring/reserve-balance) could show
    // a real, non-zero reserve figure with ZERO corresponding GL entry the moment an entity's flag
    // was OFF -- indistinguishable from a genuine posted reserve to anyone reading that screen.
    if (line.reserve_amount_cents > 0 && postingEnabled) {
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
  // Chargebacks have no "expected" counterpart on the advance row — any recourse chargeback present in the
  // funding report is itself a reconciliation signal, surfaced here and routed to the chargeback poster.
  actual_chargeback_cents: number;
  // Completeness: an advance (batch) can span multiple invoices that arrive across multiple funding files.
  // The advance row's expected_* are BATCH totals, so comparing them to a partial set of present CSV lines
  // fabricates a phantom variance and would fund the wrong (too-small) liability. We only compare
  // expected-vs-actual (and only auto-post funding) once every invoice in the batch is present.
  matched_invoice_count: number;
  total_invoice_count: number;
  is_complete: boolean;
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
  actual_chargeback_cents: number;
  total_invoice_count: number;
  // Distinct invoice numbers from the CSV that resolved to this advance (drives completeness).
  matched_invoice_numbers: Set<string>;
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
      total_invoice_count: number | null;
    }>(
      `
        SELECT
          fa.id::text            AS factoring_advance_id,
          fa.display_id          AS display_id,
          fa.invoice_total_cents::int AS invoice_total_cents,
          fa.reserve_amount_cents::int AS reserve_amount_cents,
          fa.factor_fee_cents::int     AS factor_fee_cents,
          (
            SELECT COUNT(*)::int
            FROM accounting.invoices ii
            WHERE ii.factoring_advance_id = fa.id
              AND ii.operating_company_id = $1::uuid
              AND ii.voided_at IS NULL
          ) AS total_invoice_count
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
      actual_chargeback_cents: 0,
      total_invoice_count: Number(row.total_invoice_count ?? 0),
      matched_invoice_numbers: new Set<string>(),
    };
    entry.actual_gross_cents += Number(line.gross_amount_cents ?? 0);
    entry.actual_reserve_cents += Number(line.reserve_amount_cents ?? 0);
    entry.actual_fee_cents += Number(line.fee_amount_cents ?? 0);
    entry.actual_chargeback_cents += Number(line.chargeback_amount_cents ?? 0);
    entry.matched_invoice_numbers.add(line.invoice_number);
    byAdvance.set(key, entry);
  }
  return Array.from(byAdvance.values());
}

// Completeness: every non-voided invoice in the advance (batch) must be present among the CSV lines that
// resolved to it. `>=` is defensive against a duplicate/voided edge — never blocks a genuinely-complete batch.
function isAdvanceComplete(a: AdvanceActuals): boolean {
  return a.total_invoice_count > 0 && a.matched_invoice_numbers.size >= a.total_invoice_count;
}

function toVariance(a: AdvanceActuals): FaroFundingVariance {
  const matched_invoice_count = a.matched_invoice_numbers.size;
  const is_complete = isAdvanceComplete(a);
  // Only compare batch expected vs summed actual once the whole batch is present — otherwise a partial
  // arrival always mismatches the batch total (phantom variance). Chargebacks are ALWAYS surfaced: any
  // recourse chargeback in the funding report is a discrepancy regardless of completeness.
  const amountsMatch =
    a.actual_gross_cents === a.expected_invoice_total_cents &&
    a.actual_reserve_cents === a.expected_reserve_cents &&
    a.actual_fee_cents === a.expected_fee_cents;
  const has_variance = a.actual_chargeback_cents !== 0 || (is_complete && !amountsMatch);
  return {
    factoring_advance_id: a.factoring_advance_id,
    display_id: a.display_id,
    expected_invoice_total_cents: a.expected_invoice_total_cents,
    actual_gross_cents: a.actual_gross_cents,
    expected_reserve_cents: a.expected_reserve_cents,
    actual_reserve_cents: a.actual_reserve_cents,
    expected_fee_cents: a.expected_fee_cents,
    actual_fee_cents: a.actual_fee_cents,
    actual_chargeback_cents: a.actual_chargeback_cents,
    matched_invoice_count,
    total_invoice_count: a.total_invoice_count,
    is_complete,
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
  // Statement/economic date BEFORE any durable write — no today/UTC salvage.
  const statementDate = resolveFaroCsvStatementDate(input.statementDate, parsed.statement_date);
  const statementReference = input.statementReference ?? "faro-csv";

  const { withCurrentUser } = await import("../auth/db.js");
  // Atomic: Faro agreement as-of statement date + CSV persistence + invoice/reserve side effects.
  // Rejected agreement/RTS/partial/expired/future rolls back — zero durable import rows.
  const { importResult, sideEffects, advanceActuals, postingEnabled } = await withCurrentUser(
    input.userId,
    async (client) => {
      await client.query("SELECT set_config('app.operating_company_id', $1::text, true)", [input.operatingCompanyId]);
      const factorId = await resolveActiveFactorId(client, input.operatingCompanyId, statementDate);
      if (!factorId) {
        throw new FaroCsvImportError(
          "policy_faro_agreement",
          `No effective TRANSP/Faro full-recourse agreement as-of ${statementDate} — refuse Faro CSV import (RTS/partial/missing/expired/ambiguous/future fail closed)`
        );
      }
      const importResult = await upsertFaroDailyImportOnClient(client, input.userId, {
        operatingCompanyId: input.operatingCompanyId,
        statementDate,
        statementReference,
        sourceFilename: input.sourceFilename,
        notes: "Imported via Faro CSV upload (P5-T22)",
        lines: parsed.lines,
      });
      // Read the posting flag BEFORE the invoice/reserve side effects so the reserve-movement write
      // can honor it -- see ACCT-F5614 comment on applyInvoiceAndReserveUpdates.
      const enabled = await isEnabled(client, FACTORING_GL_POSTING_FLAG, {
        operating_company_id: input.operatingCompanyId,
      });
      const effects = await applyInvoiceAndReserveUpdates(
        client,
        input.operatingCompanyId,
        parsed.lines,
        factorId,
        enabled
      );
      const actuals = await aggregateFaroActualsByAdvance(client, input.operatingCompanyId, parsed.lines);
      return {
        importResult,
        sideEffects: effects,
        advanceActuals: actuals,
        postingEnabled: enabled,
      };
    }
  );

  const variances = advanceActuals.map(toVariance);

  // FUNDING + CHARGEBACK post triggers — only when the per-entity flag is ON (default OFF => inert).
  const funding_posts: Array<{
    factoring_advance_id: string;
    posted: boolean;
    reason?: string;
    journal_entry_id?: string;
  }> = [];
  const chargeback_posts: Array<{
    factoring_advance_id: string;
    posted: boolean;
    reason?: string;
    journal_entry_id?: string;
    chargeback_amount_cents: number;
    default_interest_accruals_posted?: number;
  }> = [];
  if (postingEnabled) {
    for (const a of advanceActuals) {
      if (!isAdvanceComplete(a)) {
        funding_posts.push({
          factoring_advance_id: a.factoring_advance_id,
          posted: false,
          reason: "incomplete_advance",
        });
      } else {
        const result = await postFactoringAdvanceEvent({
          operating_company_id: input.operatingCompanyId,
          factoring_advance_id: a.factoring_advance_id,
          actor_user_id: input.userId,
          advanced_at_iso: statementDate,
          funding_figures: {
            invoice_total_cents: a.actual_gross_cents,
            reserve_cents: a.actual_reserve_cents,
            fee_cents: a.actual_fee_cents,
            ach_cents: 0,
          },
        });
        funding_posts.push({
          factoring_advance_id: a.factoring_advance_id,
          posted: result.posted,
          reason: result.reason,
          journal_entry_id: result.journal_entry_id,
        });
      }

      // CHARGEBACK: accrue contractual default interest through statement date first (missed-cron
      // completion) via canonical poster math — then exact linked liability includes compounded interest.
      if (a.actual_chargeback_cents > 0) {
        const accrued = await ensureDefaultInterestAccruedThroughDate({
          operating_company_id: input.operatingCompanyId,
          factoring_advance_id: a.factoring_advance_id,
          as_of_date_iso: statementDate,
          actor_user_id: input.userId,
        });
        const exact = await loadExactLinkedChargebackAmounts(
          input.operatingCompanyId,
          a.factoring_advance_id
        );
        if (
          exact.liability_cents <= 0 ||
          exact.recoursed_ar_cents <= 0 ||
          a.actual_chargeback_cents !== exact.liability_cents
        ) {
          chargeback_posts.push({
            factoring_advance_id: a.factoring_advance_id,
            posted: false,
            reason: "policy_partial_or_ambiguous_recourse",
            chargeback_amount_cents: a.actual_chargeback_cents,
            default_interest_accruals_posted: accrued.accruals_posted,
          });
        } else {
          const cb = await postFactoringChargebackEvent({
            operating_company_id: input.operatingCompanyId,
            factoring_advance_id: a.factoring_advance_id,
            actor_user_id: input.userId,
            charged_back_at_iso: statementDate,
            chargeback_amount_cents: exact.liability_cents,
            default_interest_cents: 0, // already compounded into liability via canonical accrual
            recoursed_ar_cents: exact.recoursed_ar_cents,
          });
          chargeback_posts.push({
            factoring_advance_id: a.factoring_advance_id,
            posted: cb.posted,
            reason: cb.reason,
            journal_entry_id: cb.journal_entry_id,
            chargeback_amount_cents: exact.liability_cents,
            default_interest_accruals_posted: accrued.accruals_posted,
          });
        }
      }
    }
  }

  return {
    import_id: importResult.id,
    statement_date: statementDate,
    line_count: parsed.lines.length,
    ...sideEffects,
    factoring_gl_posting_enabled: postingEnabled,
    variances,
    variance_count: variances.filter((v) => v.has_variance).length,
    incomplete_advance_count: variances.filter((v) => !v.is_complete).length,
    chargeback_total_cents: advanceActuals.reduce((sum, a) => sum + a.actual_chargeback_cents, 0),
    funding_posts,
    chargeback_posts,
  };
}
