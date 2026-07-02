// QBO Reports parser (IMPORT-0). Turns the raw QBO TrialBalance / GeneralLedger report envelope into
// flat, typed, exact-cents rows. Two hard rules drive every line of this file:
//
//   1. MONEY IS EXACT. Amounts are parsed to integer cents via string math (BigInt) — never parseFloat /
//      Number(), which lose precision on values like 1234.56 or accumulate float error across a ledger.
//      "" and missing cells parse to 0n (the v2 Reports API returns "" for empty cells, never null/0).
//
//   2. RESOLVE BY METADATA, NEVER BY INDEX. Column positions are not guaranteed and differ between the
//      v1 and v2 Reports backends. Every field is located via the Columns metadata (ColTitle / ColType);
//      no field is read by a hardcoded array position.
//
// GeneralLedger id note (verified against Intuit's Report Entities Reference + CData column docs,
// 2026-07-02): the GL report does NOT expose a transaction id as a `columns` value. The stable
// per-transaction id is carried on the JSON ColData cell `id` attribute (QBO attaches `id`/`href` to the
// cell that links to the entity — the account-section Header cell carries the account id; a transaction
// row's cell carries the txn id). There is NO native per-posting-LINE id in the report, so
// `posting_line_key` is a DOCUMENTED deterministic composite `{qbo_txn_id}:{qbo_account_id}:{seq}` —
// it is derived transparently here, not a silently-invented synthetic id. Rows with no txn id (Beginning
// Balance rows, account/section totals) are NOT postings and are skipped.

import type {
  QboReportResponse,
  QboReportColumn,
  QboReportColData,
  QboReportRow,
} from "./qbo-client.js";

// ── exact-cents money parsing ───────────────────────────────────────────────

/**
 * Parse a QBO money string to integer cents (BigInt) using exact string math. Never uses parseFloat.
 * Handles: "", commas ("1,234.56"), currency/whitespace, leading-minus and accounting parentheses
 * ("(1,234.56)" = negative), and a missing/short fractional part. Truncates (does not round) beyond
 * 2 decimals — QBO money is always 2dp, so this is loss-free in practice and deterministic if not.
 * "" / null / undefined → 0n.
 */
export function amountToCents(raw: string | number | null | undefined): bigint {
  if (raw === null || raw === undefined) return 0n;
  let s = String(raw).trim();
  if (s === "") return 0n;

  let negative = false;
  // Accounting-style negative: (1,234.56)
  if (/^\(.*\)$/.test(s)) {
    negative = !negative;
    s = s.slice(1, -1).trim();
  }
  // Strip currency symbols, commas, and any remaining whitespace.
  s = s.replace(/[,$\s]/g, "");
  if (s.startsWith("-")) {
    negative = !negative;
    s = s.slice(1);
  } else if (s.startsWith("+")) {
    s = s.slice(1);
  }
  if (s === "" || s === ".") return 0n;
  if (!/^\d*\.?\d*$/.test(s)) {
    throw new Error(`Unparseable QBO money value: ${JSON.stringify(raw)}`);
  }

  const [intPart, fracRaw = ""] = s.split(".");
  const frac = (fracRaw + "00").slice(0, 2); // pad then truncate to exactly 2 digits
  const cents = BigInt(intPart === "" ? "0" : intPart) * 100n + BigInt(frac === "" ? "0" : frac);
  return negative ? -cents : cents;
}

// ── column resolution (by metadata, never by index) ─────────────────────────

type ColMatch = { title?: string | string[]; type?: string | string[] };

function norm(v: string | undefined): string {
  return (v ?? "").trim().toLowerCase();
}

function matches(col: QboReportColumn, m: ColMatch): boolean {
  if (m.title !== undefined) {
    const titles = (Array.isArray(m.title) ? m.title : [m.title]).map(norm);
    if (titles.includes(norm(col.ColTitle))) return true;
  }
  if (m.type !== undefined) {
    const types = (Array.isArray(m.type) ? m.type : [m.type]).map(norm);
    if (types.includes(norm(col.ColType))) return true;
  }
  return false;
}

/** Index of the first column matching any of the given criteria, or -1. */
function findColIndex(columns: QboReportColumn[], ...criteria: ColMatch[]): number {
  for (const c of criteria) {
    const idx = columns.findIndex((col) => matches(col, c));
    if (idx >= 0) return idx;
  }
  return -1;
}

function getColumns(report: QboReportResponse): QboReportColumn[] {
  return report.Columns?.Column ?? [];
}

function cellValue(colData: QboReportColData[] | undefined, idx: number): string {
  if (!colData || idx < 0 || idx >= colData.length) return "";
  return colData[idx]?.value ?? "";
}

/** First non-empty `id` attribute across a row's cells (QBO puts the entity id on the linking cell). */
function firstCellId(colData: QboReportColData[] | undefined): string {
  if (!colData) return "";
  for (const cell of colData) {
    if (cell?.id && cell.id.trim() !== "") return cell.id.trim();
  }
  return "";
}

function flattenRows(rows: QboReportRow[] | undefined): QboReportRow[] {
  return rows ?? [];
}

// ── Trial Balance ───────────────────────────────────────────────────────────

export type TrialBalanceLine = {
  qbo_account_id: string;
  account_name: string;
  debit_cents: bigint;
  credit_cents: bigint;
};

export type ParsedTrialBalance = {
  reportBasis: string; // "Accrual" | "Cash" (whatever QBO reports)
  startPeriod: string; // ISO date from the report header (may be "")
  endPeriod: string; // ISO date — the "as of" date for a TB
  currency: string;
  lines: TrialBalanceLine[];
};

/**
 * Parse a TrialBalance report into per-account debit/credit cents. Account rows are identified by a
 * non-empty account id on the account cell; summary/GrandTotal rows (no id) are skipped. Recurses into
 * nested Rows so grouped/parent-account layouts are handled.
 */
export function parseTrialBalance(report: QboReportResponse): ParsedTrialBalance {
  const columns = getColumns(report);
  const accountIdx = findColIndex(columns, { type: "Account" }, { title: ["", "Account"] });
  const debitIdx = findColIndex(columns, { title: "Debit" });
  const creditIdx = findColIndex(columns, { title: "Credit" });

  const acctCol = accountIdx >= 0 ? accountIdx : 0; // account is conventionally the first column
  const lines: TrialBalanceLine[] = [];

  const walk = (rows: QboReportRow[] | undefined) => {
    for (const row of flattenRows(rows)) {
      if (row.Rows?.Row) {
        // A section header may itself be an account with an id (parent account) — capture it too.
        const headerId = firstCellId(row.Header?.ColData);
        if (headerId) {
          lines.push({
            qbo_account_id: headerId,
            account_name: cellValue(row.Header?.ColData, acctCol) || cellValue(row.Header?.ColData, 0),
            debit_cents: amountToCents(cellValue(row.Summary?.ColData ?? row.Header?.ColData, debitIdx)),
            credit_cents: amountToCents(cellValue(row.Summary?.ColData ?? row.Header?.ColData, creditIdx)),
          });
        }
        walk(row.Rows.Row);
        continue;
      }
      const colData = row.ColData;
      if (!colData) continue;
      const acctId = colData[acctCol]?.id?.trim() ?? "";
      if (!acctId) continue; // summary / grand-total row → skip
      lines.push({
        qbo_account_id: acctId,
        account_name: cellValue(colData, acctCol),
        debit_cents: amountToCents(cellValue(colData, debitIdx)),
        credit_cents: amountToCents(cellValue(colData, creditIdx)),
      });
    }
  };
  walk(report.Rows?.Row);

  return {
    reportBasis: report.Header?.ReportBasis ?? "",
    startPeriod: report.Header?.StartPeriod ?? "",
    endPeriod: report.Header?.EndPeriod ?? "",
    currency: report.Header?.Currency ?? "",
    lines,
  };
}

// ── General Ledger ──────────────────────────────────────────────────────────

export type GeneralLedgerLine = {
  qbo_account_id: string;
  account_name: string;
  txn_date: string;
  txn_type: string;
  qbo_txn_id: string;
  doc_num: string;
  name: string;
  memo: string;
  debit_cents: bigint;
  credit_cents: bigint;
  /** Deterministic composite key `{qbo_txn_id}:{qbo_account_id}:{seq}` — the GL report has no native
   *  per-posting-line id (documented in the file header). NOT a synthetic transaction id. */
  posting_line_key: string;
};

export type ParsedGeneralLedger = {
  reportBasis: string;
  startPeriod: string;
  endPeriod: string;
  currency: string;
  lines: GeneralLedgerLine[];
};

/**
 * Parse a GeneralLedger report into a flat list of posting lines, one per real transaction line, grouped
 * by the enclosing account section. Every field is resolved via column metadata. Rows without a stable
 * txn id (Beginning Balance rows, account/section totals) are not postings and are skipped. Request the
 * report with columns guaranteeing tx_date, txn_type, doc_num, name, memo, debt_amt, credit_amt.
 */
export function parseGeneralLedger(report: QboReportResponse): ParsedGeneralLedger {
  const columns = getColumns(report);
  const dateIdx = findColIndex(columns, { title: ["Date", "Tx Date"] }, { type: "Date" });
  const typeIdx = findColIndex(columns, { title: ["Transaction Type", "Txn Type", "Type"] });
  const docIdx = findColIndex(columns, { title: ["Num", "Doc Num", "No."] });
  const nameIdx = findColIndex(columns, { title: ["Name"] });
  const memoIdx = findColIndex(columns, { title: ["Memo/Description", "Memo", "Description"] });
  const debitIdx = findColIndex(columns, { title: ["Debit"] });
  const creditIdx = findColIndex(columns, { title: ["Credit"] });
  const amountIdx = findColIndex(columns, { title: ["Amount"] });

  const lines: GeneralLedgerLine[] = [];
  // seq counter per (txn, account) so the composite posting_line_key is stable and unique within a report.
  const seqByTxnAccount = new Map<string, number>();

  const walk = (rows: QboReportRow[] | undefined, acctId: string, acctName: string) => {
    for (const row of flattenRows(rows)) {
      // An account section: Header carries the account id; recurse into its rows with that context.
      if (row.Rows?.Row) {
        const headerId = firstCellId(row.Header?.ColData);
        const headerName = cellValue(row.Header?.ColData, 0);
        walk(row.Rows.Row, headerId || acctId, headerName || acctName);
        continue;
      }
      const colData = row.ColData;
      if (!colData) continue;

      const txnId = firstCellId(colData);
      if (!txnId) continue; // Beginning Balance / total / non-transaction row → skip

      // Debit/Credit: prefer explicit columns; fall back to a signed Amount column if that's all we got.
      let debit: bigint;
      let credit: bigint;
      if (debitIdx >= 0 || creditIdx >= 0) {
        debit = amountToCents(cellValue(colData, debitIdx));
        credit = amountToCents(cellValue(colData, creditIdx));
      } else {
        const amt = amountToCents(cellValue(colData, amountIdx));
        debit = amt >= 0n ? amt : 0n;
        credit = amt < 0n ? -amt : 0n;
      }

      const keyBase = `${txnId}:${acctId}`;
      const seq = seqByTxnAccount.get(keyBase) ?? 0;
      seqByTxnAccount.set(keyBase, seq + 1);

      lines.push({
        qbo_account_id: acctId,
        account_name: acctName,
        txn_date: cellValue(colData, dateIdx),
        txn_type: cellValue(colData, typeIdx),
        qbo_txn_id: txnId,
        doc_num: cellValue(colData, docIdx),
        name: cellValue(colData, nameIdx),
        memo: cellValue(colData, memoIdx),
        debit_cents: debit,
        credit_cents: credit,
        posting_line_key: `${keyBase}:${seq}`,
      });
    }
  };
  walk(report.Rows?.Row, "", "");

  return {
    reportBasis: report.Header?.ReportBasis ?? "",
    startPeriod: report.Header?.StartPeriod ?? "",
    endPeriod: report.Header?.EndPeriod ?? "",
    currency: report.Header?.Currency ?? "",
    lines,
  };
}

// ── date-range chunking (≤ 1 calendar month per chunk) ──────────────────────

type YMD = { y: number; m: number; d: number }; // m is 1-12

function parseISODate(iso: string): YMD {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso.trim());
  if (!match) throw new Error(`Expected YYYY-MM-DD date, got: ${JSON.stringify(iso)}`);
  return { y: Number(match[1]), m: Number(match[2]), d: Number(match[3]) };
}

function daysInMonth(y: number, m: number): number {
  // Day 0 of month m+1 (1-based) is the last day of month m. Date.UTC handles leap years.
  return new Date(Date.UTC(y, m, 0)).getUTCDate();
}

function cmp(a: YMD, b: YMD): number {
  if (a.y !== b.y) return a.y - b.y;
  if (a.m !== b.m) return a.m - b.m;
  return a.d - b.d;
}

function fmt(v: YMD): string {
  return `${String(v.y).padStart(4, "0")}-${String(v.m).padStart(2, "0")}-${String(v.d).padStart(2, "0")}`;
}

export type DateChunk = { start: string; end: string };

/**
 * Split [startISO, endISO] (inclusive, YYYY-MM-DD) into contiguous calendar-month chunks with no gaps
 * and no overlaps. First/last chunks are clipped to the exact start/end days. Enforces the QBO Reports
 * "≤ 6 months per request" guidance by construction (one month per chunk). Single-month and partial-month
 * ranges yield a single clipped chunk.
 */
export function chunkDateRangeMonthly(startISO: string, endISO: string): DateChunk[] {
  const start = parseISODate(startISO);
  const end = parseISODate(endISO);
  if (cmp(start, end) > 0) {
    throw new Error(`chunkDateRangeMonthly: start ${startISO} is after end ${endISO}`);
  }

  const chunks: DateChunk[] = [];
  let y = start.y;
  let m = start.m;
  while (true) {
    const monthStart: YMD = { y, m, d: 1 };
    const monthEnd: YMD = { y, m, d: daysInMonth(y, m) };
    const chunkStart = cmp(monthStart, start) < 0 ? start : monthStart;
    const chunkEnd = cmp(monthEnd, end) > 0 ? end : monthEnd;
    chunks.push({ start: fmt(chunkStart), end: fmt(chunkEnd) });
    if (cmp(monthEnd, end) >= 0) break;
    m += 1;
    if (m > 12) {
      m = 1;
      y += 1;
    }
  }
  return chunks;
}
