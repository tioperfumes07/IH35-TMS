/**
 * LEAD 443.142 — Dreamline (Veon Enterprises / EFS) provider-statement import + reconcile.
 *
 * The owner's Dreamline transaction export (one row per product of each pump fill: Card #, Tran Date, Invoice, Unit,
 * Driver Name, Location, Item ULSD/ULSR/DEFD/SCLE, Unit Price, Disc PPU, Qty, Disc Amt, Amt) is the SOURCE OF TRUTH for
 * every Dreamline receipt. This engine walks it once, per product line, and for each line does exactly one of:
 *
 *   pre_cutoff        dated before USMCA started on the account (08-03 — the same cutoff as the shared Relay account):
 *                     Transportation's purchase, never posted to USMCA (counted and listed only).
 *   already_imported  the line was imported or adopted by an earlier run (fuel row hash / adoption marker) — no-op.
 *   adopted           a live receipt already on the books (Settlement Creator document paid from "Dreamline Diesel Card
 *                     Payable" (2510)) is the SAME purchase (truck + day ±1 + product + amount). It is ADOPTED, never
 *                     posted twice; when its amount differs from what the card charged, the difference posts
 *                     Dr 2510 / Cr item "Fuel Card Discount" (5000) — the 443.84 card-discount pair — sourced to that
 *                     receipt's expense (its load / unit / driver), so the receipt's fuel cost becomes the card charge.
 *                     The discount is the FILE's per-line fact (Disc PPU x Qty), not inferred from a bank line, so the
 *                     443.84 8% cap does not apply. A receipt BELOW the card charge by more than $1.00, or more than 5%
 *                     away from the pump retail, is listed (amount_mismatch) for the owner — nothing posted.
 *   cross_rail        the same purchase is on the books paid from the Relay wallet (1295): listed for the owner's
 *                     change-rail decision, nothing posted.
 *   imported          not on the books: a fuel row (rail DREAMLINE, total = card charge, gross + discount kept) goes in
 *                     through the ONE poster (postFuelFillOnReceipt: Dr fuel item / Cr 2510 + its expense document on
 *                     the load the truck was on at fill time — the one load-at-time rule — with driver / unit / trailer).
 *   scale_*           SCLE (scale ticket) is not fuel: adopted when a 2510 document of that amount exists that day,
 *                     else created through the ONE expense writer (item "OTR-Scale Expense", paid from 2510, vendor
 *                     document number EFS-<invoice>-SCLE — the writer refuses a duplicate, so re-runs are no-ops).
 *   unresolved        no truck could be named for the line: listed, nothing written.
 *
 * Fees: the per-fill "Fees" column is not part of any Dreamline invoice total (the invoices bill products only), so
 * posting it would break the 2510 invoice tie. Counted, never posted (443.142 report).
 * Caller owns the transaction (all-or-nothing). dry_run computes the same plan and the caller rolls back.
 */
import crypto from "node:crypto";
import { appendCrudAudit } from "../audit/crud-audit.js";
import { insertPostingLineWithSpine } from "../accounting/posting-line-writer.js";
import { ensureOpenPeriod } from "../accounting/posting-engine.service.js";
import { hasJournalEntryTypeColumn, resolveJournalEntryTypeId } from "../accounting/journal-entry-type-resolver.js";
import { FUEL_CARD_DISCOUNT_ITEM } from "../accounting/bank-recon/match.service.js";
import { postFuelFillOnReceipt } from "../accounting/bank-recon/bank-match-fuel-post.service.js";
import { FUEL_POSTS_ON_RECEIPT_FLAG_KEY } from "../accounting/fuel-posting/maybe-post-from-fuel-transaction.service.js";
import { EXPENSE_GL_POSTING_FLAG_KEY } from "../accounting/expense-gl-posting-flag.js";
import { isEnabled } from "../lib/feature-flags/service.js";
import { createExpenseInClientTx } from "../accounting/expense-writer.service.js";
import { postSourceTransactionInClientTx } from "../accounting/posting-engine.service.js";
import { resolveFuelLoadAtTime, resolveFillDriverAtTime } from "./fuel-load-at-time.js";

type DbClient = {
  query: <T = Record<string, unknown>>(sql: string, values?: unknown[]) => Promise<{ rows: T[]; rowCount?: number | null }>;
};

/** USMCA took over the Dreamline account on this date (owner, 443.142: same cutoff as the shared Relay account). */
export const DREAMLINE_USMCA_START_DATE = "2026-08-03";
export const DREAMLINE_CARD_TYPE_CODE = "DREAMLINE";
export const DREAMLINE_STATEMENT_EVENT = "fuel.dreamline_statement_imported";
/** A receipt below the card charge by more than this is a different purchase, never a rounding correction. */
export const RECEIPT_BELOW_CARD_TOLERANCE_CENTS = 100;
/** An adopted receipt may differ from the pump retail by rounding / a mistyped receipt; above this it is listed, not corrected. */
export const MAX_RECEIPT_RESIDUAL_PCT = 5;
const SCALE_ITEM = "OTR-Scale Expense";

export type DreamlineProduct = "diesel" | "reefer_diesel" | "def" | "scale" | "other";

export type DreamlineStatementLine = {
  line_number: number;
  card_number: string;
  transaction_at: string; // ISO instant
  local_date: string; // YYYY-MM-DD as printed
  efs_invoice: string;
  unit_label: string | null;
  driver_name: string | null;
  location_name: string | null;
  city: string | null;
  state: string | null;
  item: string;
  product: DreamlineProduct;
  quantity: number | null;
  retail_ppu: number | null;
  gross_cents: number;
  discount_cents: number;
  net_cents: number;
  fee_cents: number;
};

export type DreamlineLineOutcome =
  | "pre_cutoff"
  | "already_imported"
  | "adopted"
  | "cross_rail"
  | "amount_mismatch"
  | "imported"
  | "scale_adopted"
  | "scale_imported"
  | "held_no_load"
  | "unresolved";

export type DreamlineLineResult = {
  line_number: number;
  efs_invoice: string;
  item: string;
  local_date: string;
  net_cents: number;
  outcome: DreamlineLineOutcome;
  expense_id?: string | null;
  fuel_transaction_id?: string | null;
  difference_cents?: number;
  reason?: string;
};

export type DreamlineImportSummary = {
  lines: number;
  fills: number;
  by_outcome: Record<DreamlineLineOutcome, { lines: number; cents: number }>;
  difference_posted_cents: number;
  fees_not_posted_cents: number;
  results: DreamlineLineResult[];
};

function pick(row: Record<string, unknown>, names: string[]): unknown {
  const norm = (s: string) => s.trim().toLowerCase().replace(/[^a-z0-9#]+/g, "");
  const keys = Object.keys(row);
  for (const n of names) {
    const k = keys.find((key) => norm(key) === norm(n));
    if (k !== undefined && row[k] !== null && row[k] !== undefined && String(row[k]).trim() !== "") return row[k];
  }
  return undefined;
}

function num(v: unknown): number | null {
  if (v === null || v === undefined) return null;
  const n = Number(String(v).replace(/[$,]/g, "").trim());
  return Number.isFinite(n) ? n : null;
}

const cents = (dollars: number) => Math.round(dollars * 100);

export function dreamlineProduct(item: string): DreamlineProduct {
  const s = item.trim().toUpperCase();
  if (s === "ULSD" || s === "DSL1" || s === "CDSL" || s === "FUEL") return "diesel";
  if (s === "ULSR") return "reefer_diesel";
  if (s === "DEFD" || s.includes("DEF")) return "def";
  if (s === "SCLE") return "scale";
  return "other";
}

/** "LOVES #762 TRAVEL STOP" -> LOVES, "PILOT #..." -> PILOT, "FJ COTULLA 488" / "FJ-WAYLAND" -> FLYING. */
export function dreamlineMerchantVendorName(locationName: string | null): string | null {
  const s = (locationName ?? "").trim().toUpperCase();
  if (s.startsWith("LOVES") || s.startsWith("LOVE'S")) return "LOVES";
  if (s.startsWith("PILOT")) return "PILOT";
  if (s.startsWith("FJ") || s.startsWith("FLYING J")) return "FLYING";
  return null;
}

/** Local wall-clock date of a Date the spreadsheet reader placed in the company zone. */
function companyLocalDate(d: Date): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Chicago", year: "numeric", month: "2-digit", day: "2-digit" }).format(d);
}

/**
 * Pure: the Dreamline export's "Discounted" sheet rows (header in row 1, read with cellDates) -> statement lines.
 * Amt = what the card charged; Disc Amt = the discount; gross (pump retail) = Amt + Disc Amt.
 */
export function parseDreamlineStatementRows(rawRows: Record<string, unknown>[]): {
  lines: DreamlineStatementLine[];
  dead_letters: Array<{ line_number: number; reason: string }>;
} {
  const lines: DreamlineStatementLine[] = [];
  const dead_letters: Array<{ line_number: number; reason: string }> = [];
  rawRows.forEach((raw, idx) => {
    const line_number = idx + 2;
    const card = pick(raw, ["Card #", "card_number", "card"]);
    const when = pick(raw, ["Tran Date", "transaction_date"]);
    const invoice = pick(raw, ["Invoice", "Invoice Number"]);
    const item = pick(raw, ["Item"]);
    const amt = num(pick(raw, ["Amt", "Amount"]));
    const discAmt = num(pick(raw, ["Disc Amt"])) ?? 0;
    if (!card || !(when instanceof Date) || !invoice || !item || amt === null) {
      if (card || invoice) dead_letters.push({ line_number, reason: "missing card / tran date / invoice / item / amount" });
      return;
    }
    if (pick(raw, ["Disc PPU"]) === undefined && pick(raw, ["Disc Amt"]) === undefined) {
      dead_letters.push({ line_number, reason: "not the Discounted sheet: Disc PPU / Disc Amt columns missing" });
      return;
    }
    const net = cents(amt);
    const disc = cents(discAmt);
    lines.push({
      line_number,
      card_number: String(card).trim(),
      transaction_at: when.toISOString(),
      local_date: companyLocalDate(when),
      efs_invoice: String(invoice).trim(),
      unit_label: pick(raw, ["Unit"]) != null ? String(pick(raw, ["Unit"])).trim() : null,
      driver_name: pick(raw, ["Driver Name"]) != null ? String(pick(raw, ["Driver Name"])).trim() : null,
      location_name: pick(raw, ["Location Name"]) != null ? String(pick(raw, ["Location Name"])).trim() : null,
      city: pick(raw, ["City"]) != null ? String(pick(raw, ["City"])).trim() : null,
      state: pick(raw, ["State/Province", "State/Prov", "State"]) != null
        ? String(pick(raw, ["State/Province", "State/Prov", "State"])).trim().slice(0, 2).toUpperCase()
        : null,
      item: String(item).trim().toUpperCase(),
      product: dreamlineProduct(String(item)),
      quantity: num(pick(raw, ["Qty"])),
      retail_ppu: num(pick(raw, ["Unit Price"])),
      gross_cents: net + disc,
      discount_cents: disc,
      net_cents: net,
      fee_cents: cents(num(pick(raw, ["Fees"])) ?? 0),
    });
  });
  return { lines, dead_letters };
}

/** Stable identity of one statement product line: provider + card + EFS invoice + product (+ position on the receipt). */
export function dreamlineLineHash(line: Pick<DreamlineStatementLine, "card_number" | "efs_invoice" | "item" | "transaction_at">, seq: number): string {
  return crypto
    .createHash("sha256")
    .update(`dreamline:${line.card_number}:${line.efs_invoice}:${line.transaction_at}:${line.item}:${seq}`)
    .digest("hex");
}

export function dreamlineAdoptMarker(line: Pick<DreamlineStatementLine, "efs_invoice" | "item">, seq: number): string {
  return `dreamline_efs=${line.efs_invoice}:${line.item}:${seq}`;
}

type BookedReceipt = {
  expense_id: string;
  expense_number: string | null;
  d: string;
  unit_norm: string;
  kind: "diesel" | "reefer_diesel" | "def" | "scale" | "other";
  cents: number;
  rail: "2510" | "1295";
  fuel_transaction_id: string | null;
  notes: string | null;
};

const unitNorm = (u: string | null | undefined) => String(u ?? "").trim().toUpperCase().replace(/^T/, "");
const dayDiff = (a: string, b: string) => Math.abs(Date.parse(`${a}T00:00:00Z`) - Date.parse(`${b}T00:00:00Z`)) / 86_400_000;

async function loadBookedReceipts(client: DbClient, companyId: string, from: string, to: string): Promise<BookedReceipt[]> {
  const res = await client.query<{
    expense_id: string; expense_number: string | null; d: string; unit_number: string | null; fuel_type: string | null;
    accts: string[] | null; cents: string; rail: "2510" | "1295"; fuel_transaction_id: string | null; notes: string | null;
  }>(
    `SELECT e.id::text AS expense_id, e.expense_number, e.transaction_date::text AS d, u.unit_number,
            ft.fuel_type::text AS fuel_type,
            (SELECT array_agg(DISTINCT la.account_number) FROM accounting.expense_lines l
               JOIN catalogs.accounts la ON la.id = l.expense_account_uuid WHERE l.expense_id = e.id) AS accts,
            e.total_amount_cents::text AS cents, pa.account_number AS rail,
            e.source_fuel_transaction_id::text AS fuel_transaction_id, ft.notes
       FROM accounting.expenses e
       JOIN catalogs.accounts pa ON pa.id = e.payment_account_uuid AND pa.account_number IN ('2510', '1295')
       LEFT JOIN mdata.units u ON u.id = e.unit_id
       LEFT JOIN fuel.fuel_transactions ft ON ft.id = e.source_fuel_transaction_id
      WHERE e.operating_company_id = $1::uuid AND e.voided_at IS NULL AND e.deleted_at IS NULL
        AND e.posting_status = 'posted'
        -- a document this statement import created is never a candidate to adopt another statement line
        AND coalesce(ft.notes, '') NOT LIKE '%443.142 Dreamline statement%'
        AND coalesce(e.vendor_document_number, '') NOT LIKE 'EFS-%'
        AND e.transaction_date BETWEEN ($2::date - 1) AND ($3::date + 1)
      ORDER BY e.transaction_date, e.expense_number, e.id`,
    [companyId, from, to]
  );
  return res.rows.map((r) => {
    const accts = r.accts ?? [];
    const ft = (r.fuel_type ?? "").toLowerCase();
    const kind: BookedReceipt["kind"] =
      ft === "def" || accts.includes("5010") ? "def"
      : ft === "reefer_diesel" ? "reefer_diesel"
      : ft === "diesel" || accts.includes("5000") ? "diesel"
      : "other";
    return {
      expense_id: r.expense_id, expense_number: r.expense_number, d: r.d, unit_norm: unitNorm(r.unit_number), kind,
      cents: Number(r.cents), rail: r.rail, fuel_transaction_id: r.fuel_transaction_id, notes: r.notes,
    };
  });
}

/**
 * Pure matcher: statement fuel line -> the booked receipt that is the same purchase. Deterministic (file order, then
 * nearest day, then nearest amount). Truck first (the unit typed at the pump); then, for a card whose unit label is
 * stale, the day + product + amount alone when that is exact or the ONLY candidate within 3%.
 */
export function matchBookedReceipt(
  line: Pick<DreamlineStatementLine, "local_date" | "unit_label" | "product" | "gross_cents" | "net_cents">,
  booked: BookedReceipt[],
  used: Set<string>
): BookedReceipt | null {
  const near = (b: BookedReceipt) => !used.has(b.expense_id) && b.kind === line.product && dayDiff(b.d, line.local_date) <= 1;
  const exact = (b: BookedReceipt) => Math.abs(b.cents - line.gross_cents) <= 1 || Math.abs(b.cents - line.net_cents) <= 1;
  const rank = (a: BookedReceipt, b: BookedReceipt) =>
    dayDiff(a.d, line.local_date) - dayDiff(b.d, line.local_date) || Math.abs(a.cents - line.gross_cents) - Math.abs(b.cents - line.gross_cents);
  const unit = unitNorm(line.unit_label);
  const sameTruck = booked.filter((b) => near(b) && b.unit_norm === unit);
  const p1 = sameTruck.filter(exact).sort(rank);
  if (p1[0]) return p1[0];
  const p2 = sameTruck.filter((b) => Math.abs(b.cents - line.gross_cents) <= Math.max(500, 0.15 * line.gross_cents)).sort(rank);
  if (p2[0]) return p2[0];
  const anyTruck = booked.filter(near);
  const p3 = anyTruck.filter(exact).sort(rank);
  if (p3[0]) return p3[0];
  const p4 = anyTruck.filter((b) => Math.abs(b.cents - line.gross_cents) <= Math.max(100, 0.03 * line.gross_cents));
  return p4.length === 1 ? p4[0]! : null;
}

async function companyAccountId(client: DbClient, companyId: string, number: string): Promise<string> {
  const r = await client.query<{ id: string }>(
    `SELECT id::text FROM catalogs.accounts WHERE operating_company_id = $1::uuid AND account_number = $2 AND deactivated_at IS NULL LIMIT 1`,
    [companyId, number]
  );
  if (!r.rows[0]) throw new Error(`dreamline_import_account_missing:${number}`);
  return r.rows[0].id;
}

async function itemAccount(client: DbClient, companyId: string, itemName: string): Promise<{ item_id: string; account_id: string }> {
  const r = await client.query<{ id: string; account_id: string | null }>(
    `SELECT i.id::text, i.default_expense_account_id::text AS account_id FROM catalogs.items i
      WHERE i.item_name = $2 AND i.deactivated_at IS NULL AND (i.operating_company_id = $1::uuid OR i.operating_company_id IS NULL)
      ORDER BY (i.operating_company_id = $1::uuid) DESC NULLS LAST LIMIT 1`,
    [companyId, itemName]
  );
  if (!r.rows[0]?.account_id) throw new Error(`dreamline_import_item_missing:${itemName}`);
  return { item_id: r.rows[0].id, account_id: r.rows[0].account_id };
}

/**
 * The card-discount pair for one adopted receipt (443.84 shape, sourced to the receipt's expense): positive = the card
 * charged LESS than the receipt (Dr 2510 / Cr Fuel Card Discount); negative = more (Dr Fuel Card Discount / Cr 2510).
 * Idempotent per statement line (posting idempotency keys).
 */
async function postStatementDifference(
  client: DbClient,
  input: { companyId: string; actor: string; expenseId: string; differenceCents: number; date: string; marker: string; payableId: string; discountAccountId: string }
): Promise<string | null> {
  const prior = await client.query<{ je: string }>(
    `SELECT journal_entry_uuid::text AS je FROM accounting.journal_entry_postings
      WHERE operating_company_id = $1::uuid AND idempotency_key = ANY($2::text[]) LIMIT 1`,
    [input.companyId, [`dreamline-statement:${input.companyId}:${input.marker}:debit`, `dreamline-statement:${input.companyId}:${input.marker}:credit`]]
  );
  if (prior.rows[0]) return null;
  await ensureOpenPeriod(client as never, input.companyId, input.date);
  const memo = `Dreamline statement ${input.marker} — ${FUEL_CARD_DISCOUNT_ITEM}`;
  const typeId = (await hasJournalEntryTypeColumn(client as never))
    ? await resolveJournalEntryTypeId(client as never, { source: "auto", memo })
    : null;
  const je = await client.query<{ id: string }>(
    `INSERT INTO accounting.journal_entries (operating_company_id, entry_date, memo, source, ${typeId ? "journal_entry_type_id," : ""}
        created_by_user_id, created_at, updated_at, is_sample_data)
     VALUES ($1::uuid, $2::date, $3, 'auto', ${typeId ? "$5::uuid," : ""} $4::uuid, now(), now(), false)
     RETURNING id::text`,
    typeId ? [input.companyId, input.date, memo, input.actor, typeId] : [input.companyId, input.date, memo, input.actor]
  );
  const jeId = je.rows[0]!.id;
  const classId = (await client.query<{ class_id: string | null }>(
    `SELECT p.class_id::text AS class_id FROM accounting.expenses e
       JOIN accounting.journal_entry_postings p ON p.journal_entry_uuid = e.journal_entry_id AND p.debit_or_credit = 'debit'
      WHERE e.id = $1::uuid AND p.class_id IS NOT NULL LIMIT 1`,
    [input.expenseId]
  )).rows[0]?.class_id ?? null;
  const magnitude = Math.abs(input.differenceCents);
  const payableSide = input.differenceCents > 0 ? "debit" : "credit";
  const costSide = input.differenceCents > 0 ? "credit" : "debit";
  let seq = 0;
  for (const [account_id, side, role] of [
    [input.payableId, payableSide, "card payable"],
    [input.discountAccountId, costSide, "fuel cost"],
  ] as const) {
    seq += 1;
    await insertPostingLineWithSpine(client as never, {
      operating_company_id: input.companyId, journal_entry_uuid: jeId, line_sequence: seq, account_id,
      debit_or_credit: side, amount_cents: magnitude,
      description: `${FUEL_CARD_DISCOUNT_ITEM} — ${input.marker} (${role})`,
      idempotency_key: `dreamline-statement:${input.companyId}:${input.marker}:${side}`,
      source_transaction_type: "expense", source_transaction_id: input.expenseId, class_id: classId,
      relationship_role: "fuel_card_discount",
    });
  }
  return jeId;
}

/**
 * 443.142-FIX — a statement scale-ticket expense the earlier create path left with 0 lines / unposted gets the line the
 * expense writer writes (item OTR-Scale Expense, its account, qty 1, the header's load / driver / unit / trailer) and is
 * posted through the expense posting engine (Dr OTR-Scale / Cr 2510), stamped like the writer does. No-op when posted.
 */
export async function postStatementScaleExpense(
  client: DbClient,
  companyId: string,
  expenseId: string,
  scaleItem: { item_id: string; account_id: string },
  actor: string
): Promise<"posted" | "already_posted"> {
  const e = (await client.query<{ cents: string; memo: string | null; load_id: string | null; driver: string | null; unit_id: string | null; trailer_id: string | null; posting_status: string; lines: string }>(
    `SELECT total_amount_cents::text AS cents, memo, load_id::text, driver_uuid::text AS driver, unit_id::text, trailer_id::text, posting_status,
            (SELECT count(*) FROM accounting.expense_lines l WHERE l.expense_id = e.id)::text AS lines
       FROM accounting.expenses e WHERE e.id = $1::uuid AND e.operating_company_id = $2::uuid AND e.voided_at IS NULL`,
    [expenseId, companyId]
  )).rows[0];
  if (!e) throw new Error(`dreamline_scale_expense_missing:${expenseId}`);
  if (e.posting_status === "posted") return "already_posted";
  const cents = Number(e.cents);
  if (Number(e.lines) === 0) {
    await client.query(
      `INSERT INTO accounting.expense_lines (expense_id, line_sequence, amount_cents, amount, description, expense_account_uuid, operating_company_id,
         load_id, load_exemption_reason, item_id, quantity, rate_cents, unit_of_measure, driver_id, unit_id, trailer_id)
       VALUES ($1::uuid, 1, $2::bigint, $12::numeric, $3, $4::uuid, $5::uuid, $6::uuid, $7, $8::uuid, 1, $2::bigint, 'each', $9::uuid, $10::uuid, $11::uuid)`,
      [expenseId, cents, e.memo ?? "Dreamline scale ticket", scaleItem.account_id, companyId, e.load_id,
        e.load_id ? null : "Dreamline scale ticket with no load covering the truck at the fill time (443.142)",
        scaleItem.item_id, e.driver, e.unit_id, e.trailer_id, cents / 100]
    );
  }
  const posting = await postSourceTransactionInClientTx(
    client as never,
    { operating_company_id: companyId, source_transaction_type: "expense", source_transaction_id: expenseId },
    { userId: actor }
  );
  await client.query(
    `UPDATE accounting.expenses SET status = 'posted', posting_status = 'posted', posted_at = now(), journal_entry_id = $2::uuid, updated_at = now()
      WHERE id = $1::uuid AND operating_company_id = $3::uuid`,
    [expenseId, posting.journal_entry_id, companyId]
  );
  await appendCrudAudit(client as never, actor, "expense.posted", { expense_id: expenseId, journal_entry_id: posting.journal_entry_id, source: "dreamline_statement_scale_repair" }, "info", "LEAD-443.142-FIX");
  return "posted";
}

function emptyOutcomes(): DreamlineImportSummary["by_outcome"] {
  const o = {} as DreamlineImportSummary["by_outcome"];
  for (const k of ["pre_cutoff", "already_imported", "adopted", "cross_rail", "amount_mismatch", "imported", "scale_adopted", "scale_imported", "held_no_load", "unresolved"] as DreamlineLineOutcome[]) {
    o[k] = { lines: 0, cents: 0 };
  }
  return o;
}

export async function importDreamlineStatement(
  client: DbClient,
  input: { operating_company_id: string; actor_user_uuid: string; lines: DreamlineStatementLine[]; start_date?: string; dry_run?: boolean }
): Promise<DreamlineImportSummary> {
  const companyId = input.operating_company_id;
  const start = input.start_date ?? DREAMLINE_USMCA_START_DATE;
  const dry = input.dry_run === true;
  const ctx = { operating_company_id: companyId, user_uuid: input.actor_user_uuid };
  if (!dry) {
    if (!(await isEnabled(client as never, FUEL_POSTS_ON_RECEIPT_FLAG_KEY, ctx)) || !(await isEnabled(client as never, EXPENSE_GL_POSTING_FLAG_KEY, ctx))) {
      throw new Error("dreamline_import_requires_posting_on_receipt: FUEL_POSTS_ON_RECEIPT_ENABLED and EXPENSE_GL_POSTING_ENABLED must be ON");
    }
  }
  const cardType = (await client.query<{ id: string }>(
    `SELECT id::text FROM catalogs.fuel_card_types WHERE operating_company_id = $1::uuid AND code = $2 AND is_active LIMIT 1`,
    [companyId, DREAMLINE_CARD_TYPE_CODE]
  )).rows[0];
  if (!cardType) throw new Error("dreamline_card_type_missing");
  const payableId = await companyAccountId(client, companyId, "2510");
  const discount = await itemAccount(client, companyId, FUEL_CARD_DISCOUNT_ITEM);
  const scaleItem = await itemAccount(client, companyId, SCALE_ITEM);

  const lines = [...input.lines].sort((a, b) => a.transaction_at.localeCompare(b.transaction_at) || a.line_number - b.line_number);
  const usmca = lines.filter((l) => l.local_date >= start);
  const dates = usmca.map((l) => l.local_date).sort();
  const booked = dates.length ? await loadBookedReceipts(client, companyId, dates[0]!, dates[dates.length - 1]!) : [];
  const used = new Set<string>();
  const summary: DreamlineImportSummary = {
    lines: lines.length,
    fills: new Set(lines.map((l) => `${l.card_number}|${l.efs_invoice}|${l.transaction_at}`)).size,
    by_outcome: emptyOutcomes(),
    difference_posted_cents: 0,
    fees_not_posted_cents: 0,
    results: [],
  };
  const feeSeen = new Set<string>();
  const seqOf = new Map<string, number>();
  const record = (line: DreamlineStatementLine, outcome: DreamlineLineOutcome, extra: Partial<DreamlineLineResult> = {}) => {
    summary.by_outcome[outcome].lines += 1;
    summary.by_outcome[outcome].cents += line.net_cents;
    summary.results.push({ line_number: line.line_number, efs_invoice: line.efs_invoice, item: line.item, local_date: line.local_date, net_cents: line.net_cents, outcome, ...extra });
  };

  // Earlier runs: imported rows (hash) and adopted receipts (marker) are already reconciled.
  const priorHashes = new Set((await client.query<{ h: string }>(
    `SELECT source_row_hash AS h FROM fuel.fuel_transactions WHERE operating_company_id = $1::uuid AND source_row_hash IS NOT NULL AND voided_at IS NULL`,
    [companyId]
  )).rows.map((r) => r.h));
  const adoptedMarkers = new Map<string, string>();
  for (const b of booked) {
    for (const m of (b.notes ?? "").match(/dreamline_efs=[^;\s]+/g) ?? []) adoptedMarkers.set(m, b.expense_id);
  }
  for (const b of booked) if ((b.notes ?? "").includes("dreamline_efs=")) used.add(b.expense_id);

  for (const line of lines) {
    const fillKey = `${line.card_number}|${line.efs_invoice}|${line.transaction_at}`;
    const seqKey = `${fillKey}|${line.item}`;
    const seq = (seqOf.get(seqKey) ?? 0) + 1;
    seqOf.set(seqKey, seq);
    if (line.local_date < start) { record(line, "pre_cutoff"); continue; }
    if (!feeSeen.has(fillKey)) { feeSeen.add(fillKey); summary.fees_not_posted_cents += line.fee_cents; }
    const hash = dreamlineLineHash(line, seq);
    const marker = dreamlineAdoptMarker(line, seq);
    if (priorHashes.has(hash) || adoptedMarkers.has(marker)) {
      if (adoptedMarkers.has(marker)) used.add(adoptedMarkers.get(marker)!);
      record(line, "already_imported");
      continue;
    }

    if (line.product === "scale") {
      const hit = booked.find((b) => !used.has(b.expense_id) && b.rail === "2510" && b.kind === "other"
        && Math.abs(b.cents - line.gross_cents) <= 1 && dayDiff(b.d, line.local_date) <= 1);
      if (hit) { used.add(hit.expense_id); record(line, "scale_adopted", { expense_id: hit.expense_id }); continue; }
      if (line.gross_cents <= 0) { record(line, "scale_adopted", { reason: "zero_amount_scale_line" }); continue; }
    }

    if (line.product !== "scale") {
      const hit = matchBookedReceipt(line, booked, used);
      if (hit) {
        used.add(hit.expense_id);
        if (hit.rail === "1295") { record(line, "cross_rail", { expense_id: hit.expense_id, reason: "same purchase is booked on the Relay wallet (1295)" }); continue; }
        const diff = hit.cents - line.net_cents;
        const residual = hit.cents - line.gross_cents;
        if (diff < -RECEIPT_BELOW_CARD_TOLERANCE_CENTS || Math.abs(residual) > Math.max(RECEIPT_BELOW_CARD_TOLERANCE_CENTS, MAX_RECEIPT_RESIDUAL_PCT * line.gross_cents / 100)) {
          record(line, "amount_mismatch", {
            expense_id: hit.expense_id, difference_cents: diff,
            reason: diff < -RECEIPT_BELOW_CARD_TOLERANCE_CENTS
              ? "card charged more than the receipt — not a discount, listed for the owner"
              : `receipt differs from the pump retail by ${residual} cents (> ${MAX_RECEIPT_RESIDUAL_PCT}%) — listed for the owner, nothing posted`,
          });
          continue;
        }
        if (!dry) {
          if (diff !== 0) {
            const je = await postStatementDifference(client, {
              companyId, actor: input.actor_user_uuid, expenseId: hit.expense_id, differenceCents: diff, date: hit.d, marker,
              payableId, discountAccountId: discount.account_id,
            });
            if (!je) { record(line, "already_imported", { expense_id: hit.expense_id }); continue; }
            summary.difference_posted_cents += diff;
          }
          if (hit.fuel_transaction_id) {
            await client.query(
              `UPDATE fuel.fuel_transactions
                  SET notes = concat_ws('; ', NULLIF(notes, ''), $3::text),
                      gross_cost = $4::numeric / 100, discount_amount = $5::numeric / 100, updated_at = now()
                WHERE id = $1::uuid AND operating_company_id = $2::uuid`,
              [hit.fuel_transaction_id, companyId, marker, line.gross_cents, line.discount_cents]
            );
          }
        } else if (diff !== 0) summary.difference_posted_cents += diff;
        record(line, "adopted", { expense_id: hit.expense_id, fuel_transaction_id: hit.fuel_transaction_id, difference_cents: diff });
        continue;
      }
    }

    // Not on the books -> import through the one poster / the one expense writer.
    const unit = (await client.query<{ id: string }>(
      `SELECT id::text FROM mdata.units
        WHERE COALESCE(currently_leased_to_company_id, owner_company_id) = $1::uuid
          AND upper(regexp_replace(unit_number, '^[Tt]', '')) = $2 AND deactivated_at IS NULL
        ORDER BY (upper(unit_number) LIKE 'T%') DESC LIMIT 1`,
      [companyId, unitNorm(line.unit_label)]
    )).rows[0];
    if (!unit) { record(line, "unresolved", { reason: `no USMCA truck numbered ${line.unit_label ?? "(blank)"}` }); continue; }
    const vendorName = dreamlineMerchantVendorName(line.location_name);
    const vendor = vendorName
      ? (await client.query<{ id: string }>(
          `SELECT id::text FROM mdata.vendors WHERE operating_company_id = $1::uuid AND vendor_name = $2 AND deactivated_at IS NULL LIMIT 1`,
          [companyId, vendorName]
        )).rows[0]
      : undefined;
    if (!vendor) { record(line, "unresolved", { reason: `no vendor for merchant ${line.location_name ?? "(blank)"}` }); continue; }
    const namedDriver = line.driver_name
      ? (await client.query<{ id: string }>(
          `SELECT DISTINCT d.id::text FROM mdata.drivers d
             LEFT JOIN mdata.driver_samsara_accounts a ON a.driver_id = d.id AND a.is_active
            WHERE d.operating_company_id = $1::uuid AND d.deactivated_at IS NULL
              AND (lower(concat_ws(' ', d.first_name, d.last_name)) = lower($2) OR lower(trim(a.samsara_username)) = lower($2))
            LIMIT 2`,
          [companyId, line.driver_name]
        )).rows
      : [];
    // The one fuel-to-load rule: the load the UNIT was running at the fill time, the DRIVER as fallback (the card's named
    // driver, else the driver the rule places on that truck at that moment — card / truck assignment).
    const namedDriverId = namedDriver.length === 1 ? namedDriver[0]!.id : null;
    const driverAtFill = namedDriverId
      ? namedDriverId
      : (await resolveFillDriverAtTime(client as never, { operatingCompanyId: companyId, matchedDriverId: null, unitId: unit.id, at: line.transaction_at }))?.driver_id ?? null;
    const loadHit = await resolveFuelLoadAtTime(client as never, { operatingCompanyId: companyId, unitId: unit.id, driverId: driverAtFill, at: line.transaction_at });
    // LEAD 443.166 — TRANSACTION LINKAGE LAW TIER 1: a fill (or scale ticket) of a working truck carries its load, no
    // exceptions — "if the load is unknown, FIND IT, never write NULL". The one fuel-to-load rule (unit at fill time,
    // driver fallback) found none, so nothing is written: the line is HELD and listed, and the next run of this
    // statement imports it once the owner enters the load that covers it (the import is idempotent per line).
    if (!loadHit) {
      record(line, "held_no_load", {
        reason: `no load covers truck ${line.unit_label ?? "?"} (or its driver) at ${line.transaction_at} — held until the load is entered`,
      });
      continue;
    }
    const driver = await resolveFillDriverAtTime(client as never, {
      operatingCompanyId: companyId, matchedDriverId: namedDriver.length === 1 ? namedDriver[0]!.id : null, unitId: unit.id,
      at: line.transaction_at, loadId: loadHit.load_id,
    });

    if (line.product === "scale") {
      if (dry) { record(line, "scale_imported", { reason: "dry_run" }); continue; }
      const created = await createExpenseInClientTx(client, {
        operating_company_id: companyId,
        expense_date: line.local_date,
        amount_cents: line.gross_cents,
        vendor_uuid: vendor.id,
        payment_account_uuid: payableId,
        // 443.142-FIX — the writer writes the expense LINE and posts only when the category account is named; with the
        // item alone it wrote a header with 0 lines, unposted (13525-5 / 13541-1 / 13545-5).
        category_account_id: scaleItem.account_id,
        item_id: scaleItem.item_id,
        quantity: 1,
        rate_cents: line.gross_cents,
        unit_id: unit.id,
        ...(driver ? { driver_id: driver.driver_id } : {}),
        load_id: loadHit.load_id,
        vendor_document_number: `EFS-${line.efs_invoice}-SCLE${seq > 1 ? `-${seq}` : ""}`,
        memo: `Dreamline scale ticket — EFS invoice ${line.efs_invoice}, ${line.location_name ?? ""} ${line.city ?? ""} ${line.state ?? ""}`.trim(),
        is_company_expense: true,
      } as never, input.actor_user_uuid);
      const dup = created as { duplicateVendorDocumentNumber?: boolean; duplicateSubmission?: boolean; existingExpenseId?: string };
      if (dup.duplicateVendorDocumentNumber || dup.duplicateSubmission) {
        if (dup.existingExpenseId) await postStatementScaleExpense(client, companyId, dup.existingExpenseId, scaleItem, input.actor_user_uuid);
        record(line, "already_imported", { expense_id: dup.existingExpenseId ?? null });
        continue;
      }
      const createdId = (created as { expense_id?: string }).expense_id;
      if (!createdId) throw new Error(`dreamline_scale_expense_refused:${line.efs_invoice}:${JSON.stringify(created)}`);
      if (!(created as { posted_journal_entry_id?: string | null }).posted_journal_entry_id) {
        throw new Error(`dreamline_scale_expense_not_posted:${line.efs_invoice} — the expense writer created ${createdId} without posting it`);
      }
      record(line, "scale_imported", { expense_id: createdId });
      continue;
    }
    if (line.product === "other") { record(line, "unresolved", { reason: `unknown Dreamline item ${line.item}` }); continue; }
    if (dry) { record(line, "imported", { reason: "dry_run" }); continue; }

    const notes = [`card=…${line.card_number.replace(/\D+/g, "").slice(-4)}`, `efs_invoice=${line.efs_invoice}`, `file_unit=${line.unit_label ?? ""}`,
      line.driver_name ? `file_driver=${line.driver_name}` : null, "443.142 Dreamline statement"].filter(Boolean).join("; ");
    const ins = await client.query<{ id: string }>(
      `INSERT INTO fuel.fuel_transactions (
         operating_company_id, transaction_at, purchased_at, load_id, driver_id, unit_id, vendor_id, fuel_card_id, fuel_type,
         gallons, price_per_gallon, total_cost, gross_cost, discount_amount, location_city, location_state,
         transaction_reference, source, source_row_hash, notes, imported_at, load_required, load_exemption_reason,
         created_by_user_id, trailer_id)
       VALUES ($1::uuid, $2::timestamptz, $2::timestamptz, $3::uuid, $4::uuid, $5::uuid, $6::uuid, $7::uuid, $8,
         $9, $10, $11::numeric / 100, $12::numeric / 100, $13::numeric / 100, $14, $15,
         $16, 'import', $17, $18, now(), $19, $20, $21::uuid, $22::uuid)
       ON CONFLICT (operating_company_id, source_row_hash) DO NOTHING
       RETURNING id::text`,
      [
        companyId, line.transaction_at, loadHit.load_id, driver?.driver_id ?? null, unit.id, vendor.id, cardType.id, line.product,
        line.quantity, line.quantity ? Math.round((line.net_cents / 100 / line.quantity) * 10000) / 10000 : null,
        line.net_cents, line.gross_cents, line.discount_cents, line.city, line.state,
        line.efs_invoice, hash, notes, true, null, input.actor_user_uuid, loadHit.trailer_id ?? null,
      ]
    );
    const fuelId = ins.rows[0]?.id;
    if (!fuelId) { record(line, "already_imported"); continue; }
    await postFuelFillOnReceipt(client as never, { operating_company_id: companyId, actor_user_uuid: input.actor_user_uuid, kind: "fuel_transaction", fill_id: fuelId });
    const doc = (await client.query<{ id: string }>(
      `SELECT id::text FROM accounting.expenses WHERE source_fuel_transaction_id = $1::uuid AND operating_company_id = $2::uuid AND voided_at IS NULL LIMIT 1`,
      [fuelId, companyId]
    )).rows[0];
    record(line, "imported", { fuel_transaction_id: fuelId, expense_id: doc?.id ?? null });
  }

  if (!dry) {
    const { results: _r, ...counts } = summary;
    await appendCrudAudit(client as never, input.actor_user_uuid, DREAMLINE_STATEMENT_EVENT, {
      resource_type: "fuel.fuel_transactions", resource_id: companyId, operating_company_id: companyId, ...counts,
    }, "info", "LEAD-443.142");
  }
  return summary;
}
