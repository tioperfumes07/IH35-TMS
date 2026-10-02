// Lead 2026-10-02 (00-LEAD-APPROVAL-2026-10-02-FARO-REPORTS-ARE-THE-BANK-FEED-BUILD-IT.md) — each Faro reserve report is the
// bank feed for its register: "Escrow Reserve Entries" -> Faro Escrow Reserve (GL 1230, factor_reserve_held), "Cash Reserve
// Entries" -> Faro Cash Reserve (GL 1235, factor_cash_reserve_held). Every report line becomes ONE document row
// (accounting.faro_reserve_entries) and ONE bank line on its register, and posts only when someone posts it in Banking.
//
// IMPORT (owner runs it; nobody seeds): every row's shape is validated and a row that does not match is REJECTED, listed,
// never guessed — e.g. escrow row 405560 prints Inv "1013272-2" / PO "059", swapped against every other row. Re-importing
// a report adds nothing (identity: register, Faro ID, date, amount, note, occurrence).
//
// POSTERS (they never decide — they post what the line says), every leg stamped source 'faro_reserve_entry' + customer:
//   escrow_held      no entry of its own: it is the DR 1230 inside the purchase's funding JE; the bank line is matched to
//                    that JE, and Faro's amount must equal the purchase line's escrow reserve
//   escrow_to_cash   DR 1235 / CR 1230 — one JE for the pair (same Faro ID on both reports), both bank lines matched to it
//   schedule_fee     Faro's "Schedule Fee" IS the contract Default Interest (proven 11/11 on Faro's report): interest
//                    through the fee date is accrued first (event run, maker <> checker), then DR 2155 / CR 1235 with
//                    any difference to Faro's figure trued up to 6830 — never 6405
//   short_pay        DR 2150 factoring_advance_liability / CR 1235 — Faro satisfies the unpaid part of its advance from our
//                    reserve; the customer's A/R keeps the unpaid part open (customer-pays-Faro relieved only what was
//                    paid), so the variance stays visible on the customer, with Faro's Balance / Paid recorded here
//   client_payable   to IH 35 TRANSPORTATION: DR 8000 intercompany_receivable_ih35_transportation / CR 1235 (USMCA side
//                    only, never income or cost). To us: a transfer — it posts when matched to our bank line, not here.
//   rsv_deposit      Faro holds it back from a payment wire (Payments − Deposits = net wired): it posts as part of that
//                    payment's match, not here. faroReserveDepositsOn() exposes the day's deposits to the match engine.
import { createHash } from "node:crypto";
import { resolveRoleAccount } from "../accounting/coa-roles/resolver.service.js";
import { createJournalEntryOnClient } from "../accounting/journal-entries.service.js";
import { writeFactoringSpineLinks } from "./factoring-spine-links.js";
import { interestPositionThrough, proposeEventInterestAccrual } from "./interest-accrual.service.js";

type DbClient = {
  query: <T = Record<string, unknown>>(sql: string, values?: unknown[]) => Promise<{ rows: T[]; rowCount?: number | null }>;
};

export type FaroRegister = "escrow" | "cash";
export type FaroEntryKind = "escrow_held" | "escrow_to_cash" | "schedule_fee" | "short_pay" | "rsv_deposit" | "client_payable";

export class FaroReserveError extends Error {
  constructor(public readonly code: string) {
    super(code);
  }
}

export const FARO_REPORT_COLUMNS = ["ID", "Inv", "PO Ref#", "Debtor", "Pmt Ref", "Note", "Date", "Amount", "Balance"] as const;
const FARO_INVOICE_NUMBER = /^\d{1,6}$/;
const KINDS_BY_REGISTER: Record<FaroRegister, FaroEntryKind[]> = {
  escrow: ["escrow_held", "escrow_to_cash"],
  cash: ["escrow_to_cash", "schedule_fee", "short_pay", "rsv_deposit", "client_payable"],
};
const INVOICE_KINDS: FaroEntryKind[] = ["escrow_held", "escrow_to_cash", "schedule_fee", "short_pay"];

/** RFC-4180 line splitter (quoted fields, "" escapes, commas inside quotes like "5,000.00"). */
export function splitCsvLine(line: string): string[] {
  const out: string[] = [];
  let cur = "";
  let q = false;
  for (let i = 0; i < line.length; i += 1) {
    const ch = line[i]!;
    if (q) {
      if (ch === '"' && line[i + 1] === '"') { cur += '"'; i += 1; }
      else if (ch === '"') q = false;
      else cur += ch;
    } else if (ch === '"') q = true;
    else if (ch === ",") { out.push(cur); cur = ""; }
    else cur += ch;
  }
  out.push(cur);
  return out;
}

function toCents(raw: string): number | null {
  const t = raw.replace(/[$,\s]/g, "");
  if (!/^-?\d+(\.\d{1,2})?$/.test(t)) return null;
  return Math.round(Number(t) * 100);
}

function toIsoDate(raw: string): string | null {
  const m = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(raw.trim());
  if (!m) return null;
  const iso = `${m[3]}-${m[1]}-${m[2]}`;
  const d = new Date(`${iso}T00:00:00Z`);
  return Number.isNaN(d.getTime()) || d.toISOString().slice(0, 10) !== iso ? null : iso;
}

export function kindOf(note: string): FaroEntryKind | "beginning_balance" | null {
  const n = note.trim();
  if (/^Beginning Balance$/i.test(n)) return "beginning_balance";
  if (/^Escrow Reserve Held$/i.test(n)) return "escrow_held";
  if (/^Transfer Escrow to Cash$/i.test(n)) return "escrow_to_cash";
  if (/^Schedule Fee$/i.test(n)) return "schedule_fee";
  if (/^Balance:\s*[\d.,]+\s*::\s*Paid:\s*[\d.,]+\s*::\s*[\d.,]+\s+to Rsv/i.test(n)) return "short_pay";
  if (/^Rsv Deposit\b/i.test(n)) return "rsv_deposit";
  if (/^Client Payable\b/i.test(n)) return "client_payable";
  return null;
}

export type ParsedFaroRow = {
  line: number;
  faro_entry_id: string | null;
  entry_kind: FaroEntryKind;
  entry_date: string;
  amount_cents: number;
  running_balance_cents: number;
  faro_invoice_number: string | null;
  po_ref: string | null;
  debtor_name: string | null;
  pmt_ref: string | null;
  note: string;
  occurrence: number;
  short_pay_balance_cents: number | null;
  short_pay_paid_cents: number | null;
  counterparty: "ih35_transportation" | null;
};
export type RejectedFaroRow = { line: number; faro_entry_id: string | null; reason: string; detail?: string };

/** Parse and validate one Faro reserve report for `register`. Pure — reads nothing, writes nothing. */
export function parseFaroReserveReport(text: string, register: FaroRegister) {
  const lines = text.replace(/^﻿/, "").split(/\r?\n/).filter((l) => l.trim().length > 0);
  if (!lines.length) throw new FaroReserveError("faro_report_empty");
  const header = splitCsvLine(lines[0]!).map((h) => h.trim());
  if (header.join("|") !== FARO_REPORT_COLUMNS.join("|")) throw new FaroReserveError("faro_report_columns_do_not_match");

  const rows: ParsedFaroRow[] = [];
  const rejected: RejectedFaroRow[] = [];
  const seen = new Map<string, number>();
  let balance: number | null = null;
  let beginning: number | null = null;

  for (let i = 1; i < lines.length; i += 1) {
    const lineNo = i + 1;
    const c = splitCsvLine(lines[i]!).map((v) => v.trim());
    if (c.length !== FARO_REPORT_COLUMNS.length) {
      rejected.push({ line: lineNo, faro_entry_id: null, reason: "column_count", detail: `${c.length} fields` });
      continue;
    }
    const [id, inv, po, debtor, pmtRef, note, date, amount, bal] = c as [string, string, string, string, string, string, string, string, string];
    const kind = kindOf(note);
    const balCents = toCents(bal);
    const faroId = /^\d+$/.test(id) ? id : null;
    if (kind === "beginning_balance") {
      if (balCents == null) { rejected.push({ line: lineNo, faro_entry_id: null, reason: "beginning_balance_unreadable" }); continue; }
      beginning = balCents;
      balance = balCents;
      continue;
    }
    const reject = (reason: string, detail?: string) => rejected.push({ line: lineNo, faro_entry_id: faroId ?? (id || null), reason, detail });
    if (!kind) { reject("unknown_note", note); continue; }
    if (!KINDS_BY_REGISTER[register].includes(kind)) { reject("kind_not_on_this_register", `${kind} on ${register}`); continue; }
    const iso = toIsoDate(date);
    const cents = toCents(amount);
    if (!iso) { reject("date_unreadable", date); continue; }
    if (cents == null || cents === 0) { reject("amount_unreadable", amount); continue; }
    if (balCents == null) { reject("balance_unreadable", bal); continue; }

    // Running balance must carry: previous balance + this amount = printed balance. A row that breaks it is not Faro's.
    if (balance != null && balance + cents !== balCents) {
      reject("balance_discontinuity", `${balance} + ${cents} != ${balCents}`);
      balance = balCents;
      continue;
    }
    balance = balCents;

    const signOk =
      (kind === "escrow_held" && cents > 0) ||
      (kind === "escrow_to_cash" && (register === "escrow" ? cents < 0 : cents > 0)) ||
      ((kind === "schedule_fee" || kind === "short_pay" || kind === "client_payable") && cents < 0) ||
      (kind === "rsv_deposit" && cents > 0);
    if (!signOk) { reject("sign_does_not_match_kind", `${kind} ${cents}`); continue; }

    let faroInv: string | null = null;
    if (INVOICE_KINDS.includes(kind)) {
      if (!faroId) { reject("invoice_row_without_faro_id", id); continue; }
      if (!FARO_INVOICE_NUMBER.test(inv)) {
        // Faro numbers its invoices 001, 002, ...: a long or hyphenated Inv with a short numeric PO is the swap (405560).
        reject(FARO_INVOICE_NUMBER.test(po) ? "inv_po_swapped" : "inv_not_a_faro_invoice_number", `Inv "${inv}" / PO "${po}"`);
        continue;
      }
      faroInv = inv;
    } else if (faroId || (id && id !== "--")) {
      reject("reserve_transaction_with_invoice_id", id);
      continue;
    }

    let spBalance: number | null = null;
    let spPaid: number | null = null;
    if (kind === "short_pay") {
      const m = /^Balance:\s*([\d.,]+)\s*::\s*Paid:\s*([\d.,]+)\s*::\s*([\d.,]+)\s+to Rsv/i.exec(note)!;
      spBalance = toCents(m[1]!);
      spPaid = toCents(m[2]!);
      const toRsv = toCents(m[3]!);
      if (spBalance == null || spPaid == null || toRsv == null || spBalance - spPaid !== toRsv || toRsv !== -cents) {
        reject("short_pay_arithmetic", note);
        continue;
      }
    }

    const counterparty =
      (kind === "client_payable" || kind === "rsv_deposit") && /\bih\s?35\b/i.test(`${pmtRef} ${note}`) ? "ih35_transportation" : null;
    const key = `${faroId ?? "--"}|${iso}|${cents}|${note}`;
    const occurrence = (seen.get(key) ?? 0) + 1;
    seen.set(key, occurrence);
    rows.push({
      line: lineNo,
      faro_entry_id: faroId,
      entry_kind: kind,
      entry_date: iso,
      amount_cents: cents,
      running_balance_cents: balCents,
      faro_invoice_number: faroInv,
      po_ref: po || null,
      debtor_name: debtor && !/^--/.test(debtor) ? debtor : null,
      pmt_ref: pmtRef || null,
      note,
      occurrence,
      short_pay_balance_cents: spBalance,
      short_pay_paid_cents: spPaid,
      counterparty,
    });
  }
  return { rows, rejected, beginning_balance_cents: beginning, ending_balance_cents: balance };
}

/** The register a bank account is: by its GL role, never by its name. */
export async function registerOf(client: DbClient, oci: string, bankAccountId: string): Promise<FaroRegister> {
  const r = await client.query<{ role: string }>(
    `SELECT r.role FROM banking.bank_accounts b
       JOIN accounting.chart_of_accounts_roles r ON r.account_id = b.ledger_account_id AND r.operating_company_id = b.operating_company_id AND r.is_active
      WHERE b.id = $1::uuid AND b.operating_company_id = $2::uuid AND r.role IN ('factor_reserve_held', 'factor_cash_reserve_held')`,
    [bankAccountId, oci]
  );
  const roles = new Set(r.rows.map((x) => x.role));
  if (roles.size !== 1) throw new FaroReserveError("bank_account_is_not_a_faro_reserve_register");
  return roles.has("factor_reserve_held") ? "escrow" : "cash";
}

/** The one bank account that is `register` for this company (by its GL role). */
export async function registerBankAccountId(client: DbClient, oci: string, register: FaroRegister): Promise<string> {
  const r = await client.query<{ id: string }>(
    `SELECT b.id::text FROM banking.bank_accounts b
       JOIN accounting.chart_of_accounts_roles r ON r.account_id = b.ledger_account_id AND r.operating_company_id = b.operating_company_id AND r.is_active
      WHERE b.operating_company_id = $1::uuid AND b.is_active AND b.deactivated_at IS NULL AND r.role = $2`,
    [oci, register === "escrow" ? "factor_reserve_held" : "factor_cash_reserve_held"]
  );
  if (r.rows.length !== 1) throw new FaroReserveError(r.rows.length ? "faro_register_ambiguous" : "faro_register_not_found");
  return r.rows[0]!.id;
}

export async function getFaroReserveEntry(client: DbClient, oci: string, id: string) {
  const r = await client.query<{ id: string; register: FaroRegister; bank_account_id: string }>(
    `SELECT id::text, register, bank_account_id::text FROM accounting.faro_reserve_entries WHERE id = $1::uuid AND operating_company_id = $2::uuid`,
    [id, oci]
  );
  if (!r.rows[0]) throw new FaroReserveError("faro_entry_not_found");
  return r.rows[0];
}

/** Faro invoice number -> live purchase line / invoice / customer (the deterministic link captured at purchase). */
async function resolveFaroInvoices(client: DbClient, oci: string, numbers: string[]) {
  if (!numbers.length) return new Map<string, { purchase_id: string; purchase_line_id: string; invoice_id: string; customer_id: string; escrow_reserve_cents: number; purchase_status: string; purchase_je: string | null }>();
  const r = await client.query<Record<string, string>>(
    `SELECT l.faro_invoice_number, l.purchase_id::text, l.id::text AS purchase_line_id, l.invoice_id::text, l.customer_id::text,
            l.escrow_reserve_cents::text, p.status AS purchase_status, p.journal_entry_id::text AS purchase_je
       FROM accounting.factoring_purchase_lines l
       JOIN accounting.factoring_purchases p ON p.id = l.purchase_id
      WHERE l.operating_company_id = $1::uuid AND l.voided_at IS NULL AND l.faro_invoice_number = ANY($2::text[])`,
    [oci, numbers]
  );
  return new Map(r.rows.map((x) => [x.faro_invoice_number!, {
    purchase_id: x.purchase_id!, purchase_line_id: x.purchase_line_id!, invoice_id: x.invoice_id!, customer_id: x.customer_id!,
    escrow_reserve_cents: Number(x.escrow_reserve_cents), purchase_status: x.purchase_status!, purchase_je: x.purchase_je ?? null,
  }]));
}

export async function previewFaroReserveImport(client: DbClient, oci: string, bankAccountId: string, text: string) {
  const register = await registerOf(client, oci, bankAccountId);
  const parsed = parseFaroReserveReport(text, register);
  const existing = await client.query<{ k: string }>(
    `SELECT COALESCE(faro_entry_id, '--') || '|' || entry_date::text || '|' || amount_cents::text || '|' || note || '|' || occurrence::text AS k
       FROM accounting.faro_reserve_entries WHERE operating_company_id = $1::uuid AND register = $2`,
    [oci, register]
  );
  const have = new Set(existing.rows.map((x) => x.k));
  const resolved = await resolveFaroInvoices(client, oci, [...new Set(parsed.rows.map((r) => r.faro_invoice_number).filter((x): x is string => !!x))]);
  const rows = parsed.rows.map((r) => ({
    ...r,
    already_imported: have.has(`${r.faro_entry_id ?? "--"}|${r.entry_date}|${r.amount_cents}|${r.note}|${r.occurrence}`),
    invoice_id: r.faro_invoice_number ? resolved.get(r.faro_invoice_number)?.invoice_id ?? null : null,
  }));
  return {
    register,
    rows,
    rejected: parsed.rejected,
    beginning_balance_cents: parsed.beginning_balance_cents,
    ending_balance_cents: parsed.ending_balance_cents,
    new_count: rows.filter((r) => !r.already_imported).length,
    unresolved_invoice_count: rows.filter((r) => r.faro_invoice_number && !r.invoice_id).length,
  };
}

/** Owner-run import: new valid rows become entries + bank lines on the register; rejected rows are listed, never written. */
export async function commitFaroReserveImport(
  client: DbClient,
  input: { operating_company_id: string; bank_account_id: string; text: string; actor_user_id: string }
) {
  const preview = await previewFaroReserveImport(client, input.operating_company_id, input.bank_account_id, input.text);
  const batchRef = `FARO-${preview.register.toUpperCase()}-${new Date().toISOString().slice(0, 19)}`;
  let imported = 0;
  for (const r of preview.rows.filter((x) => !x.already_imported)) {
    const entry = await client.query<{ id: string }>(
      `INSERT INTO accounting.faro_reserve_entries
         (operating_company_id, register, bank_account_id, entry_kind, faro_entry_id, entry_date, amount_cents, running_balance_cents,
          faro_invoice_number, po_ref, debtor_name, pmt_ref, note, occurrence, short_pay_balance_cents, short_pay_paid_cents,
          counterparty, import_batch_ref, created_by_user_id)
       VALUES ($1::uuid, $2, $3::uuid, $4, $5, $6::date, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19::uuid)
       ON CONFLICT DO NOTHING
       RETURNING id::text`,
      [
        input.operating_company_id, preview.register, input.bank_account_id, r.entry_kind, r.faro_entry_id, r.entry_date, r.amount_cents,
        r.running_balance_cents, r.faro_invoice_number, r.po_ref, r.debtor_name, r.pmt_ref, r.note, r.occurrence,
        r.short_pay_balance_cents, r.short_pay_paid_cents, r.counterparty, batchRef, input.actor_user_id,
      ]
    );
    const entryId = entry.rows[0]?.id;
    if (!entryId) continue;
    const description = [r.note, r.faro_invoice_number ? `Inv ${r.faro_invoice_number}` : null, r.debtor_name, r.pmt_ref]
      .filter(Boolean)
      .join(" · ");
    const bank = await client.query<{ id: string }>(
      `INSERT INTO banking.bank_transactions
         (bank_account_id, operating_company_id, plaid_transaction_id, transaction_date, posted_date, amount_cents, description,
          merchant_name, plaid_category, pending, is_credit, notes, normalized_description, source, source_ref, dedup_hash,
          created_at, updated_at)
       VALUES ($1::uuid, $2::uuid, NULL, $3::date, $3::date, $4, $5, NULL, '{}'::text[], false, $6, 'source:faro_reserve_report',
               lower($5), 'csv_import', $7, $8, now(), now())
       RETURNING id::text`,
      [
        input.bank_account_id, input.operating_company_id, r.entry_date, Math.abs(r.amount_cents), description, r.amount_cents > 0,
        entryId, createHash("sha256").update(`faro_reserve_entry|${entryId}`).digest("hex"),
      ]
    );
    await client.query(`UPDATE accounting.faro_reserve_entries SET bank_transaction_id = $1::uuid WHERE id = $2::uuid`, [bank.rows[0]!.id, entryId]);
    imported += 1;
  }
  return { register: preview.register, imported, already_imported: preview.rows.length - preview.new_count, rejected: preview.rejected, batch_ref: batchRef };
}

type EntryRow = {
  id: string; register: FaroRegister; entry_kind: FaroEntryKind; faro_entry_id: string | null; amount_cents: string; entry_date: string;
  faro_invoice_number: string | null; counterparty: string | null; bank_transaction_id: string | null; journal_entry_id: string | null;
};

async function loadEntry(client: DbClient, oci: string, id: string): Promise<EntryRow> {
  const r = await client.query<EntryRow>(
    `SELECT id::text, register, entry_kind, faro_entry_id, amount_cents::text, entry_date::text, faro_invoice_number, counterparty,
            bank_transaction_id::text, journal_entry_id::text
       FROM accounting.faro_reserve_entries WHERE id = $1::uuid AND operating_company_id = $2::uuid FOR UPDATE`,
    [id, oci]
  );
  const e = r.rows[0];
  if (!e) throw new FaroReserveError("faro_entry_not_found");
  return e;
}

async function stampPosted(client: DbClient, oci: string, entry: EntryRow, jeId: string, actor: string) {
  await client.query(
    `UPDATE accounting.faro_reserve_entries SET journal_entry_id = $1::uuid, posted_at = now(), posted_by_user_id = $3::uuid
      WHERE id = $2::uuid AND journal_entry_id IS NULL`,
    [jeId, entry.id, actor]
  );
  await client.query(
    `UPDATE banking.bank_transactions SET matched_journal_entry_id = $1::uuid, review_state = 'matched', reviewed_at = now(), updated_at = now()
      WHERE id = $2::uuid AND operating_company_id = $3::uuid AND matched_journal_entry_id IS NULL`,
    [jeId, entry.bank_transaction_id, oci]
  );
}

/** Post one Faro reserve entry (and, for escrow -> cash, its pair). Refuses what this poster must not post. */
export async function postFaroReserveEntryOnClient(
  client: DbClient,
  input: { operating_company_id: string; entry_id: string; actor_user_id: string; actor_role: string }
): Promise<
  | { entry_id: string; journal_entry_id: string; paired_entry_id?: string }
  | { entry_id: string; status: "interest_accrual_awaiting_approval"; interest_run_id: string; interest_due_cents: number }
> {
  const oci = input.operating_company_id;
  const entry = await loadEntry(client, oci, input.entry_id);
  if (entry.journal_entry_id) throw new FaroReserveError("faro_entry_already_posted");
  if (!entry.bank_transaction_id) throw new FaroReserveError("faro_entry_has_no_bank_line");
  const amount = Math.abs(Number(entry.amount_cents));
  const link = entry.faro_invoice_number ? (await resolveFaroInvoices(client, oci, [entry.faro_invoice_number])).get(entry.faro_invoice_number) : undefined;
  if (INVOICE_KINDS.includes(entry.entry_kind) && !link) throw new FaroReserveError("faro_invoice_number_not_on_any_purchase_line");

  if (entry.entry_kind === "escrow_held") {
    if (link!.purchase_status !== "posted" || !link!.purchase_je) throw new FaroReserveError("faro_escrow_held_purchase_not_posted");
    if (link!.escrow_reserve_cents !== amount) throw new FaroReserveError("faro_escrow_held_differs_from_purchase_line");
    await stampPosted(client, oci, entry, link!.purchase_je, input.actor_user_id);
    return { entry_id: entry.id, journal_entry_id: link!.purchase_je };
  }
  if (entry.entry_kind === "rsv_deposit") throw new FaroReserveError("faro_rsv_deposit_posts_with_its_payment_match");
  if (entry.entry_kind === "client_payable" && entry.counterparty !== "ih35_transportation") {
    throw new FaroReserveError("faro_client_payable_to_us_posts_as_a_transfer");
  }

  const stamp = (e: EntryRow) => ({
    source_transaction_type: "faro_reserve_entry",
    source_transaction_id: e.id,
    ...(link ? { entity_type: "customer" as const, entity_uuid: link.customer_id } : {}),
  });
  const role = (r: Parameters<typeof resolveRoleAccount>[2]) => resolveRoleAccount(client as never, oci, r);
  const cash = await role("factor_cash_reserve_held");
  let pair: EntryRow | null = null;
  type Leg = { account: string; dc: "debit" | "credit"; amount: number; entry: EntryRow };
  let legs: Leg[];
  let memo: string;

  if (entry.entry_kind === "escrow_to_cash") {
    if (!entry.faro_entry_id) throw new FaroReserveError("faro_transfer_without_faro_id");
    const other = await client.query<{ id: string }>(
      `SELECT id::text FROM accounting.faro_reserve_entries
        WHERE operating_company_id = $1::uuid AND entry_kind = 'escrow_to_cash' AND faro_entry_id = $2 AND register <> $3
          AND amount_cents = -$4::bigint AND entry_date = $5::date`,
      [oci, entry.faro_entry_id, entry.register, entry.amount_cents, entry.entry_date]
    );
    if (other.rows.length !== 1) throw new FaroReserveError("faro_transfer_pair_not_imported");
    pair = await loadEntry(client, oci, other.rows[0]!.id);
    if (pair.journal_entry_id) throw new FaroReserveError("faro_entry_already_posted");
    if (!pair.bank_transaction_id) throw new FaroReserveError("faro_entry_has_no_bank_line");
    const cashSide = entry.register === "cash" ? entry : pair;
    const escrowSide = entry.register === "escrow" ? entry : pair;
    legs = [
      { account: cash, dc: "debit", amount, entry: cashSide },
      { account: await role("factor_reserve_held"), dc: "credit", amount, entry: escrowSide },
    ];
    memo = `Faro transfer escrow to cash — Inv ${entry.faro_invoice_number}`;
  } else if (entry.entry_kind === "schedule_fee") {
    // PROVEN on Faro's own Cash Reserve report (11 of 11 rows): the "Schedule Fee" is the contract's DEFAULT INTEREST —
    // 0.067%/day compounded for the days past day 35, charged against the cash reserve on the collection date. So it is
    // never an expense of its own (that would book the interest twice). Interest through the fee date must be accrued
    // first — an EVENT run, same maker <> checker path, DR 6830 / CR 2155 — then the fee relieves 2155; any difference
    // to Faro's figure is trued up to 6830.
    const pos = await interestPositionThrough(client, oci, link!.purchase_line_id, entry.entry_date);
    if (pos.due_cents > 0) {
      const run = await proposeEventInterestAccrual(client, {
        operating_company_id: oci,
        purchase_line_id: link!.purchase_line_id,
        event_date: entry.entry_date,
        actor_user_id: input.actor_user_id,
      });
      return { entry_id: entry.id, status: "interest_accrual_awaiting_approval", interest_run_id: run!.run_id, interest_due_cents: pos.due_cents };
    }
    const accruedAll = Number((await client.query<{ c: string }>(
      `SELECT COALESCE(sum(rl.accrual_cents), 0)::text AS c FROM accounting.factoring_interest_accrual_run_lines rl
         JOIN accounting.factoring_interest_accrual_runs r ON r.id = rl.run_id
        WHERE rl.purchase_line_id = $1::uuid AND r.state = 'posted'`,
      [link!.purchase_line_id]
    )).rows[0]?.c ?? 0);
    const interestExpense = await role("default_interest_expense");
    const diff = amount - accruedAll;
    legs = [
      ...(accruedAll > 0 ? [{ account: await role("factor_default_interest_payable"), dc: "debit" as const, amount: accruedAll, entry }] : []),
      ...(diff > 0 ? [{ account: interestExpense, dc: "debit" as const, amount: diff, entry }] : []),
      ...(diff < 0 ? [{ account: interestExpense, dc: "credit" as const, amount: -diff, entry }] : []),
      { account: cash, dc: "credit", amount, entry },
    ];
    memo = `Faro default interest charged to cash reserve (Faro "Schedule Fee") — Inv ${entry.faro_invoice_number}`;
  } else if (entry.entry_kind === "short_pay") {
    legs = [
      { account: await role("factoring_advance_liability"), dc: "debit", amount, entry },
      { account: cash, dc: "credit", amount, entry },
    ];
    memo = `Faro short-pay charged to reserve — Inv ${entry.faro_invoice_number}`;
  } else {
    legs = [
      { account: await role("intercompany_receivable_ih35_transportation"), dc: "debit", amount, entry },
      { account: cash, dc: "credit", amount, entry },
    ];
    memo = "Faro client payable to IH 35 TRANSPORTATION reserve — due from affiliate";
  }

  const je = await createJournalEntryOnClient(
    client as never,
    {
      operating_company_id: oci,
      entry_date: entry.entry_date,
      memo,
      source: "auto",
      postings: legs.map((l) => ({ account_id: l.account, debit_or_credit: l.dc, amount_cents: l.amount, description: memo, ...stamp(l.entry) })),
    },
    { userId: input.actor_user_id, role: input.actor_role }
  );
  // Owner ruling 2026-10-02: every leg is linked on the spine (transaction_source_links) to its Faro entry and its invoice.
  await writeFactoringSpineLinks(client, oci, je.id, `faro_${entry.entry_kind}`);
  await stampPosted(client, oci, entry, je.id, input.actor_user_id);
  if (pair) await stampPosted(client, oci, pair, je.id, input.actor_user_id);
  return { entry_id: entry.id, journal_entry_id: je.id, ...(pair ? { paired_entry_id: pair.id } : {}) };
}

/** For the payment match engine: the Rsv Deposits Faro held back on a date (they net out of that day's payment wire). */
export async function faroReserveDepositsOn(client: DbClient, oci: string, date: string) {
  const r = await client.query<{ id: string; amount_cents: string; note: string; counterparty: string | null; journal_entry_id: string | null }>(
    `SELECT id::text, amount_cents::text, note, counterparty, journal_entry_id::text FROM accounting.faro_reserve_entries
      WHERE operating_company_id = $1::uuid AND entry_kind = 'rsv_deposit' AND entry_date = $2::date ORDER BY occurrence`,
    [oci, date]
  );
  return r.rows.map((x) => ({ ...x, amount_cents: Number(x.amount_cents) }));
}

export async function listFaroReserveEntries(client: DbClient, oci: string, bankAccountId: string) {
  const r = await client.query<Record<string, unknown>>(
    `SELECT e.id::text, e.register, e.entry_kind, e.faro_entry_id, e.entry_date::text, e.amount_cents::text, e.running_balance_cents::text,
            e.faro_invoice_number, e.po_ref, e.debtor_name, e.pmt_ref, e.note, e.counterparty, e.bank_transaction_id::text,
            e.journal_entry_id::text, e.posted_at::text, l.invoice_id::text, i.display_id AS invoice_display_id, l.customer_id::text,
            c.customer_name, l.purchase_id::text, p.display_id AS purchase_display_id
       FROM accounting.faro_reserve_entries e
       LEFT JOIN accounting.factoring_purchase_lines l
              ON l.operating_company_id = e.operating_company_id AND l.faro_invoice_number = e.faro_invoice_number AND l.voided_at IS NULL
       LEFT JOIN accounting.factoring_purchases p ON p.id = l.purchase_id
       LEFT JOIN accounting.invoices i ON i.id = l.invoice_id
       LEFT JOIN mdata.customers c ON c.id = l.customer_id
      WHERE e.operating_company_id = $1::uuid AND e.bank_account_id = $2::uuid
      ORDER BY e.entry_date, e.created_at`,
    [oci, bankAccountId]
  );
  return r.rows.map((x) => ({ ...x, amount_cents: Number(x.amount_cents), running_balance_cents: x.running_balance_cents == null ? null : Number(x.running_balance_cents) }));
}
