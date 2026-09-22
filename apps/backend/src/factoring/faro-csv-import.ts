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

// ROUND 40.1 — OWNER RULING 2026-09-23 (verbatim mapping): the owner's real Faro export
// ("PURCHASE REPORT ALL.csv") never carried these literal column names — it carries Faro's own
// vocabulary (Debtor/Inv #/Purchase/Net Adv/Escrow Rsv/Fees/ChgBack (Refund)/PO/Date). "ACCEPT THE
// OWNER'S REAL EXPORT FORMAT. Do not ask him to reshape a CSV that Faro generates." Confirmed live
// this round: the old literal-required-header check rejected the real file outright with
// `missing_headers`, so this importer had never actually run against a real Faro export — every
// prior "confirmed match" in this session's rulings was reasoned from reading the CSV by eye, not
// from a successful parse. These are the SAME canonical field names as before (ORIGINAL required
// names kept so any existing caller/test still works) — only the header-RESOLUTION widened to
// accept the real export's own column names as additional aliases, additive, nothing removed.
export const FARO_CSV_REQUIRED_HEADERS = [
  "invoice number",
  "customer name",
  "gross",
  "advance",
  "reserve",
  "fee",
  "chargeback",
] as const;

// "net" is intentionally NOT in FARO_CSV_REQUIRED_HEADERS as of this ruling — the owner's real
// export has no column that maps to it (Receipts/Sch Fee are distinct Faro concepts the owner's
// mapping does not equate to "net"), and inventing a formula for it would be exactly the guess this
// codebase's own law forbids. net_amount_cents stays on FaroCsvLine, defaults to 0 when absent, same
// optionality due_on already had before this change — never silently required, never fabricated.
export type FaroCsvLine = {
  invoice_number: string;
  customer_name?: string;
  gross_amount_cents: number;
  advance_amount_cents: number;
  reserve_amount_cents: number;
  fee_amount_cents: number;
  chargeback_amount_cents: number;
  net_amount_cents: number;
  discount_amount_cents: number;
  due_on?: string;
  /** ROUND 40.1 — Faro's own match key, from the "PO" column (falls back to "Other Ref"). Owner
   *  ruling: "MATCH KEY -> PO, then Other Ref. NEVER the load number." Resolved against
   *  mdata.loads.customer_wo_number, then customer_po_number — never mdata.loads.load_number.
   *  Captured here (parse-time) so preview/commit matching has it; parseFaroCsv itself does not
   *  resolve it against loads — that is a DB-aware step, done by enrichFaroPreviewLines. */
  match_key?: string;
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

// ROUND 40.1 \u2014 one alias table, shared by both the required-header CHECK and the field-index
// RESOLUTION, so the two can never drift out of sync again (that drift \u2014 required-header checking a
// literal list while headerIndex() already had working aliases the check never consulted \u2014 is
// exactly what rejected the real Faro file before this fix). Each canonical field lists every header
// spelling known to resolve it, owner's real export names included.
const FARO_CSV_FIELD_ALIASES = {
  "invoice number": ["invoice number", "invoice #", "invoice", "inv #"],
  "customer name": ["customer name", "customer", "debtor"],
  gross: ["gross", "invoice amount", "face amount", "purchase"],
  advance: ["advance", "advance amount", "net adv"],
  reserve: ["reserve", "reserve amount", "withholding", "escrow rsv"],
  // ROUND 48 — OWNER RULING 2026-09-23 (verbatim): "fee = Discount". The real export carries BOTH a
  // "Discount" column and a separate "Fees" column — they are NOT the same thing, and "fees" (the
  // original, pre-ruling alias) would silently resolve to the wrong one. "discount"/"discount fee"
  // are listed FIRST so headerIndex()'s first-match order picks the correct column whenever both are
  // present; "fee"/"factor fee"/"fees" stay as trailing fallbacks for a export that genuinely has no
  // "Discount" column and means the factor fee by "Fees" instead — never reached against the real
  // Faro file, since "discount" always matches first there.
  fee: ["discount", "discount fee", "fee", "factor fee", "fees"],
  chargeback: ["chargeback", "chargeback amount", "chgback (refund)"],
} as const satisfies Record<(typeof FARO_CSV_REQUIRED_HEADERS)[number], readonly string[]>;

export function parseFaroCsv(csvText: string): FaroCsvParseResult {
  const rows = csvText
    .replace(/^\uFEFF/, "")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
  if (rows.length < 2) throw new FaroCsvImportError("empty_csv", "CSV must include a header row and at least one data row");

  const headers = parseCsvRow(rows[0] ?? "");
  const normalizedHeaders = headers.map(normalizeHeader);

  // ROUND 40.1 \u2014 required-ness is now checked via the SAME alias resolution headerIndex() uses for
  // parsing, not a literal-name-only list. "Unknown header -> a NAMED error listing what it saw and
  // what it expected. NEVER a silent skip" (owner ruling) \u2014 the error below names every alias tried
  // for the missing field AND the full observed header row, so a genuinely new Faro export format
  // is loud and specific, not a bare "missing column: x" that gives no way to fix it.
  const missingFields = (Object.keys(FARO_CSV_FIELD_ALIASES) as (keyof typeof FARO_CSV_FIELD_ALIASES)[]).filter(
    (field) => headerIndex(headers, [...FARO_CSV_FIELD_ALIASES[field]]) < 0
  );
  if (missingFields.length > 0) {
    const detail = missingFields
      .map((field) => `"${field}" (tried: ${FARO_CSV_FIELD_ALIASES[field].join(", ")})`)
      .join("; ");
    throw new FaroCsvImportError(
      "missing_headers",
      `Missing required column(s): ${detail}. Observed header row: ${headers.join(", ")}`
    );
  }

  const invoiceIdx = headerIndex(headers, [...FARO_CSV_FIELD_ALIASES["invoice number"]]);
  const customerIdx = headerIndex(headers, [...FARO_CSV_FIELD_ALIASES["customer name"]]);
  const grossIdx = headerIndex(headers, [...FARO_CSV_FIELD_ALIASES.gross]);
  const advanceIdx = headerIndex(headers, [...FARO_CSV_FIELD_ALIASES.advance]);
  const reserveIdx = headerIndex(headers, [...FARO_CSV_FIELD_ALIASES.reserve]);
  const feeIdx = headerIndex(headers, [...FARO_CSV_FIELD_ALIASES.fee]);
  const chargebackIdx = headerIndex(headers, [...FARO_CSV_FIELD_ALIASES.chargeback]);
  // "net" deliberately stays OUTSIDE FARO_CSV_FIELD_ALIASES (see the FaroCsvLine comment above) \u2014
  // optional, defaults to 0, never required, never guessed at from an unrelated column.
  const netIdx = headerIndex(headers, ["net", "net amount"]);
  // ROUND 48 — proven, not just aliased: the owner's ruling confirmed "Discount" IS the factor fee
  // (fee = Discount), so discountIdx and feeIdx now resolve to the SAME column on the real export.
  // discount_amount_cents stays as its own field (additive, kept for any existing caller) rather than
  // removed now that it's a confirmed duplicate of fee_cents.
  const discountIdx = headerIndex(headers, ["discount"]);
  // "due date"/"due on"/"due" are this importer's original due-date vocabulary; "date" is the owner's
  // real export's per-row transaction date column \u2014 same role (the economic/statement date this line
  // carries), added as an alias, not a new concept.
  const dueIdx = headerIndex(headers, ["due date", "due on", "due", "date"]);
  // MATCH KEY (owner ruling): "PO", then "Other Ref" as fallback. Never load number \u2014 parseFaroCsv
  // has no load data to resolve against anyway; this only captures the raw cell.
  const matchKeyIdx = headerIndex(headers, ["po", "other ref"]);

  // ROUND28-P0 (2026-09-22): the old `if (!invoice_number) continue;` here silently dropped any
  // data row whose invoice-number cell was empty — no count, no warning, no trace. A 51-row
  // statement could parse into a 34-line result with parseFaroCsv reporting total success. This
  // codebase's own money-import law is "no raw SQL AND no silent swallow": every one of `rows.slice(1)`
  // must end as either a stored line or a NAMED rejection — never neither. Money-value cells still
  // fail loud on their own (parseMoneyToCents already throws FaroCsvImportError on anything
  // unparseable, unchanged) — the only thing that used to disappear silently was a blank invoice
  // number, so that is the one case turned into a named, aggregated rejection below.
  const dataRows = rows.slice(1);
  const lines: FaroCsvLine[] = [];
  const rejected: Array<{ row_number: number; raw: string; reason: string }> = [];
  dataRows.forEach((row, idx) => {
    const cells = parseCsvRow(row);
    const invoice_number = String(cells[invoiceIdx] ?? "").trim();
    if (!invoice_number) {
      rejected.push({ row_number: idx + 2, raw: row, reason: "blank invoice number cell" });
      return;
    }
    lines.push({
      invoice_number,
      customer_name: customerIdx >= 0 ? String(cells[customerIdx] ?? "").trim() || undefined : undefined,
      gross_amount_cents: parseMoneyToCents(String(cells[grossIdx] ?? "0")),
      advance_amount_cents: parseMoneyToCents(String(cells[advanceIdx] ?? "0")),
      reserve_amount_cents: parseMoneyToCents(String(cells[reserveIdx] ?? "0")),
      fee_amount_cents: parseMoneyToCents(String(cells[feeIdx] ?? "0")),
      chargeback_amount_cents: parseMoneyToCents(String(cells[chargebackIdx] ?? "0")),
      net_amount_cents: netIdx >= 0 ? parseMoneyToCents(String(cells[netIdx] ?? "0")) : 0,
      discount_amount_cents: discountIdx >= 0 ? parseMoneyToCents(String(cells[discountIdx] ?? "0")) : 0,
      due_on: dueIdx >= 0 ? parseDueDate(String(cells[dueIdx] ?? "")) : undefined,
      match_key: matchKeyIdx >= 0 ? String(cells[matchKeyIdx] ?? "").trim() || undefined : undefined,
    });
  });

  if (rejected.length > 0) {
    const detail = rejected
      .map((r) => `row ${r.row_number} (${r.reason}): ${JSON.stringify(r.raw)}`)
      .join("; ");
    throw new FaroCsvImportError(
      "invalid_csv",
      `Faro CSV rejected ${rejected.length} of ${dataRows.length} data row(s) — a partial import is never committed. ` +
        `Parsed ${lines.length}, rejected ${rejected.length}. Rejected rows: ${detail}`
    );
  }

  if (lines.length === 0) throw new FaroCsvImportError("invalid_csv", "No invoice rows found in CSV");
  // Invariant: every data row is now accounted for exactly once (stored line XOR named rejection
  // above, which already returned/thrown). If this ever fails, some new code path is silently
  // dropping rows again the same way this fix just closed — fail loud, do not let it slide.
  if (lines.length !== dataRows.length) {
    throw new FaroCsvImportError(
      "invalid_csv",
      `Faro CSV parse invariant violated: ${dataRows.length} data row(s) in, ${lines.length} line(s) out, 0 rejected — a row was dropped without being named. This is a bug in parseFaroCsv, not a data problem.`
    );
  }

  // Economic/statement date from parsed due_on when present — never invent UTC "today".
  const statementDate = lines.find((l) => l.due_on)?.due_on;
  return { headers, lines, statement_date: statementDate };
}

type Queryable = {
  query: <R = Record<string, unknown>>(sql: string, values?: unknown[]) => Promise<{ rows: R[]; rowCount?: number }>;
};

/**
 * Preview-only: resolve TMS invoice + customer ids for Faro CSV lines (Law §9 reverse drill).
 *
 * ROUND 40.1 — OWNER RULING: "MATCH KEY -> PO, then Other Ref. NEVER the load number." Faro's own
 * `invoice_number` column (e.g. "#90", "#64") is Faro's INTERNAL sequence, unrelated to our
 * `accounting.invoices.display_id` — the direct-match query below finds real rows only by
 * coincidence, never by design. The PO-based lookup is the real match path this codebase's own
 * earlier session work already confirmed live (customer_wo_number, then customer_po_number —
 * NEVER load_number): PO -> mdata.loads -> that load's own invoice(s). Both paths run; a line that
 * resolves via the direct display_id match keeps that (still a real, if coincidental, match); a line
 * that resolves ONLY via PO is filled in from that lookup instead. A line matching NEITHER stays
 * unmatched — never guessed, never defaulted to the first invoice found.
 */
export async function enrichFaroPreviewLines(
  client: Queryable,
  companyId: string,
  lines: FaroCsvLine[]
): Promise<FaroCsvPreviewLine[]> {
  if (lines.length === 0) return [];
  const numbers = Array.from(new Set(lines.map((l) => l.invoice_number).filter(Boolean)));
  const poKeys = Array.from(new Set(lines.map((l) => l.match_key).filter((v): v is string => Boolean(v))));

  const byDisplay = new Map<
    string,
    { id: string; display_id: string; customer_id: string | null; customer_name: string | null }
  >();
  if (numbers.length > 0) {
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
    for (const row of res.rows) byDisplay.set(row.display_id, row);
  }

  // PO -> mdata.loads.customer_wo_number, then customer_po_number (never load_number) -> that load's
  // own live (non-voided) invoice. A PO value could in principle match more than one load's WO/PO
  // field — that ambiguity must be visible, not silently resolved to "the first row" — so this only
  // fills in a match when exactly one candidate load resolves for a given PO key.
  const byPoKey = new Map<
    string,
    { id: string; display_id: string; customer_id: string | null; customer_name: string | null }
  >();
  if (poKeys.length > 0) {
    const res = await client.query<{
      match_key: string;
      candidate_count: number;
      id: string | null;
      display_id: string | null;
      customer_id: string | null;
      customer_name: string | null;
    }>(
      `
        WITH po_keys AS (SELECT unnest($2::text[]) AS match_key),
        matched_loads AS (
          SELECT pk.match_key, l.id AS load_id
          FROM po_keys pk
          JOIN mdata.loads l
            ON l.operating_company_id = $1::uuid
           AND (l.customer_wo_number = pk.match_key OR l.customer_po_number = pk.match_key)
        )
        SELECT
          ml.match_key,
          count(DISTINCT ml.load_id)::int AS candidate_count,
          (array_agg(i.id::text ORDER BY i.created_at DESC))[1] AS id,
          (array_agg(i.display_id::text ORDER BY i.created_at DESC))[1] AS display_id,
          (array_agg(i.customer_id::text ORDER BY i.created_at DESC))[1] AS customer_id,
          (array_agg(c.customer_name ORDER BY i.created_at DESC))[1] AS customer_name
        FROM matched_loads ml
        LEFT JOIN accounting.invoices i
               ON i.source_load_id = ml.load_id
              AND i.operating_company_id = $1::uuid
              AND i.voided_at IS NULL
        LEFT JOIN mdata.customers c
               ON c.id = i.customer_id
              AND c.operating_company_id = i.operating_company_id
        GROUP BY ml.match_key
      `,
      [companyId, poKeys]
    );
    for (const row of res.rows) {
      // Only a single matched load AND a real invoice on it counts as a resolved PO match —
      // multiple candidate loads for one PO, or a load with no live invoice, stays unmatched rather
      // than guessing which one Faro meant.
      if (row.candidate_count === 1 && row.id && row.display_id) {
        byPoKey.set(row.match_key, {
          id: row.id,
          display_id: row.display_id,
          customer_id: row.customer_id,
          customer_name: row.customer_name,
        });
      }
    }
  }

  return lines.map((line) => {
    const match = byDisplay.get(line.invoice_number) ?? (line.match_key ? byPoKey.get(line.match_key) : undefined);
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
    const wasNewlyAdvanced = Boolean(invoiceRes.rows[0]);
    if (wasNewlyAdvanced) invoices_updated += 1;

    // ACCT-F5614 — honest flag-OFF = ZERO financial rows written (the same "TIER-1 FINANCIAL,
    // BUILD-AND-HOLD" law this codebase enforces everywhere else, e.g.
    // settlement-payrun-close.service.ts's own header). This write previously ran unconditionally
    // on EVERY CSV line regardless of FACTORING_GL_POSTING_FLAG, so factoring.reserve_movement /
    // factoring.v_factor_reserve_balance (served live via GET /factoring/reserve-balance) could show
    // a real, non-zero reserve figure with ZERO corresponding GL entry the moment an entity's flag
    // was OFF -- indistinguishable from a genuine posted reserve to anyone reading that screen.
    //
    // ACCT-F5650 — `wasNewlyAdvanced` gate + the reserve_movement existence check below. This write
    // previously ran unconditionally regardless of whether the invoice UPDATE above actually matched
    // a row, and postReserveMovement() is a pure append-only INSERT with NO idempotency check of its
    // own (no unique constraint on factoring.reserve_movement either). Re-uploading the same Faro CSV
    // file -- the natural retry after ANY downstream failure in this same import (the funding/
    // chargeback posting loop below runs on separate, later connections with no enclosing
    // transaction), or simply an honest duplicate upload -- silently re-credited the reserve for
    // every already-advanced line a second time: a real double-credit to TRK's factoring reserve
    // (secured-borrowing collateral) invisible on the GET /factoring/reserve-balance screen. Gating
    // on `wasNewlyAdvanced` reuses this function's own `WHERE ... IN ('not_factored', 'submitted')`
    // transition as the durable "already handled" signal; the existence check on `reason` is
    // defense-in-depth using the same per-invoice key this file already builds, matching the
    // "memo-keyed idempotent" convention this file's own comment (above, on the funding posters)
    // establishes for JE posting.
    if (wasNewlyAdvanced && line.reserve_amount_cents > 0 && postingEnabled) {
      const reasonKey = `faro_csv:${line.invoice_number}`;
      const dup = await client.query<{ exists: boolean }>(
        `SELECT 1 FROM factoring.reserve_movement WHERE operating_company_id = $1::uuid AND reason = $2::text LIMIT 1`,
        [companyId, reasonKey]
      );
      if (!dup.rows[0]) {
        await postReserveMovement(null, companyId, "credit", line.reserve_amount_cents, reasonKey, {
          client,
          factorId,
        });
        reserve_movements += 1;
      }
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
        -- ENTITY PREDICATE (CLS-JOIN-ENTITY-UNSCOPED): i is scoped by the WHERE below, but the
        -- advance whose display_id and factor_fee_cents this projects was not.
        JOIN accounting.factoring_advances fa ON fa.id = i.factoring_advance_id
                                              AND fa.operating_company_id = i.operating_company_id
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
