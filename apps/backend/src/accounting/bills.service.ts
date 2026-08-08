import crypto from "node:crypto";
import { appendCrudAudit } from "../audit/crud-audit.js";
import { reassignDraftAttachments } from "../documents/attachments.service.js";
import { withCurrentUser, withLuciaBypass } from "../auth/db.js";
import { enqueueSyncJob } from "../integrations/qbo/qbo-sync.service.js";
import { enqueueTmsBillPushRequested } from "../qbo/tms-bill-push-chain.service.js";
import { companyBusinessDate } from "../lib/company-business-date.js";
import { postBillGlIfEnabled } from "./bill-gl.service.js";
import {
  postSourceTransactionInClientTx,
  reversePostedSourceTransactionInClientTx,
} from "./posting-engine.service.js";
import { isBillPaymentGlPostingEnabled } from "./bill-payment-gl.service.js";
import { vendorIdentitySetSql } from "./vendor-identity.js";
import {
  auditVoid,
  canVoid,
  isVoidEnforcementEnabled,
  postVoidReversal,
  type VoidReversalResult,
} from "./void.service.js";

type BillStatus = "open" | "partial" | "paid" | "voided";
// 'other' is a DB-valid method (accounting.bill_payments.payment_method CHECK) used for non-cash
// bill payments (e.g. the settlement deduction closure — from_bank_account_id NULL, no cash moves).
type PaymentMethod = "check" | "ach" | "wire" | "cash" | "credit_card" | "other";

/** One expense/item line to persist on accounting.bill_lines with the bill header. */
export type CreateBillLineInput = {
  /** catalogs.accounts.id — explicit DR account (preferred). Entity-scoped; validated when set. */
  accountId?: string | null;
  amountCents: number;
  description?: string | null;
  section?: "A" | "B";
  expenseCategoryUuid?: string | null;
  serviceItemUuid?: string | null;
  categoryKind?: string | null;
  categoryCode?: string | null;
  loadId?: string | null;
};

type CreateBillInput = {
  operatingCompanyId: string;
  vendorId: string;
  billNumber?: string;
  billDate: string;
  dueDate?: string;
  amountCents: number;
  memo?: string;
  coaAccountId?: string;
  // HARD cross-module link (maintenance): real FK from the bill to its work order + unit. Persists into
  // the CANONICAL accounting.bills.linked_work_order_uuid column (the same one the WO-close posting path
  // writes) + the new unit_id. Nullable — a bill created outside maintenance has neither. The FK
  // constraints are added by migration 202607050810.
  workOrderId?: string | null;
  unitId?: string | null;
  // Claim→Bill hop (held migration 202607740000). Only persisted when the column exists on the
  // connected DB (colExists) — Neon may not have owner-applied the held DDL yet.
  insuranceClaimId?: string | null;
  /** QBO Class reporting dimension — persisted on accounting.bills.class_id when column present. */
  classId?: string | null;
  // Draft id used by UploadZone for create-time bill attachments; reconciled onto the real bill id in
  // the same txn (Option B inc 2 — docs/specs/ATTACHMENT-DRAFT-LINKAGE-FIX.md).
  attachmentDraftId?: string | null;
  /**
   * Vendor Bill create (LAW §9): when provided, must be non-empty and is INSERTed into
   * accounting.bill_lines in the SAME transaction as the bill header. Omitted = legacy
   * programmatic callers (settlement/insurance) that still add lines on their own path.
   * Never invent GL accounts — accountId must be caller-supplied or left null for poster tiers.
   */
  lines?: CreateBillLineInput[];
};

type PayBillInput = {
  operatingCompanyId: string;
  billId: string;
  paymentDate: string;
  amountCents: number;
  paymentMethod: PaymentMethod;
  fromBankAccountId?: string;
  checkNumber?: string;
  referenceNumber?: string;
  memo?: string;
};

type ListVendorBalancesOptions = {
  includeZero: boolean;
  sort: "balance_desc" | "balance_asc" | "vendor_asc";
};

type ListBillsOptions = {
  status?: BillStatus;
  fromDate?: string;
  toDate?: string;
  hasBalance?: boolean;
  limit: number;
  offset: number;
};

type ListBillPaymentsOptions = {
  vendorId?: string;
  dateFrom?: string;
  dateTo?: string;
  limit: number;
  offset: number;
};

type BillRow = {
  id: string;
  operating_company_id: string;
  /**
   * ACCT-F84 — legacy TEXT holding the QBO vendor id ("2", "256", "2244"). NOT a uuid and NOT a key
   * into mdata.vendors: of 500 sampled prod rows exactly ONE resolved as a vendor uuid. Kept for the
   * vendor FILTER and as a display fallback; never feed it to a /vendors/:id route.
   */
  vendor_id: string | null;
  /** Legacy TEXT duplicate of the above. Non-canonical — do not introduce new readers. */
  vendor_uuid: string | null;
  /**
   * ACCT-F84 — THE canonical vendor FK (uuid). Already returned by `SELECT b.*`; it was simply never
   * declared here, so every frontend consumer fell back to the legacy text id and built a link that
   * 404s. Verified on prod 2026-08-02: populated on 16,244 of 16,246 bills, and it disagrees with the
   * qbo_vendor_id resolution on ZERO rows.
   */
  mdata_vendor_id: string | null;
  bill_number: string | null;
  bill_date: string;
  due_date: string | null;
  amount_cents: number | null;
  total_amount: number | null;
  paid_cents: number | null;
  paid_amount: number | null;
  status: string;
  memo: string | null;
  coa_account_id: string | null;
  qbo_bill_id: string | null;
  source_system: string | null;
  created_at: string;
  updated_at: string;
  revoked_at: string | null;
  // BANKREC-LISTSTATUS-01 (read-only, additive): true iff any of the bill's non-revoked
  // bill_payments rows has an ACTIVE (auto_matched|user_matched, i.e. not rejected)
  // banking.reconciliation_matches row (ledger_entry_kind='bill_payment'). A Bill itself is never
  // matched directly — 'bill' is not a valid ledger_entry_kind (see 202607011600 migration
  // comment); reconciliation happens at the bill_payment level, so this rolls that up to the bill.
  is_reconciled: boolean;
};

type BillPaymentRow = {
  id: string;
  operating_company_id: string;
  bill_id: string;
  /** ACCT-F84 — legacy TEXT QBO vendor id. 0 of 6,543 prod rows resolve as a uuid. Display only. */
  vendor_id: string | null;
  /**
   * ACCT-F84 — resolved vendor uuid. Unlike accounting.bills, accounting.bill_payments has NO
   * canonical vendor column at all, so it is resolved through the vendor master by qbo_vendor_id
   * (entity-scoped). Verified on prod 2026-08-02: 6,538 of 6,543 resolve; the remaining 5 stay null
   * and render as plain text rather than as a link that would 404.
   */
  mdata_vendor_id: string | null;
  payment_date: string;
  amount_cents: number | null;
  amount: number | null;
  payment_method: string;
  from_bank_account_id: string | null;
  check_number: string | null;
  reference_number: string | null;
  memo: string | null;
  qbo_bill_payment_id: string | null;
  created_by_user_id: string | null;
  status: string;
  created_at: string;
  revoked_at: string | null;
  // BANKREC-LISTSTATUS-01 (read-only, additive): true iff this bill_payment has an ACTIVE
  // (auto_matched|user_matched) banking.reconciliation_matches row.
  is_reconciled: boolean;
  /** Law §9 — resolved from the existing bill_payment posting; no new JE is created here. */
  journal_entry_id?: string | null;
  /** Law §9 reverse drill from a bill payment to its canonical bank-feed transaction. */
  matched_bank_transaction_id?: string | null;
};

type BillMutationClient = {
  query: <T = Record<string, unknown>>(
    sql: string,
    values?: unknown[]
  ) => Promise<{ rows: T[]; rowCount?: number }>;
};

// BANKREC-LISTSTATUS-01: shared correlated-subquery fragments. 'rejected' is the only non-active
// match_state on banking.reconciliation_matches (no reversed_at/voided_at column exists on this
// table — see db/migrations/0219_block_29_bank_reconciliation_matches.sql), so excluding it is
// the reversed/void exclusion. Matches the active-match filter already used at
// bank-recon/match.service.ts (candidate NOT EXISTS clauses).
const BILL_PAYMENT_IS_RECONCILED_SQL = `
  EXISTS (
    SELECT 1
    FROM banking.reconciliation_matches rm
    WHERE rm.ledger_entry_kind = 'bill_payment'
      AND rm.ledger_entry_id = bp.id
      AND rm.operating_company_id = bp.operating_company_id
      AND rm.match_state IN ('auto_matched', 'user_matched')
  )
`;

// Law §9 reverse drill sources. Both are read-only projections: a bill payment is never allowed to
// synthesize a JE or a bank row from this list/detail read path.
const BILL_PAYMENT_JOURNAL_ENTRY_ID_SQL = `
  (
    SELECT jep.journal_entry_uuid::text
    FROM accounting.journal_entry_postings jep
    WHERE jep.operating_company_id = bp.operating_company_id
      AND jep.source_transaction_type = 'bill_payment'
      AND jep.source_transaction_id = bp.id::text
    ORDER BY jep.created_at ASC
    LIMIT 1
  )
`;

const BILL_PAYMENT_BANK_TRANSACTION_ID_SQL = `
  (
    SELECT bt.id::text
    FROM banking.bank_transactions bt
    WHERE bt.operating_company_id = bp.operating_company_id
      AND bt.matched_bill_payment_id = bp.id
    ORDER BY bt.transaction_date DESC, bt.created_at DESC
    LIMIT 1
  )
`;

/**
 * OPEN BALANCE — must match the A/P aging definition.
 *
 * The aging (ap-aging.service.ts AP_AGING_OPEN_BILLS_SQL) computes
 *   amount_cents - SUM(bill_payments) - SUM(vendor_credit_applications)
 * while the bills list and the Pay-Bill picker used only
 *   amount_cents - paid_cents
 * and `vendor-credits.routes.ts` never updates bills.paid_cents. A bill fully settled by a vendor
 * credit therefore dropped to $0 in the aging but stayed listed as open AND stayed selectable in
 * the pay picker — an operator could pay a bill that was already settled by a credit.
 *
 * Fixed on the READ side on purpose: bills.paid_cents has four independent writers (this file x3
 * and bills-bulk.routes.ts), including a void path that recomputes MAX(0, paid - amount). Folding
 * credits into that column would fight those writers and corrupt on the next void.
 *
 * Scoped by operating_company_id as well as bill_id — same as the aging, and it uses the
 * idx_vendor_credit_app_bill_active partial index.
 */
const APPLIED_VENDOR_CREDITS_SQL = `COALESCE((
        SELECT SUM(vca.applied_cents)
        FROM accounting.vendor_credit_applications vca
        WHERE vca.bill_id = b.id
          AND vca.operating_company_id = b.operating_company_id
          AND vca.voided_at IS NULL
      ), 0)`;

/** Open balance net of payments AND non-voided vendor credits. */
const BILL_OPEN_BALANCE_SQL = `(COALESCE(b.amount_cents, 0) - COALESCE(b.paid_cents, 0) - ${APPLIED_VENDOR_CREDITS_SQL})`;

/** ACCT-F603 — resolve bill → mdata.vendors via canonical uuid columns, never legacy QBO vendor_id text. */
const BILL_VENDOR_UUID_PATTERN = `'^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'`;

const BILL_VENDOR_RESOLVE_JOIN_SQL = `
  LEFT JOIN mdata.vendors v
    ON v.operating_company_id = b.operating_company_id
   AND (
     v.id = b.mdata_vendor_id
     OR (
       b.vendor_uuid ~* ${BILL_VENDOR_UUID_PATTERN}
       AND v.id::text = b.vendor_uuid
     )
     OR (b.vendor_id IS NOT NULL AND v.qbo_vendor_id = b.vendor_id)
   )
`;

const BILL_PAYMENT_MDATA_VENDOR_ID_SQL = `
  (
    SELECT v.id::text
      FROM mdata.vendors v
     WHERE v.operating_company_id = bp.operating_company_id
       AND v.qbo_vendor_id = bp.vendor_id
     LIMIT 1
  )
`;

const BILL_IS_RECONCILED_SQL = `
  EXISTS (
    SELECT 1
    FROM accounting.bill_payments bp
    JOIN banking.reconciliation_matches rm
      ON rm.ledger_entry_kind = 'bill_payment'
     AND rm.ledger_entry_id = bp.id
     AND rm.operating_company_id = bp.operating_company_id
    WHERE bp.bill_id = b.id
      AND bp.operating_company_id = b.operating_company_id
      AND bp.revoked_at IS NULL
      AND rm.match_state IN ('auto_matched', 'user_matched')
  )
`;

type BillVendorWriteColumns = {
  vendorIdText: string;
  vendorUuidText: string | null;
  mdataVendorId: string | null;
};

/** ACCT-F603 — write vendor_id (QBO text), vendor_uuid (mdata uuid text), mdata_vendor_id (uuid FK). */
async function resolveBillVendorWriteColumns(
  client: { query: (sql: string, values?: unknown[]) => Promise<{ rows: Array<{ id: string; qbo_vendor_id: string | null }> }> },
  operatingCompanyId: string,
  vendorId: string
): Promise<BillVendorWriteColumns> {
  const trimmed = vendorId.trim();
  const res = await client.query(
    `SELECT v.id::text, v.qbo_vendor_id
       FROM mdata.vendors v
      WHERE v.operating_company_id = $1::uuid
        AND (v.id::text = $2::text OR v.qbo_vendor_id = $2::text)
      LIMIT 1`,
    [operatingCompanyId, trimmed]
  );
  const row = res.rows[0];
  if (row) {
    return {
      vendorIdText: row.qbo_vendor_id ?? trimmed,
      vendorUuidText: row.id,
      mdataVendorId: row.id,
    };
  }
  // ACCT-F158 — FAIL CLOSED. The SELECT above is already entity-scoped, so reaching here means the
  // vendor does not exist inside the caller's own entity. The previous fallback returned nulls (or,
  // for a uuid-shaped input, wrote that uuid through unchecked), and both branches failed OPEN:
  //
  //   • mdataVendorId = null  ->  the ACCT-F142 duplicate index is PARTIAL on
  //     `mdata_vendor_id IS NOT NULL`, so a null-vendor bill escapes it entirely and the same vendor
  //     bill can be entered without limit — precisely the defect ACCT-F142 exists to stop. Four such
  //     rows are on prod today (USMCA-RB-002, USMCA-TEST-BILL-05, GL-PROOF-BILL-001, f8f8e5a4).
  //   • mdataVendorId = trimmed (uuid-shaped)  ->  written straight into the FK column, whose
  //     constraint `bills_mdata_vendor_id_fkey` REFERENCES mdata.vendors(id) with NO entity
  //     predicate. Since the scoped lookup just proved the vendor is not in this entity, a uuid that
  //     resolves at all resolves to ANOTHER ENTITY'S vendor, and the bill accepts it.
  //
  // An unresolvable vendor is an error, not a null. Named to match the sibling
  // `bill_line_account_not_in_company` so bills.routes.ts maps it to a 400, not a 500.
  throw Object.assign(new Error("bill_vendor_not_in_company"), { code: "bill_vendor_not_in_company" });
}

function hashPayload(payload: Record<string, unknown>) {
  return crypto.createHash("sha256").update(JSON.stringify(payload)).digest("hex");
}

function canonicalStatus(statusRaw: string, amountCents: number, paidCents: number, revokedAt: string | null): BillStatus {
  if (revokedAt || statusRaw === "void" || statusRaw === "voided") return "voided";
  if (paidCents <= 0) return "open";
  if (paidCents >= amountCents) return "paid";
  return "partial";
}

function storageStatusForPaid(total: number, paid: number): string {
  if (paid <= 0) return "unpaid";
  if (paid >= total) return "paid";
  return "partially_paid";
}

function normalizeBill(row: BillRow) {
  const amountCents = Number(row.amount_cents ?? Math.round(Number(row.total_amount ?? 0) * 100));
  const paidCents = Number(
    row.paid_cents ??
      (row.status === "paid"
        ? amountCents
        : Math.round(Number(row.paid_amount ?? 0) * 100))
  );
  const vendorId = String(row.vendor_id ?? row.vendor_uuid ?? "");
  return {
    ...row,
    amount_cents: amountCents,
    paid_cents: paidCents,
    vendor_id: vendorId || null,
    status: canonicalStatus(String(row.status ?? ""), amountCents, paidCents, row.revoked_at),
  };
}

// Exported for allocations.service.ts (Allocations list reuses the same QBO-snapshot vendor
// display-name lookup as listBills — never invent a second vendor-name resolver).
export async function resolveVendorDisplayMap(
  operatingCompanyId: string,
  vendorIds: string[]
): Promise<Record<string, string>> {
  if (!vendorIds.length) return {};
  return withLuciaBypass(async (client) => {
    await client.query(`SELECT set_config('app.operating_company_id', $1, true)`, [operatingCompanyId]);
    const res = await client.query<{
      vendor_id: string;
      display_name: string | null;
    }>(
      `
        WITH ranked AS (
          SELECT
            es.qbo_entity_id AS vendor_id,
            COALESCE(es.raw_snapshot->>'DisplayName', es.raw_snapshot->>'Name', es.qbo_entity_id) AS display_name,
            ROW_NUMBER() OVER (PARTITION BY es.qbo_entity_id ORDER BY es.snapshot_taken_at DESC, es.created_at DESC) AS rn
          FROM qbo_archive.entities_snapshot es
          WHERE es.operating_company_id = $1
            AND es.qbo_entity_type = 'Vendor'
            AND es.qbo_entity_id = ANY($2::text[])
        )
        SELECT vendor_id, display_name
        FROM ranked
        WHERE rn = 1
      `,
      [operatingCompanyId, vendorIds]
    );
    const map: Record<string, string> = {};
    for (const row of res.rows) {
      map[row.vendor_id] = row.display_name ?? row.vendor_id;
    }
    return map;
  });
}

async function updateBankBalance(
  client: { query: (sql: string, values?: unknown[]) => Promise<{ rowCount?: number }> },
  operatingCompanyId: string,
  bankAccountId: string,
  deltaCents: number
) {
  const res = await client.query(
    `
      UPDATE banking.bank_accounts
      SET current_balance_cents = current_balance_cents + $3,
          updated_at = now()
      WHERE id = $1
        AND operating_company_id = $2
    `,
    [bankAccountId, operatingCompanyId, deltaCents]
  );
  if ((res.rowCount ?? 0) === 0) {
    throw new Error("bank_account_not_found_for_payment");
  }
}

export async function listVendorBalances(
  userId: string,
  operatingCompanyId: string,
  options: ListVendorBalancesOptions
) {
  const rows = await withCurrentUser(userId, async (client) => {
    await client.query(`SELECT set_config('app.operating_company_id', $1, true)`, [operatingCompanyId]);
    const where: string[] = ["vb.operating_company_id = $1"];
    if (!options.includeZero) where.push("vb.balance_cents > 0");
    const orderBy =
      options.sort === "balance_asc"
        ? "ORDER BY vb.balance_cents ASC, vb.vendor_id ASC"
        : options.sort === "vendor_asc"
          ? "ORDER BY vb.vendor_id ASC"
          : "ORDER BY vb.balance_cents DESC, vb.vendor_id ASC";
    const res = await client.query<{
      operating_company_id: string;
      vendor_id: string;
      balance_cents: number;
      open_bill_count: number;
      next_due_date: string | null;
      last_bill_date: string | null;
    }>(
      `
        SELECT
          vb.operating_company_id,
          vb.vendor_id,
          vb.balance_cents,
          vb.open_bill_count,
          vb.next_due_date::text,
          vb.last_bill_date::text
        FROM accounting.vendor_balances vb
        WHERE ${where.join(" AND ")}
        ${orderBy}
      `,
      [operatingCompanyId]
    );
    return res.rows;
  });

  const vendorIds = rows.map((row) => row.vendor_id);
  const vendorNames = await resolveVendorDisplayMap(operatingCompanyId, vendorIds);
  return rows.map((row) => ({
    ...row,
    vendor_name: vendorNames[row.vendor_id] ?? row.vendor_id,
  }));
}

export async function listBillsByVendor(
  userId: string,
  operatingCompanyId: string,
  vendorId: string,
  options: ListBillsOptions
) {
  const rows = await withCurrentUser(userId, async (client) => {
    await client.query(`SELECT set_config('app.operating_company_id', $1, true)`, [operatingCompanyId]);
    // ACCT-ECON-05: match EITHER identifier space. Callers pass an mdata.vendors uuid (vendor
    // detail A/P tab, vendor-credit apply picker) while QBO-sourced bills carry the QBO vendor id,
    // so an equality test on the raw value returned zero rows for 16211 of 16212 prod bills.
    const where: string[] = [
      "b.operating_company_id = $1",
      `COALESCE(NULLIF(b.vendor_id,''), NULLIF(b.vendor_uuid,'')) IN ${vendorIdentitySetSql(1, 2)}`,
    ];
    const values: unknown[] = [operatingCompanyId, vendorId];
    if (options.fromDate) {
      values.push(options.fromDate);
      where.push(`b.bill_date >= $${values.length}::date`);
    }
    if (options.toDate) {
      values.push(options.toDate);
      where.push(`b.bill_date <= $${values.length}::date`);
    }
    if (options.status) {
      if (options.status === "open") where.push("b.status IN ('open','unpaid')");
      if (options.status === "partial") where.push("b.status IN ('partial','partially_paid')");
      if (options.status === "paid") where.push("b.status = 'paid'");
      if (options.status === "voided") where.push("(b.status IN ('void','voided') OR b.revoked_at IS NOT NULL)");
      if (options.status !== "voided") where.push("b.revoked_at IS NULL");
    } else {
      where.push("b.revoked_at IS NULL");
    }
    if (options.hasBalance) {
      where.push(`${BILL_OPEN_BALANCE_SQL} > 0`);
    }
    values.push(options.limit, options.offset);
    const res = await client.query<BillRow>(
      `
        SELECT b.*, ${BILL_IS_RECONCILED_SQL} AS is_reconciled
        FROM accounting.bills b
        WHERE ${where.join(" AND ")}
        ORDER BY b.bill_date DESC, b.created_at DESC
        LIMIT $${values.length - 1}
        OFFSET $${values.length}
      `,
      values
    );
    return res.rows.map(normalizeBill);
  });
  return rows;
}

export async function listAllBillsForCompany(
  userId: string,
  operatingCompanyId: string,
  options: ListBillsOptions
) {
  const rows = await withCurrentUser(userId, async (client) => {
    await client.query(`SELECT set_config('app.operating_company_id', $1, true)`, [operatingCompanyId]);
    const where: string[] = ["b.operating_company_id = $1"];
    const values: unknown[] = [operatingCompanyId];
    if (options.fromDate) {
      values.push(options.fromDate);
      where.push(`b.bill_date >= $${values.length}::date`);
    }
    if (options.toDate) {
      values.push(options.toDate);
      where.push(`b.bill_date <= $${values.length}::date`);
    }
    if (options.status) {
      if (options.status === "open") where.push("b.status IN ('open','unpaid')");
      if (options.status === "partial") where.push("b.status IN ('partial','partially_paid')");
      if (options.status === "paid") where.push("b.status = 'paid'");
      if (options.status === "voided") where.push("(b.status IN ('void','voided') OR b.revoked_at IS NOT NULL)");
      if (options.status !== "voided") where.push("b.revoked_at IS NULL");
    } else {
      where.push("b.revoked_at IS NULL");
    }
    if (options.hasBalance) {
      where.push(`${BILL_OPEN_BALANCE_SQL} > 0`);
    }
    values.push(options.limit, options.offset);
    const res = await client.query<BillRow>(
      `
        SELECT b.*, ${BILL_IS_RECONCILED_SQL} AS is_reconciled
        FROM accounting.bills b
        WHERE ${where.join(" AND ")}
        ORDER BY b.bill_date DESC, b.created_at DESC
        LIMIT $${values.length - 1}
        OFFSET $${values.length}
      `,
      values
    );
    return res.rows.map(normalizeBill);
  });

  const vendorIds = [...new Set(rows.map((r) => r.vendor_id).filter((v): v is string => Boolean(v)))];
  const vendorNames = await resolveVendorDisplayMap(operatingCompanyId, vendorIds);
  return rows.map((r) => ({
    ...r,
    vendor_name: r.vendor_id ? vendorNames[r.vendor_id] ?? r.vendor_id : null,
    balance_cents: Math.max(0, r.amount_cents - r.paid_cents),
  }));
}

export async function listBillPaymentsForBill(userId: string, operatingCompanyId: string, billId: string) {
  return withCurrentUser(userId, async (client) => {
    await client.query(`SELECT set_config('app.operating_company_id', $1, true)`, [operatingCompanyId]);
    const billRes = await client.query<{ id: string }>(
      `
        SELECT id
        FROM accounting.bills
        WHERE id = $1
          AND operating_company_id = $2
        LIMIT 1
      `,
      [billId, operatingCompanyId]
    );
    if (!billRes.rows[0]) return null;
    const res = await client.query<BillPaymentRow>(
      `
        SELECT bp.*,
               -- ACCT-F84: entity-scoped resolve of the legacy TEXT vendor_id to the canonical
               -- mdata.vendors uuid, so the UI can drill through instead of linking to a 404.
               (SELECT v.id::text
                  FROM mdata.vendors v
                 WHERE v.qbo_vendor_id = bp.vendor_id
                   AND v.operating_company_id = bp.operating_company_id
                 LIMIT 1) AS mdata_vendor_id,
               ${BILL_PAYMENT_IS_RECONCILED_SQL} AS is_reconciled,
               ${BILL_PAYMENT_JOURNAL_ENTRY_ID_SQL} AS journal_entry_id,
               ${BILL_PAYMENT_BANK_TRANSACTION_ID_SQL} AS matched_bank_transaction_id
        FROM accounting.bill_payments bp
        WHERE bp.bill_id = $1
          AND bp.operating_company_id = $2
          AND bp.revoked_at IS NULL
        ORDER BY bp.payment_date DESC, bp.created_at DESC
      `,
      [billId, operatingCompanyId]
    );
    return res.rows.map((row) => ({
      ...row,
      amount_cents: Number(row.amount_cents ?? Math.round(Number(row.amount ?? 0) * 100)),
    }));
  });
}

/**
 * Reverse drill-through for the WO↔bill/expense HARD link (migration 202607050810): given a work
 * order id, return the bills + expenses that reference it via the canonical linked_work_order_uuid
 * FK. This is the reverse half of the bidirectional link (forward half = FK persisted on create). It
 * surfaces BOTH modal-created (#2081) and WO-close-posting-created bills/expenses. Read-only,
 * company-scoped. Guarded on column existence so it degrades to empty lists (never 500s). No writes.
 */
export async function listWorkOrderLinkedFinancials(
  userId: string,
  operatingCompanyId: string,
  workOrderId: string
): Promise<{
  bills: Array<{ id: string; bill_number: string | null; bill_date: string | null; amount_cents: number; status: string | null; memo: string | null }>;
  expenses: Array<{ id: string; transaction_date: string | null; total_amount_cents: number; status: string | null; memo: string | null }>;
}> {
  return withCurrentUser(userId, async (client) => {
    await client.query(`SELECT set_config('app.operating_company_id', $1, true)`, [operatingCompanyId]);
    const colExists = async (schema: string, table: string, column: string): Promise<boolean> => {
      const r = await client.query(
        `SELECT 1 FROM information_schema.columns WHERE table_schema=$1 AND table_name=$2 AND column_name=$3`,
        [schema, table, column]
      );
      return (r.rowCount ?? 0) > 0;
    };

    let bills: Array<{ id: string; bill_number: string | null; bill_date: string | null; amount_cents: number; status: string | null; memo: string | null }> = [];
    if (await colExists("accounting", "bills", "linked_work_order_uuid")) {
      const res = await client.query(
        `SELECT b.id::text AS id, b.bill_number, b.bill_date::text AS bill_date,
                COALESCE(b.amount_cents, 0)::bigint AS amount_cents, b.status, b.memo
           FROM accounting.bills b
          WHERE b.operating_company_id = $1
            AND b.linked_work_order_uuid = $2
            AND b.revoked_at IS NULL
          ORDER BY b.bill_date DESC NULLS LAST, b.created_at DESC`,
        [operatingCompanyId, workOrderId]
      );
      bills = res.rows.map((r: Record<string, unknown>) => ({
        id: String(r.id),
        bill_number: (r.bill_number as string) ?? null,
        bill_date: (r.bill_date as string) ?? null,
        amount_cents: Number(r.amount_cents ?? 0),
        status: (r.status as string) ?? null,
        memo: (r.memo as string) ?? null,
      }));
    }

    let expenses: Array<{ id: string; transaction_date: string | null; total_amount_cents: number; status: string | null; memo: string | null }> = [];
    if (await colExists("accounting", "expenses", "linked_work_order_uuid")) {
      const hasMemo = await colExists("accounting", "expenses", "memo");
      const res = await client.query(
        `SELECT e.id::text AS id, e.transaction_date::text AS transaction_date,
                COALESCE(e.total_amount_cents, 0)::bigint AS total_amount_cents, e.status,
                ${hasMemo ? "e.memo" : "NULL::text AS memo"}
           FROM accounting.expenses e
          WHERE e.operating_company_id = $1
            AND e.linked_work_order_uuid = $2
            AND e.status <> 'void'
          ORDER BY e.transaction_date DESC NULLS LAST, e.created_at DESC`,
        [operatingCompanyId, workOrderId]
      );
      expenses = res.rows.map((r: Record<string, unknown>) => ({
        id: String(r.id),
        transaction_date: (r.transaction_date as string) ?? null,
        total_amount_cents: Number(r.total_amount_cents ?? 0),
        status: (r.status as string) ?? null,
        memo: (r.memo as string) ?? null,
      }));
    }

    return { bills, expenses };
  });
}

/**
 * Reverse drill-through for Claim→Bill/Expense (held migration 202607740000): given an
 * insurance.claim id, return bills + expenses + work orders that reference it via
 * insurance_claim_id. Column-gated so pre-Neon-apply DBs return empty lists (never 500).
 */
export async function listClaimLinkedFinancials(
  userId: string,
  operatingCompanyId: string,
  insuranceClaimId: string
): Promise<{
  bills: Array<{ id: string; bill_number: string | null; bill_date: string | null; amount_cents: number; status: string | null; memo: string | null }>;
  expenses: Array<{ id: string; transaction_date: string | null; total_amount_cents: number; status: string | null; memo: string | null }>;
  work_orders: Array<{ id: string; display_id: string | null; status: string | null }>;
  columns_present: { bills: boolean; expenses: boolean; work_orders: boolean };
}> {
  return withCurrentUser(userId, async (client) => {
    await client.query(`SELECT set_config('app.operating_company_id', $1, true)`, [operatingCompanyId]);
    const colExists = async (schema: string, table: string, column: string): Promise<boolean> => {
      const r = await client.query(
        `SELECT 1 FROM information_schema.columns WHERE table_schema=$1 AND table_name=$2 AND column_name=$3`,
        [schema, table, column]
      );
      return (r.rowCount ?? 0) > 0;
    };

    const hasBillCol = await colExists("accounting", "bills", "insurance_claim_id");
    const hasExpenseCol = await colExists("accounting", "expenses", "insurance_claim_id");
    const hasWoCol = await colExists("maintenance", "work_orders", "insurance_claim_id");

    let bills: Array<{ id: string; bill_number: string | null; bill_date: string | null; amount_cents: number; status: string | null; memo: string | null }> = [];
    if (hasBillCol) {
      const res = await client.query(
        `SELECT b.id::text AS id, b.bill_number, b.bill_date::text AS bill_date,
                COALESCE(b.amount_cents, 0)::bigint AS amount_cents, b.status, b.memo
           FROM accounting.bills b
          WHERE b.operating_company_id = $1
            AND b.insurance_claim_id = $2
            AND b.revoked_at IS NULL
          ORDER BY b.bill_date DESC NULLS LAST, b.created_at DESC`,
        [operatingCompanyId, insuranceClaimId]
      );
      bills = res.rows.map((r: Record<string, unknown>) => ({
        id: String(r.id),
        bill_number: (r.bill_number as string) ?? null,
        bill_date: (r.bill_date as string) ?? null,
        amount_cents: Number(r.amount_cents ?? 0),
        status: (r.status as string) ?? null,
        memo: (r.memo as string) ?? null,
      }));
    }

    let expenses: Array<{ id: string; transaction_date: string | null; total_amount_cents: number; status: string | null; memo: string | null }> = [];
    if (hasExpenseCol) {
      const hasMemo = await colExists("accounting", "expenses", "memo");
      const res = await client.query(
        `SELECT e.id::text AS id, e.transaction_date::text AS transaction_date,
                COALESCE(e.total_amount_cents, 0)::bigint AS total_amount_cents, e.status,
                ${hasMemo ? "e.memo" : "NULL::text AS memo"}
           FROM accounting.expenses e
          WHERE e.operating_company_id = $1
            AND e.insurance_claim_id = $2
            AND e.status <> 'void'
          ORDER BY e.transaction_date DESC NULLS LAST, e.created_at DESC`,
        [operatingCompanyId, insuranceClaimId]
      );
      expenses = res.rows.map((r: Record<string, unknown>) => ({
        id: String(r.id),
        transaction_date: (r.transaction_date as string) ?? null,
        total_amount_cents: Number(r.total_amount_cents ?? 0),
        status: (r.status as string) ?? null,
        memo: (r.memo as string) ?? null,
      }));
    }

    let work_orders: Array<{ id: string; display_id: string | null; status: string | null }> = [];
    if (hasWoCol) {
      const res = await client.query(
        `SELECT wo.id::text AS id, wo.display_id, wo.status
           FROM maintenance.work_orders wo
          WHERE wo.operating_company_id = $1
            AND wo.insurance_claim_id = $2
          ORDER BY wo.created_at DESC NULLS LAST
          LIMIT 100`,
        [operatingCompanyId, insuranceClaimId]
      );
      work_orders = res.rows.map((r: Record<string, unknown>) => ({
        id: String(r.id),
        display_id: (r.display_id as string) ?? null,
        status: (r.status as string) ?? null,
      }));
    }

    return {
      bills,
      expenses,
      work_orders,
      columns_present: { bills: hasBillCol, expenses: hasExpenseCol, work_orders: hasWoCol },
    };
  });
}

/**
 * Reverse drill-through for Unit→Bill/Expense (ACCT-F04): given an mdata.units id, return bills +
 * expenses that reference it via unit_id. Column-gated; entity-scoped; read-only.
 */
export async function listUnitLinkedFinancials(
  userId: string,
  operatingCompanyId: string,
  unitId: string
): Promise<{
  bills: Array<{ id: string; bill_number: string | null; bill_date: string | null; amount_cents: number; status: string | null; memo: string | null }>;
  expenses: Array<{ id: string; transaction_date: string | null; total_amount_cents: number; status: string | null; memo: string | null }>;
  columns_present: { bills: boolean; expenses: boolean };
}> {
  return withCurrentUser(userId, async (client) => {
    await client.query(`SELECT set_config('app.operating_company_id', $1, true)`, [operatingCompanyId]);
    const colExists = async (schema: string, table: string, column: string): Promise<boolean> => {
      const r = await client.query(
        `SELECT 1 FROM information_schema.columns WHERE table_schema=$1 AND table_name=$2 AND column_name=$3`,
        [schema, table, column]
      );
      return (r.rowCount ?? 0) > 0;
    };

    const hasBillCol = await colExists("accounting", "bills", "unit_id");
    const hasExpenseCol = await colExists("accounting", "expenses", "unit_id");

    let bills: Array<{ id: string; bill_number: string | null; bill_date: string | null; amount_cents: number; status: string | null; memo: string | null }> = [];
    if (hasBillCol) {
      const res = await client.query(
        `SELECT b.id::text AS id, b.bill_number, b.bill_date::text AS bill_date,
                COALESCE(b.amount_cents, 0)::bigint AS amount_cents, b.status, b.memo
           FROM accounting.bills b
          WHERE b.operating_company_id = $1
            AND b.unit_id = $2
            AND b.revoked_at IS NULL
          ORDER BY b.bill_date DESC NULLS LAST, b.created_at DESC`,
        [operatingCompanyId, unitId]
      );
      bills = res.rows.map((r: Record<string, unknown>) => ({
        id: String(r.id),
        bill_number: (r.bill_number as string) ?? null,
        bill_date: (r.bill_date as string) ?? null,
        amount_cents: Number(r.amount_cents ?? 0),
        status: (r.status as string) ?? null,
        memo: (r.memo as string) ?? null,
      }));
    }

    let expenses: Array<{ id: string; transaction_date: string | null; total_amount_cents: number; status: string | null; memo: string | null }> = [];
    if (hasExpenseCol) {
      const hasMemo = await colExists("accounting", "expenses", "memo");
      const res = await client.query(
        `SELECT e.id::text AS id, e.transaction_date::text AS transaction_date,
                COALESCE(e.total_amount_cents, 0)::bigint AS total_amount_cents, e.status,
                ${hasMemo ? "e.memo" : "NULL::text AS memo"}
           FROM accounting.expenses e
          WHERE e.operating_company_id = $1
            AND e.unit_id = $2
            AND e.status <> 'void'
          ORDER BY e.transaction_date DESC NULLS LAST, e.created_at DESC`,
        [operatingCompanyId, unitId]
      );
      expenses = res.rows.map((r: Record<string, unknown>) => ({
        id: String(r.id),
        transaction_date: (r.transaction_date as string) ?? null,
        total_amount_cents: Number(r.total_amount_cents ?? 0),
        status: (r.status as string) ?? null,
        memo: (r.memo as string) ?? null,
      }));
    }

    return {
      bills,
      expenses,
      columns_present: { bills: hasBillCol, expenses: hasExpenseCol },
    };
  });
}

export async function listBills(
  userId: string,
  operatingCompanyId: string,
  options: {
    vendorId?: string;
    status?: BillStatus;
    fromDate?: string;
    toDate?: string;
    hasBalance?: boolean;
    limit: number;
    offset: number;
  }
) {
  if (!options.vendorId) {
    return listAllBillsForCompany(userId, operatingCompanyId, options);
  }
  const rows = await listBillsByVendor(userId, operatingCompanyId, options.vendorId, options);
  // Resolve names from the ROWS, not from the requested id: a vendor asked for by mdata uuid now
  // returns bills keyed by that vendor's QBO id, and a map built from the uuid would miss them.
  const vendorNames = await resolveVendorDisplayMap(
    operatingCompanyId,
    [...new Set(rows.map((r) => r.vendor_id).filter((v): v is string => Boolean(v)))]
  );
  return rows.map((r) => ({
    ...r,
    vendor_name: r.vendor_id ? vendorNames[r.vendor_id] ?? r.vendor_id : null,
    balance_cents: Math.max(0, r.amount_cents - r.paid_cents),
  }));
}

export async function listBillPayments(
  userId: string,
  operatingCompanyId: string,
  options: ListBillPaymentsOptions
) {
  return withCurrentUser(userId, async (client) => {
    await client.query(`SELECT set_config('app.operating_company_id', $1, true)`, [operatingCompanyId]);
    const where: string[] = ["bp.operating_company_id = $1", "bp.revoked_at IS NULL"];
    const values: unknown[] = [operatingCompanyId];
    if (options.vendorId) {
      values.push(options.vendorId);
      where.push(`bp.vendor_id = $${values.length}`);
    }
    if (options.dateFrom) {
      values.push(options.dateFrom);
      where.push(`bp.payment_date >= $${values.length}::date`);
    }
    if (options.dateTo) {
      values.push(options.dateTo);
      where.push(`bp.payment_date <= $${values.length}::date`);
    }
    values.push(options.limit, options.offset);
    const res = await client.query<BillPaymentRow>(
      `
        SELECT bp.*,
               -- ACCT-F84: entity-scoped resolve of the legacy TEXT vendor_id to the canonical
               -- mdata.vendors uuid, so the UI can drill through instead of linking to a 404.
               (SELECT v.id::text
                  FROM mdata.vendors v
                 WHERE v.qbo_vendor_id = bp.vendor_id
                   AND v.operating_company_id = bp.operating_company_id
                 LIMIT 1) AS mdata_vendor_id,
               ${BILL_PAYMENT_IS_RECONCILED_SQL} AS is_reconciled,
               ${BILL_PAYMENT_JOURNAL_ENTRY_ID_SQL} AS journal_entry_id,
               ${BILL_PAYMENT_BANK_TRANSACTION_ID_SQL} AS matched_bank_transaction_id
        FROM accounting.bill_payments bp
        WHERE ${where.join(" AND ")}
        ORDER BY bp.payment_date DESC, bp.created_at DESC
        LIMIT $${values.length - 1}
        OFFSET $${values.length}
      `,
      values
    );
    return res.rows.map((row) => ({
      ...row,
      amount_cents: Number(row.amount_cents ?? Math.round(Number(row.amount ?? 0) * 100)),
    }));
  });
}

export async function getBillDetail(userId: string, operatingCompanyId: string, billId: string) {
  return withCurrentUser(userId, async (client) => {
    await client.query(`SELECT set_config('app.operating_company_id', $1, true)`, [operatingCompanyId]);
    const billRes = await client.query<BillRow & { vendor_name?: string | null; unit_id?: string | null; linked_work_order_uuid?: string | null }>(
      `
        SELECT
          b.*,
          v.vendor_name,
          (
            SELECT jep.journal_entry_uuid::text
            FROM accounting.journal_entry_postings jep
            WHERE jep.operating_company_id = b.operating_company_id
              AND jep.source_transaction_type = 'bill'
              AND jep.source_transaction_id = b.id::text
            ORDER BY jep.created_at ASC
            LIMIT 1
          ) AS journal_entry_id
        FROM accounting.bills b
        ${BILL_VENDOR_RESOLVE_JOIN_SQL}
        WHERE b.id = $1
          AND b.operating_company_id = $2
        LIMIT 1
      `,
      [billId, operatingCompanyId]
    );
    const bill = billRes.rows[0];
    if (!bill) return null;
    const paymentsRes = await client.query<BillPaymentRow>(
      `
        SELECT *
        FROM accounting.bill_payments
        WHERE bill_id = $1
          AND operating_company_id = $2
        ORDER BY payment_date DESC, created_at DESC
      `,
      [billId, operatingCompanyId]
    );
    // Law §9 reverse drill-through: a bill must expose every active or voided vendor-credit
    // application that references it. This is read-only subledger evidence; no GL is calculated here.
    const vendorCreditApplicationsRes = await client.query<{
      id: string;
      credit_id: string;
      display_id: string;
      applied_cents: string | number;
      applied_at: string;
      voided_at: string | null;
    }>(
      `
        SELECT
          vca.id::text AS id,
          vca.credit_id::text AS credit_id,
          vc.display_id,
          vca.applied_cents,
          vca.applied_at,
          vca.voided_at
        FROM accounting.vendor_credit_applications vca
        JOIN accounting.vendor_credits vc
          ON vc.id = vca.credit_id
         AND vc.operating_company_id = vca.operating_company_id
        WHERE vca.bill_id = $1::uuid
          AND vca.operating_company_id = $2::uuid
        ORDER BY vca.applied_at DESC, vca.id DESC
      `,
      [billId, operatingCompanyId]
    );
    const linesRes = await client.query<{
      id: string;
      line_sequence: number;
      amount_cents: string | null;
      description: string | null;
      account_id: string | null;
      account_number: string | null;
      account_name: string | null;
      load_id: string | null;
      load_number: string | null;
      voided_at: Date | string | null;
      voided_reason: string | null;
    }>(
      `
        SELECT
          bl.id::text AS id,
          bl.line_sequence,
          ROUND(COALESCE(bl.amount, 0) * 100)::bigint::text AS amount_cents,
          bl.description,
          bl.account_id::text AS account_id,
          acct.account_number,
          acct.account_name,
          bl.load_id::text AS load_id,
          l.load_number,
          bl.voided_at,
          bl.voided_reason
        FROM accounting.bill_lines bl
        LEFT JOIN catalogs.accounts acct
          ON acct.id = bl.account_id
         AND acct.operating_company_id = $2::uuid
        LEFT JOIN mdata.loads l
          ON l.id = bl.load_id
         AND l.operating_company_id = $2::uuid
        WHERE bl.bill_id = $1::uuid
        ORDER BY bl.line_sequence ASC
      `,
      [billId, operatingCompanyId]
    );
    const auditEvents = await withLuciaBypass(async (auditClient) => {
      const res = await auditClient.query(
        `
          SELECT *
          FROM audit.audit_events
          WHERE payload->>'resource_id' = $1
            AND payload->>'resource_type' IN ('accounting.bills','accounting.bill_payments')
          ORDER BY created_at DESC
          LIMIT 100
        `,
        [billId]
      );
      return res.rows;
    });
    const normalized = normalizeBill(bill);
    return {
      bill: {
        ...normalized,
        vendor_name: bill.vendor_name ?? null,
        journal_entry_id: (bill as { journal_entry_id?: string | null }).journal_entry_id ?? null,
        unit_id: bill.unit_id ?? null,
        linked_work_order_uuid: bill.linked_work_order_uuid ?? null,
      },
      lines: linesRes.rows.map((row) => ({
        id: row.id,
        line_sequence: Number(row.line_sequence ?? 0),
        amount_cents: Number(row.amount_cents ?? 0),
        description: row.description,
        account_id: row.account_id,
        account_number: row.account_number,
        account_name: row.account_name,
        load_id: row.load_id,
        load_number: row.load_number,
        voided_at: row.voided_at ?? null,
        voided_reason: row.voided_reason ?? null,
      })),
      payments: paymentsRes.rows.map((row) => ({
        ...row,
        amount_cents: Number(row.amount_cents ?? Math.round(Number(row.amount ?? 0) * 100)),
      })),
      vendor_credit_applications: vendorCreditApplicationsRes.rows.map((row) => ({
        id: row.id,
        credit_id: row.credit_id,
        display_id: row.display_id,
        applied_cents: Number(row.applied_cents ?? 0),
        applied_at: row.applied_at,
        voided_at: row.voided_at,
      })),
      audit_events: auditEvents,
    };
  });
}

/** Law §9 reverse: bill payment detail + JE from postings (no journal_entry_id column on bill_payments). */
export async function getBillPaymentDetail(userId: string, operatingCompanyId: string, paymentId: string) {
  return withCurrentUser(userId, async (client) => {
    await client.query(`SELECT set_config('app.operating_company_id', $1, true)`, [operatingCompanyId]);
    const paymentRes = await client.query<
      BillPaymentRow & {
        journal_entry_id: string | null;
        matched_bank_transaction_id: string | null;
        vendor_name: string | null;
        bill_number: string | null;
      }
    >(
      `
        SELECT
          bp.*,
          ${BILL_PAYMENT_MDATA_VENDOR_ID_SQL} AS mdata_vendor_id,
          v.vendor_name,
          b.bill_number,
          (
            ${BILL_PAYMENT_JOURNAL_ENTRY_ID_SQL}
          ) AS journal_entry_id,
          ${BILL_PAYMENT_BANK_TRANSACTION_ID_SQL} AS matched_bank_transaction_id
        FROM accounting.bill_payments bp
        LEFT JOIN mdata.vendors v
          ON v.id = (
            SELECT v2.id
              FROM mdata.vendors v2
             WHERE v2.operating_company_id = bp.operating_company_id
               AND v2.qbo_vendor_id = bp.vendor_id
             LIMIT 1
          )
         AND v.operating_company_id = bp.operating_company_id
        LEFT JOIN accounting.bills b
          ON b.id = bp.bill_id
         AND b.operating_company_id = bp.operating_company_id
        WHERE bp.id = $1::uuid
          AND bp.operating_company_id = $2::uuid
        LIMIT 1
      `,
      [paymentId, operatingCompanyId]
    );
    const row = paymentRes.rows[0];
    if (!row) return null;
    return {
      payment: {
        ...row,
        amount_cents: Number(row.amount_cents ?? Math.round(Number(row.amount ?? 0) * 100)),
        journal_entry_id: row.journal_entry_id ?? null,
        matched_bank_transaction_id: row.matched_bank_transaction_id ?? null,
        vendor_name: row.vendor_name ?? null,
        bill_number: row.bill_number ?? null,
      },
    };
  });
}

export async function createBill(input: CreateBillInput, userId: string) {
  if (input.amountCents <= 0) throw new Error("bill_amount_must_be_positive");

  // LAW-E2E #3167: when the UI (or any caller) sends lines, fail closed — never create a header-only
  // bill that the poster cannot resolve (live Neon had 16k bills / 0 bill_lines).
  const linesProvided = input.lines !== undefined;
  if (linesProvided) {
    if (!input.lines || input.lines.length === 0) throw new Error("bill_lines_required");
    for (const line of input.lines) {
      if (!Number.isInteger(line.amountCents) || line.amountCents <= 0) {
        throw new Error("bill_line_amount_must_be_positive");
      }
    }
    const linesSum = input.lines.reduce((sum, line) => sum + line.amountCents, 0);
    if (linesSum !== input.amountCents) throw new Error("bill_lines_amount_mismatch");
  }

  const bill = await withCurrentUser(userId, async (client) => {
    await client.query(`SELECT set_config('app.operating_company_id', $1, true)`, [input.operatingCompanyId]);
    const claimCol = await client.query(
      `SELECT 1 FROM information_schema.columns
        WHERE table_schema='accounting' AND table_name='bills' AND column_name='insurance_claim_id'`
    );
    const hasInsuranceClaimId = (claimCol.rowCount ?? 0) > 0;
    const insuranceClaimId = hasInsuranceClaimId ? (input.insuranceClaimId ?? null) : null;
    const classCol = await client.query(
      `SELECT 1 FROM information_schema.columns
        WHERE table_schema='accounting' AND table_name='bills' AND column_name='class_id'`
    );
    const hasClassId = (classCol.rowCount ?? 0) > 0;
    const classId = hasClassId ? (input.classId ?? null) : null;
    const vendorCols = await resolveBillVendorWriteColumns(client, input.operatingCompanyId, input.vendorId);

    const res = await client.query<BillRow>(
      hasInsuranceClaimId && hasClassId
        ? `
        INSERT INTO accounting.bills (
          operating_company_id,
          vendor_id,
          vendor_uuid,
          mdata_vendor_id,
          bill_number,
          bill_date,
          due_date,
          amount_cents,
          total_amount,
          paid_cents,
          paid_amount,
          status,
          memo,
          coa_account_id,
          linked_work_order_uuid,
          unit_id,
          insurance_claim_id,
          class_id,
          created_by_user_id,
          created_at,
          updated_at
        )
        VALUES ($1,$2::text,$3::text,$4::uuid,$5,$6,$7,$8,$9,0,0,'unpaid',$10,$11,$13,$14,$15,$16,$12,now(),now())
        RETURNING *
      `
        : hasInsuranceClaimId
        ? `
        INSERT INTO accounting.bills (
          operating_company_id,
          vendor_id,
          vendor_uuid,
          mdata_vendor_id,
          bill_number,
          bill_date,
          due_date,
          amount_cents,
          total_amount,
          paid_cents,
          paid_amount,
          status,
          memo,
          coa_account_id,
          linked_work_order_uuid,
          unit_id,
          insurance_claim_id,
          created_by_user_id,
          created_at,
          updated_at
        )
        VALUES ($1,$2::text,$3::text,$4::uuid,$5,$6,$7,$8,$9,0,0,'unpaid',$10,$11,$13,$14,$15,$12,now(),now())
        RETURNING *
      `
        : hasClassId
          ? `
        INSERT INTO accounting.bills (
          operating_company_id,
          vendor_id,
          vendor_uuid,
          mdata_vendor_id,
          bill_number,
          bill_date,
          due_date,
          amount_cents,
          total_amount,
          paid_cents,
          paid_amount,
          status,
          memo,
          coa_account_id,
          linked_work_order_uuid,
          unit_id,
          class_id,
          created_by_user_id,
          created_at,
          updated_at
        )
        VALUES ($1,$2::text,$3::text,$4::uuid,$5,$6,$7,$8,$9,0,0,'unpaid',$10,$11,$13,$14,$15,$12,now(),now())
        RETURNING *
      `
        : `
        INSERT INTO accounting.bills (
          operating_company_id,
          vendor_id,
          vendor_uuid,
          mdata_vendor_id,
          bill_number,
          bill_date,
          due_date,
          amount_cents,
          total_amount,
          paid_cents,
          paid_amount,
          status,
          memo,
          coa_account_id,
          linked_work_order_uuid,
          unit_id,
          created_by_user_id,
          created_at,
          updated_at
        )
        VALUES ($1,$2::text,$3::text,$4::uuid,$5,$6,$7,$8,$9,0,0,'unpaid',$10,$11,$13,$14,$12,now(),now())
        RETURNING *
      `,
      hasInsuranceClaimId && hasClassId
        ? [
            input.operatingCompanyId,
            vendorCols.vendorIdText,
            vendorCols.vendorUuidText,
            vendorCols.mdataVendorId,
            input.billNumber ?? null,
            input.billDate,
            input.dueDate ?? null,
            input.amountCents,
            input.amountCents / 100,
            input.memo ?? null,
            input.coaAccountId ?? null,
            userId,
            input.workOrderId ?? null,
            input.unitId ?? null,
            insuranceClaimId,
            classId,
          ]
        : hasInsuranceClaimId
        ? [
            input.operatingCompanyId,
            vendorCols.vendorIdText,
            vendorCols.vendorUuidText,
            vendorCols.mdataVendorId,
            input.billNumber ?? null,
            input.billDate,
            input.dueDate ?? null,
            input.amountCents,
            input.amountCents / 100,
            input.memo ?? null,
            input.coaAccountId ?? null,
            userId,
            input.workOrderId ?? null,
            input.unitId ?? null,
            insuranceClaimId,
          ]
        : hasClassId
          ? [
              input.operatingCompanyId,
              vendorCols.vendorIdText,
              vendorCols.vendorUuidText,
              vendorCols.mdataVendorId,
              input.billNumber ?? null,
              input.billDate,
              input.dueDate ?? null,
              input.amountCents,
              input.amountCents / 100,
              input.memo ?? null,
              input.coaAccountId ?? null,
              userId,
              input.workOrderId ?? null,
              input.unitId ?? null,
              classId,
            ]
        : [
            input.operatingCompanyId,
            vendorCols.vendorIdText,
            vendorCols.vendorUuidText,
            vendorCols.mdataVendorId,
            input.billNumber ?? null,
            input.billDate,
            input.dueDate ?? null,
            input.amountCents,
            input.amountCents / 100,
            input.memo ?? null,
            input.coaAccountId ?? null,
            userId,
            input.workOrderId ?? null,
            input.unitId ?? null,
          ]
    );
    if ((res.rowCount ?? 0) === 0 || !res.rows[0]) throw new Error("bill_insert_failed");
    const created = normalizeBill(res.rows[0]);

    if (linesProvided && input.lines) {
      let seq = 0;
      for (const line of input.lines) {
        seq += 1;
        const accountId = line.accountId?.trim() || null;
        if (accountId) {
          // Entity-scope the GL account — never accept a cross-company catalogs.accounts id.
          const acct = await client.query<{ id: string }>(
            `
              SELECT id::text
              FROM catalogs.accounts
              WHERE id = $1::uuid
                AND operating_company_id = $2::uuid
              LIMIT 1
            `,
            [accountId, input.operatingCompanyId]
          );
          if (!acct.rows[0]) throw new Error("bill_line_account_not_in_company");
        }
        const amountDollars = line.amountCents / 100;
        const section = line.section === "A" || line.section === "B" ? line.section : "A";
        await client.query(
          `
            INSERT INTO accounting.bill_lines (
              bill_id,
              line_sequence,
              amount,
              description,
              section,
              expense_category_uuid,
              service_item_uuid,
              category_kind,
              category_code,
              account_id,
              load_id
            )
            VALUES (
              $1::uuid, $2, $3, $4, $5,
              $6::uuid, $7::uuid, $8, $9, $10::uuid, $11::uuid
            )
          `,
          [
            created.id,
            seq,
            amountDollars,
            line.description ?? null,
            section,
            line.expenseCategoryUuid ?? accountId,
            line.serviceItemUuid ?? null,
            line.categoryKind ?? null,
            line.categoryCode ?? null,
            accountId,
            line.loadId ?? null,
          ]
        );
      }
    }

    // Option B inc 2: link create-time draft attachments (vendor invoice scans) to the real bill id,
    // atomically inside this same transaction so they can't be orphaned.
    await reassignDraftAttachments(client, {
      operatingCompanyId: input.operatingCompanyId,
      entityType: "bill",
      draftId: input.attachmentDraftId,
      newId: created.id,
    });
    await appendCrudAudit(
      client,
      userId,
      "accounting.bill.created",
      {
        resource_type: "accounting.bills",
        resource_id: created.id,
        operating_company_id: input.operatingCompanyId,
        vendor_id: input.vendorId,
        amount_cents: input.amountCents,
        bill_line_count: linesProvided ? input.lines!.length : 0,
      },
      "info",
      "P5-D2-BILL-PAYMENT"
    );
    return created;
  });

  await enqueueSyncJob(
    input.operatingCompanyId,
    "bill",
    bill.id,
    hashPayload({
      bill_id: bill.id,
      vendor_id: input.vendorId,
      amount_cents: input.amountCents,
      bill_date: input.billDate,
    }),
    userId
  );

  await withCurrentUser(userId, async (client) => {
    await enqueueTmsBillPushRequested(client, {
      operating_company_id: input.operatingCompanyId,
      bill_id: bill.id,
      operation: "create",
    });
  });

  // P1-BILL-GL: auto-post the bill's balanced DR expense / CR ap_control JE via the canonical poster,
  // gated per-entity by BILL_GL_POSTING_ENABLED. Idempotent (one posting batch per bill). Flag OFF ->
  // honest unposted status (bill still stands — creating a bill moves no cash). A post failure is
  // surfaced (not swallowed, not silent) and does not roll back the committed bill; it is retriable.
  const glPosting = await postBillGlIfEnabled(input.operatingCompanyId, bill.id, { userId });
  if (!glPosting.posted && glPosting.reason === "post_failed") {
    await withCurrentUser(userId, (client) =>
      appendCrudAudit(
        client,
        userId,
        "accounting.bill.gl_post_failed",
        {
          resource_type: "accounting.bills",
          resource_id: bill.id,
          operating_company_id: input.operatingCompanyId,
          code: glPosting.code,
          message: glPosting.message,
        },
        "warning",
        "P1-BILL-GL"
      )
    );
  }

  return { ...bill, gl_posting: glPosting };
}

export async function payBill(input: PayBillInput, userId: string) {
  if (input.amountCents <= 0) throw new Error("bill_payment_amount_must_be_positive");
  if (input.paymentMethod === "check" && !input.checkNumber?.trim()) {
    throw new Error("check_number_required");
  }

  // P1-BILLPAY-GL: resolve BILL_PAYMENT_GL_POSTING_ENABLED for the entity. When ON, the payment records
  // its balanced DR ap_control / CR bank JE ATOMICALLY in the same transaction as the bank-cache decrement.
  // When OFF (the current prod default for every entity), the payment + bank decrement still happen exactly
  // as before — NO regression to bill-paying — but the GL leg is skipped and surfaced honestly as
  // gl_posting:"blocked_flag_off" (no silent success, matching P1-BILL-GL / no-silent-noop-posting). Flag
  // flips per entity are the owner's, after the entity's ap_control + bank-GL-account prerequisites are met.
  const glPostingEnabled = await isBillPaymentGlPostingEnabled(input.operatingCompanyId, userId);

  const payment = await withCurrentUser(userId, async (client) => {
    await client.query(`SELECT set_config('app.operating_company_id', $1, true)`, [input.operatingCompanyId]);
    const billRes = await client.query<BillRow>(
      `
        SELECT *
        FROM accounting.bills
        WHERE id = $1
          AND operating_company_id = $2
        LIMIT 1
        FOR UPDATE
      `,
      [input.billId, input.operatingCompanyId]
    );
    const billRaw = billRes.rows[0];
    if (!billRaw) throw new Error("bill_not_found");
    const bill = normalizeBill(billRaw);
    if (bill.status === "voided") throw new Error("bill_voided");
    if (bill.status === "paid") throw new Error("bill_already_paid");

    const remaining = Number(bill.amount_cents) - Number(bill.paid_cents);
    if (input.amountCents > remaining) throw new Error("payment_exceeds_remaining_balance");

    const paymentRes = await client.query<BillPaymentRow>(
      `
        INSERT INTO accounting.bill_payments (
          operating_company_id,
          bill_id,
          vendor_id,
          payment_date,
          amount_cents,
          amount,
          payment_method,
          from_bank_account_id,
          check_number,
          reference_number,
          memo,
          status,
          created_by_user_id,
          created_at,
          updated_at
        )
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,'posted',$12,now(),now())
        RETURNING *
      `,
      [
        input.operatingCompanyId,
        input.billId,
        bill.vendor_id,
        input.paymentDate,
        input.amountCents,
        input.amountCents / 100,
        input.paymentMethod,
        input.fromBankAccountId ?? null,
        input.checkNumber ?? null,
        input.referenceNumber ?? null,
        input.memo ?? null,
        userId,
      ]
    );
    if ((paymentRes.rowCount ?? 0) === 0 || !paymentRes.rows[0]) {
      throw new Error("bill_payment_insert_failed");
    }

    const newPaidCents = Number(bill.paid_cents) + input.amountCents;
    const storageStatus = storageStatusForPaid(Number(bill.amount_cents), newPaidCents);
    await client.query(
      `
        UPDATE accounting.bills
        SET paid_cents = $2,
            paid_amount = $3,
            status = $4,
            updated_at = now()
        WHERE id = $1
      `,
      [bill.id, newPaidCents, newPaidCents / 100, storageStatus]
    );

    if (input.fromBankAccountId) {
      await updateBankBalance(client, input.operatingCompanyId, input.fromBankAccountId, -Math.abs(input.amountCents));
    }

    await appendCrudAudit(
      client,
      userId,
      "accounting.bill_payment.created",
      {
        resource_type: "accounting.bill_payments",
        resource_id: paymentRes.rows[0].id,
        operating_company_id: input.operatingCompanyId,
        bill_id: input.billId,
        amount_cents: input.amountCents,
        payment_method: input.paymentMethod,
      },
      "info",
      "P5-D2-BILL-PAYMENT"
    );

    // Parallel books: QBO-origin bills never receive a TMS Bill→GL leg. Attempting BillPayment→GL
    // would throw BILL_AP_NOT_POSTED (or invent a second JE) and — because posting runs in THIS txn —
    // roll back the entire subledger payment. Skip GL for source_system=qbo; keep payment + bank cache.
    const isQboBill = String(bill.source_system ?? "").toLowerCase() === "qbo";

    // When posting is ON for this entity (and the bill is TMS-native), post the balanced DR ap_control /
    // CR bank JE ATOMICALLY in THIS transaction (GUARD 2026-07-11: the bank-balance cache and the GL cash
    // account are SEPARATE stores — recording −amount in both is correct double-entry + cache coherence,
    // not double-counting). Running it on the same client means a posting failure rolls back the payment
    // insert + bill update + bank decrement together — bank and GL can never diverge. Idempotent (one
    // batch per bill_payment). When OFF, the payment + bank decrement above stand as-is (no regression)
    // and no JE is written.
    // Outer `if (glPostingEnabled)` is required by verify-bill-payment-posts-gl (flag-OFF must still pay).
    if (glPostingEnabled) {
      if (!isQboBill) {
        await postSourceTransactionInClientTx(
          client,
          {
            operating_company_id: input.operatingCompanyId,
            source_transaction_type: "bill_payment",
            source_transaction_id: paymentRes.rows[0].id,
          },
          { userId }
        );
      }
    }

    return {
      ...paymentRes.rows[0],
      amount_cents: Number(paymentRes.rows[0].amount_cents ?? Math.round(Number(paymentRes.rows[0].amount ?? 0) * 100)),
      gl_posting: isQboBill
        ? ({ posted: false, reason: "qbo_parallel_books" } as const)
        : glPostingEnabled
          ? ({ posted: true } as const)
          : ({ posted: false, reason: "blocked_flag_off" } as const),
    };
  });

  await enqueueSyncJob(
    input.operatingCompanyId,
    "bill_payment",
    payment.id,
    hashPayload({
      bill_payment_id: payment.id,
      bill_id: input.billId,
      amount_cents: input.amountCents,
      payment_date: input.paymentDate,
      payment_method: input.paymentMethod,
    }),
    userId
  );

  await withCurrentUser(userId, async (client) => {
    await enqueueTmsBillPushRequested(client, {
      operating_company_id: input.operatingCompanyId,
      bill_id: input.billId,
      operation: "update",
    });
  });

  return payment;
}

// VOID-EVERYWHERE PR-2 — wire the shared void engine into bills (same mechanic as invoices/JEs).
// When the flag is ON: VOID = Owner + Accountant, a reason is required, and an equal-and-opposite
// reversing JE is posted on the SAME transaction (atomic with the status flip). When OFF (default):
// behaviour is unchanged — Owner-only, status flip + audit, no reversing entry.
export type VoidBillOptions = {
  /** Caller's role (route-initiated voids). Enforced unless `system` is true. */
  role?: string | null;
  /** Trusted internal rollback (e.g. insurance schedule). Bypasses the role gate; the flag still drives reversal. */
  system?: boolean;
};

export async function voidBill(
  operatingCompanyId: string,
  billId: string,
  reason: string,
  userId: string,
  opts: VoidBillOptions = {}
) {
  const result = await withCurrentUser(userId, async (client) => {
    await client.query(`SELECT set_config('app.operating_company_id', $1, true)`, [operatingCompanyId]);

    const flagOn = await isVoidEnforcementEnabled(client, operatingCompanyId, userId);
    if (!opts.system) {
      if (flagOn) {
        if (!canVoid(opts.role)) throw new Error("forbidden_void_owner_or_accountant_only");
        if (!reason || !reason.trim()) throw new Error("void_reason_required");
      } else if (String(opts.role ?? "") !== "Owner") {
        throw new Error("forbidden_owner_only");
      }
    }

    // LV-BILLVOID-DATE-ERROR-STILL-LIVE — bill_date is a DATE column, so a bare SELECT * hands
    // node-postgres a JS Date rather than a string, and String(date).slice(0, 10) yields "Thu Aug 06"
    // out of "Thu Aug 06 2026 00:00:00 GMT-0500 (Central Daylight Time)". That reaches SQL as a date
    // literal and 500s the void. The governance executor never had this bug because it selects
    // bill_date::text explicitly (void-cancel-executors.ts:196). Same cast here, under an alias so it
    // cannot be confused with the raw column that normalizeBill still reads.
    const billRes = await client.query<BillRow>(
      `
        SELECT *,
               bill_date::text AS bill_date_iso
        FROM accounting.bills
        WHERE id = $1
          AND operating_company_id = $2
        LIMIT 1
        FOR UPDATE
      `,
      [billId, operatingCompanyId]
    );
    const billRaw = billRes.rows[0];
    if (!billRaw) throw new Error("bill_not_found");
    const bill = normalizeBill(billRaw);
    if (bill.status === "voided") throw new Error("bill_already_void");

    const paymentsRes = await client.query<{ count: number }>(
      `
        SELECT COUNT(*)::int AS count
        FROM accounting.bill_payments
        WHERE bill_id = $1
          AND operating_company_id = $2
          AND revoked_at IS NULL
      `,
      [billId, operatingCompanyId]
    );
    if (Number(paymentsRes.rows[0]?.count ?? 0) > 0) throw new Error("bill_has_payments_cannot_void");

    // Post the reversing JE BEFORE the status flip so both land atomically on this client.
    let reversal: VoidReversalResult = {
      reversal_journal_entry_id: null,
      reversal_date: null,
      closed_period_reversal: false,
      reversed_line_count: 0,
    };
    if (flagOn) {
      // Read the ::text alias, never String(bill_date): the raw column is a JS Date here.
      const originalDate = String(
        (billRaw as unknown as { bill_date_iso?: string | null }).bill_date_iso ?? ""
      ).slice(0, 10);
      if (!/^\d{4}-\d{2}-\d{2}$/.test(originalDate)) {
        // Refuse rather than hand postVoidReversal a malformed date. Substituting today's date would
        // move a reversing entry into a different accounting period from the entry it reverses.
        throw new Error(`bill_void_bill_date_unreadable: ${billId}`);
      }
      reversal = await postVoidReversal(
        client,
        {
          operatingCompanyId,
          entityType: "bill",
          entityId: billId,
          originalDate,
          memo: `Void reversal of bill ${billId}: ${reason}`,
        },
        { userId }
      );
    }

    await client.query(
      `
        UPDATE accounting.bills
        SET status = 'void',
            revoked_at = now(),
            revoked_by_user_id = $3,
            revoked_reason = $4,
            updated_at = now()
        WHERE id = $1
          AND operating_company_id = $2
      `,
      [billId, operatingCompanyId, userId, reason]
    );

    if (flagOn) {
      await auditVoid(client, userId, "bill", {
        operatingCompanyId,
        entityId: billId,
        reason,
        reversal,
      });
    } else {
      await appendCrudAudit(
        client,
        userId,
        "accounting.bill.voided",
        {
          resource_type: "accounting.bills",
          resource_id: bill.id,
          operating_company_id: operatingCompanyId,
          reason,
        },
        "warning",
        "P5-D2-BILL-PAYMENT"
      );
    }
    return { ok: true };
  });
  await withCurrentUser(userId, async (client) => {
    await enqueueTmsBillPushRequested(client, {
      operating_company_id: operatingCompanyId,
      bill_id: billId,
      operation: "update",
    });
  });
  return result;
}

export async function voidBillPaymentInClientTx(
  client: BillMutationClient,
  input: {
    operatingCompanyId: string;
    paymentId: string;
    reason: string;
    userId: string;
    reversePostedGl: boolean;
    currentBusinessDate: string;
  }
) {
    const paymentRes = await client.query<BillPaymentRow>(
      `
        SELECT *
        FROM accounting.bill_payments
        WHERE id = $1
          AND operating_company_id = $2
        LIMIT 1
        FOR UPDATE
      `,
      [input.paymentId, input.operatingCompanyId]
    );
    const payment = paymentRes.rows[0];
    if (!payment) throw new Error("bill_payment_not_found");
    if (payment.revoked_at || String(payment.status) === "void") throw new Error("bill_payment_already_voided");

    const billRes = await client.query<BillRow>(
      `
        SELECT *
        FROM accounting.bills
        WHERE id = $1
          AND operating_company_id = $2
        LIMIT 1
        FOR UPDATE
      `,
      [payment.bill_id, input.operatingCompanyId]
    );
    const billRaw = billRes.rows[0];
    if (!billRaw) throw new Error("bill_not_found");
    const bill = normalizeBill(billRaw);

    const paymentAmountCents = Number(payment.amount_cents ?? Math.round(Number(payment.amount ?? 0) * 100));
    const newPaidCents = Math.max(0, Number(bill.paid_cents) - paymentAmountCents);
    const storageStatus = storageStatusForPaid(Number(bill.amount_cents), newPaidCents);

    const reversal = input.reversePostedGl
      ? await reversePostedSourceTransactionInClientTx(
          client,
          {
            operating_company_id: input.operatingCompanyId,
            source_transaction_type: "bill_payment",
            source_transaction_id: input.paymentId,
          },
          { userId: input.userId },
          input.currentBusinessDate
        )
      : null;

    await client.query(
      `
        UPDATE accounting.bill_payments
        SET status = 'void',
            revoked_at = now(),
            revoked_by_user_id = $3,
            revoked_reason = $4,
            updated_at = now()
        WHERE id = $1
          AND operating_company_id = $2
      `,
      [input.paymentId, input.operatingCompanyId, input.userId, input.reason]
    );

    await client.query(
      `
        UPDATE accounting.bills
        SET paid_cents = $2,
            paid_amount = $3,
            status = $4,
            updated_at = now()
        WHERE id = $1
      `,
      [payment.bill_id, newPaidCents, newPaidCents / 100, storageStatus]
    );

    if (payment.from_bank_account_id) {
      await updateBankBalance(client, input.operatingCompanyId, payment.from_bank_account_id, Math.abs(paymentAmountCents));
    }

    await appendCrudAudit(
      client,
      input.userId,
      "accounting.bill_payment.voided",
      {
        resource_type: "accounting.bill_payments",
        resource_id: input.paymentId,
        operating_company_id: input.operatingCompanyId,
        bill_id: payment.bill_id,
        reason: input.reason,
        reversal_journal_entry_id: reversal?.journal_entry_id ?? null,
      },
      "warning",
      "P5-D2-BILL-PAYMENT"
    );
    return {
      ok: true,
      bill_id: payment.bill_id,
      reversal_journal_entry_id: reversal?.journal_entry_id ?? null,
    };
}

export async function voidBillInClientTx(
  client: BillMutationClient,
  input: {
    operatingCompanyId: string;
    billId: string;
    reason: string;
    userId: string;
    currentBusinessDate: string;
  }
) {
  const billRes = await client.query<BillRow>(
    `SELECT *
       FROM accounting.bills
      WHERE id = $1::uuid AND operating_company_id = $2::uuid
      LIMIT 1 FOR UPDATE`,
    [input.billId, input.operatingCompanyId]
  );
  const billRaw = billRes.rows[0];
  if (!billRaw) throw new Error("bill_not_found");
  const bill = normalizeBill(billRaw);
  if (bill.status === "voided") throw new Error("bill_already_void");

  const paymentsRes = await client.query<{ count: number }>(
    `SELECT COUNT(*)::int AS count
       FROM accounting.bill_payments
      WHERE bill_id = $1::uuid
        AND operating_company_id = $2::uuid
        AND revoked_at IS NULL`,
    [input.billId, input.operatingCompanyId]
  );
  if (Number(paymentsRes.rows[0]?.count ?? 0) !== 0) throw new Error("bill_has_payments_cannot_void");

  const reversal = await reversePostedSourceTransactionInClientTx(
    client,
    {
      operating_company_id: input.operatingCompanyId,
      source_transaction_type: "bill",
      source_transaction_id: input.billId,
    },
    { userId: input.userId },
    input.currentBusinessDate
  );

  const updated = await client.query<{ id: string }>(
    `UPDATE accounting.bills
        SET paid_cents = 0, paid_amount = 0, status = 'void',
            revoked_at = now(), revoked_by_user_id = $3::uuid,
            revoked_reason = $4, updated_at = now()
      WHERE id = $1::uuid AND operating_company_id = $2::uuid AND revoked_at IS NULL
      RETURNING id::text`,
    [input.billId, input.operatingCompanyId, input.userId, input.reason]
  );
  if (!updated.rows[0]?.id) throw new Error("bill_void_state_transition_failed");

  await appendCrudAudit(
    client,
    input.userId,
    "accounting.bill.voided",
    {
      resource_type: "accounting.bills",
      resource_id: input.billId,
      operating_company_id: input.operatingCompanyId,
      reason: input.reason,
      reversal_journal_entry_id: reversal.journal_entry_id,
    },
    "warning",
    "SETTLEMENT-BILL-PAYMENT"
  );
  return { ok: true, reversal_journal_entry_id: reversal.journal_entry_id };
}

export async function voidBillPayment(operatingCompanyId: string, paymentId: string, reason: string, userId: string) {
  const currentBusinessDate = companyBusinessDate();
  const voided = await withCurrentUser(userId, async (client) => {
    await client.query(`SELECT set_config('app.operating_company_id', $1, true)`, [operatingCompanyId]);
    return voidBillPaymentInClientTx(client, {
      operatingCompanyId,
      paymentId,
      reason,
      userId,
      reversePostedGl: false,
      currentBusinessDate,
    });
  });

  return voided;
}

/**
 * Reverse drill-through for Legal Matter → cost (Stage 3 scenario 1, §10.3).
 *
 * `legal.matters` carries only CLAIM amounts — what is being fought over — so before this the system
 * could not answer "what has this case cost us". The law firm's bill posted correctly all along
 * (DR Legal & Professional Fees / CR A/P, via the existing bill poster — no new GL math), but nothing
 * tied that cost back to the matter. For a company in Chapter 11 with live litigation, legal spend per
 * matter is the first number an attorney, a trustee or a court asks for.
 *
 * Column-gated like listClaimLinkedFinancials: on a database where the migration has not been applied
 * yet this returns an empty list and says so via columns_present, rather than 500-ing. A drill-through
 * that errors before deploy teaches everyone to distrust it.
 */
export async function listLegalMatterLinkedCosts(
  userId: string,
  operatingCompanyId: string,
  legalMatterId: string
): Promise<{
  bills: Array<{ id: string; bill_number: string | null; bill_date: string | null; amount_cents: number; status: string | null; memo: string | null }>;
  total_cost_cents: number;
  columns_present: { bills: boolean };
}> {
  return withCurrentUser(userId, async (client) => {
    await client.query(`SELECT set_config('app.operating_company_id', $1, true)`, [operatingCompanyId]);
    const colRes = await client.query(
      `SELECT 1 FROM information_schema.columns
        WHERE table_schema='accounting' AND table_name='bills' AND column_name='legal_matter_id'`
    );
    const hasCol = (colRes.rowCount ?? 0) > 0;
    if (!hasCol) return { bills: [], total_cost_cents: 0, columns_present: { bills: false } };

    const res = await client.query(
      `SELECT b.id::text AS id, b.bill_number, b.bill_date::text AS bill_date,
              COALESCE(b.amount_cents, 0)::bigint AS amount_cents, b.status, b.memo
         FROM accounting.bills b
        WHERE b.operating_company_id = $1
          AND b.legal_matter_id = $2
          AND b.revoked_at IS NULL
        ORDER BY b.bill_date DESC NULLS LAST, b.created_at DESC`,
      [operatingCompanyId, legalMatterId]
    );
    const bills = res.rows.map((r: Record<string, unknown>) => ({
      id: String(r.id),
      bill_number: (r.bill_number as string) ?? null,
      bill_date: (r.bill_date as string) ?? null,
      amount_cents: Number(r.amount_cents ?? 0),
      status: (r.status as string) ?? null,
      memo: (r.memo as string) ?? null,
    }));
    // Voided bills are excluded above (revoked_at IS NULL), so the total is what the matter has
    // actually cost — not what was ever entered against it.
    const total = bills.reduce((sum, b) => sum + b.amount_cents, 0);
    return { bills, total_cost_cents: total, columns_present: { bills: true } };
  });
}
