// AF-4 — QBO A/P import: PREVIEW layer only (see docs/accounting/AF-4-AF-2-AF-7-DESIGN.md).
//
// SCOPE: this file builds the reviewable bill list Jorge reviews before any A/P is actually migrated
// into TMS. It reads QBO open bills (via the existing, already-approved apps/backend/src/integrations/
// qbo/qbo-client.ts — the same client the master-data sync already uses) and mdata.vendors, and writes
// ONLY to the new accounting.ap_import_batches / accounting.ap_import_preview_lines audit tables
// (migration 202607110310). It NEVER writes to accounting.bills or mdata.vendors.
//
// The actual money-moving step — inserting approved lines into accounting.bills (and, where a vendor is
// unmatched, creating the mdata.vendors row) — is INTENTIONALLY NOT IMPLEMENTED here. Per the standing
// rule ("never build finance/posting logic solo — design docs are fine"), that write path is designed in
// the design doc (§4) but left for a dedicated follow-up PR that Jorge reviews line-by-line (full SQL +
// diff) before it ships, even behind the AP_IMPORT_ENABLED flag. executeApImportBatch() below is a
// clearly-labeled stub that always throws, so flipping the flag can never trigger an unbuilt write.
//
// SEQUENCING GATE (per AF-4 block doc): a bill can only be marked "matched" if its vendor is ALREADY
// present in mdata.vendors with a qbo_vendor_id link — i.e. AF-2 (drift reconciliation) has already run
// for that vendor. This module never creates vendors; an unmatched vendor is a blocking exception for
// Jorge to resolve (reconcile the vendor first), not something auto-created.
import type { PoolClient } from "pg";
import { withLuciaBypass } from "../../auth/db.js";
import { isEnabled } from "../../lib/feature-flags/service.js";
import { qboCompanyContext, qboPaginateEntity, type QboApiContext } from "../../integrations/qbo/qbo-client.js";

export type QboOpenBill = {
  Id: string;
  DocNumber?: string;
  TxnDate?: string;
  DueDate?: string;
  Balance?: number;
  VendorRef?: { value?: string; name?: string };
};

export type AgingBucket = "current" | "1-30" | "31-60" | "61-90" | "91+";

export function agingBucketFor(dueDate: string | null, asOf: Date = new Date()): AgingBucket {
  if (!dueDate) return "current";
  const due = new Date(dueDate);
  if (!Number.isFinite(due.getTime())) return "current";
  const daysPastDue = Math.floor((asOf.getTime() - due.getTime()) / 86_400_000);
  if (daysPastDue <= 0) return "current";
  if (daysPastDue <= 30) return "1-30";
  if (daysPastDue <= 60) return "31-60";
  if (daysPastDue <= 90) return "61-90";
  return "91+";
}

export function centsFromQboAmount(amount: number | undefined): number {
  if (typeof amount !== "number" || !Number.isFinite(amount)) return 0;
  return Math.round(amount * 100);
}

async function createBatch(client: PoolClient, opco: string, requestedBy: string | null, qboAsOf: string): Promise<string> {
  const res = await client.query<{ id: string }>(
    `INSERT INTO accounting.ap_import_batches (operating_company_id, requested_by_user_id, qbo_as_of, status)
     VALUES ($1::uuid, $2::uuid, $3::timestamptz, 'previewed') RETURNING id`,
    [opco, requestedBy, qboAsOf]
  );
  return res.rows[0].id;
}

async function insertPreviewLine(
  client: PoolClient,
  opco: string,
  batchId: string,
  bill: QboOpenBill,
  matchedVendorId: string | null,
  alreadyImported: boolean
): Promise<void> {
  const vendorMatchStatus = matchedVendorId ? "matched" : "unmatched";
  const blockingReason = alreadyImported
    ? "already imported — accounting.bills already has this qbo_bill_id"
    : !matchedVendorId
      ? "vendor not reconciled in mdata.vendors (AF-2 sequencing gate) — reconcile the vendor before this bill can import"
      : null;
  await client.query(
    `INSERT INTO accounting.ap_import_preview_lines
       (batch_id, operating_company_id, qbo_vendor_id, qbo_bill_id, vendor_name_qbo, bill_number,
        bill_date, due_date, amount_cents, aging_bucket, vendor_match_status, matched_vendor_id, blocking_reason)
     VALUES ($1::uuid,$2::uuid,$3,$4,$5,$6,$7::date,$8::date,$9,$10,$11,$12::uuid,$13)
     ON CONFLICT (batch_id, qbo_bill_id) DO NOTHING`,
    [
      batchId,
      opco,
      bill.VendorRef?.value ?? "",
      bill.Id,
      bill.VendorRef?.name ?? "(unknown vendor)",
      bill.DocNumber ?? null,
      bill.TxnDate ?? null,
      bill.DueDate ?? null,
      centsFromQboAmount(bill.Balance),
      agingBucketFor(bill.DueDate ?? null),
      vendorMatchStatus,
      matchedVendorId,
      blockingReason,
    ]
  );
}

async function finalizeBatchTotals(client: PoolClient, batchId: string): Promise<{
  totalVendors: number; totalBills: number; totalAmountCents: number; blockedBills: number;
}> {
  const res = await client.query<{
    total_vendors: string; total_bills: string; total_amount_cents: string; blocked_bills: string;
  }>(
    `
      SELECT
        COUNT(DISTINCT qbo_vendor_id)::text AS total_vendors,
        COUNT(*)::text AS total_bills,
        COALESCE(SUM(amount_cents), 0)::text AS total_amount_cents,
        COUNT(*) FILTER (WHERE blocking_reason IS NOT NULL)::text AS blocked_bills
      FROM accounting.ap_import_preview_lines
      WHERE batch_id = $1::uuid
    `,
    [batchId]
  );
  const row = res.rows[0];
  const totals = {
    totalVendors: Number(row?.total_vendors ?? 0),
    totalBills: Number(row?.total_bills ?? 0),
    totalAmountCents: Number(row?.total_amount_cents ?? 0),
    blockedBills: Number(row?.blocked_bills ?? 0),
  };
  await client.query(
    `UPDATE accounting.ap_import_batches
       SET total_vendors = $2, total_bills = $3, total_amount_cents = $4, blocked_bills = $5, updated_at = now()
     WHERE id = $1::uuid`,
    [batchId, totals.totalVendors, totals.totalBills, totals.totalAmountCents, totals.blockedBills]
  );
  return totals;
}

export type ApImportPreviewResult = {
  batchId: string;
  totalVendors: number;
  totalBills: number;
  totalAmountCents: number;
  blockedBills: number;
};

/**
 * Pulls QBO's CURRENT open bills (live — never hardcoded) for one entity and stages them as a reviewable
 * preview batch. Read-only against QBO + mdata.vendors + accounting.bills; writes ONLY to
 * accounting.ap_import_batches / ap_import_preview_lines. Independent of AP_IMPORT_ENABLED — previewing
 * is always safe (no money moves); the flag only gates the not-yet-built execute step.
 */
export async function runApImportPreview(
  operatingCompanyId: string,
  requestedByUserId: string | null,
  qboContextOverride?: QboApiContext
): Promise<ApImportPreviewResult> {
  const qboAsOf = new Date().toISOString();
  const ctx = qboContextOverride ?? (await qboCompanyContext(operatingCompanyId));

  return withLuciaBypass(async (client) => {
    const batchId = await createBatch(client, operatingCompanyId, requestedByUserId, qboAsOf);

    for await (const page of qboPaginateEntity<QboOpenBill>(ctx, "Bill", "Balance > '0'")) {
      for (const bill of page) {
        const vendorQboId = bill.VendorRef?.value ?? null;
        let matchedVendorId: string | null = null;
        if (vendorQboId) {
          const match = await client.query<{ id: string }>(
            `SELECT id::text FROM mdata.vendors
             WHERE operating_company_id = $1::uuid AND qbo_vendor_id = $2 AND deactivated_at IS NULL`,
            [operatingCompanyId, vendorQboId]
          );
          matchedVendorId = match.rows[0]?.id ?? null;
        }
        const dup = await client.query<{ id: string }>(
          `SELECT id::text FROM accounting.bills
           WHERE operating_company_id = $1::uuid AND qbo_bill_id = $2`,
          [operatingCompanyId, bill.Id]
        );
        await insertPreviewLine(client, operatingCompanyId, batchId, bill, matchedVendorId, dup.rows.length > 0);
      }
    }

    const totals = await finalizeBatchTotals(client, batchId);
    return { batchId, ...totals };
  });
}

/** The reviewable bill list itself — grouped by vendor, largest first. Read-only. */
export type ReviewableBillListLine = {
  vendorNameQbo: string;
  qboVendorId: string;
  vendorMatchStatus: "matched" | "unmatched" | "ambiguous";
  billNumber: string | null;
  billDate: string | null;
  dueDate: string | null;
  amountCents: number;
  agingBucket: AgingBucket | null;
  blockingReason: string | null;
};

export async function fetchReviewableBillList(batchId: string, operatingCompanyId: string): Promise<ReviewableBillListLine[]> {
  return withLuciaBypass(async (client) => {
    const res = await client.query<{
      vendor_name_qbo: string; qbo_vendor_id: string; vendor_match_status: "matched" | "unmatched" | "ambiguous";
      bill_number: string | null; bill_date: string | null; due_date: string | null;
      amount_cents: string; aging_bucket: AgingBucket | null; blocking_reason: string | null;
    }>(
      `
        SELECT vendor_name_qbo, qbo_vendor_id, vendor_match_status, bill_number, bill_date::text,
               due_date::text, amount_cents::text, aging_bucket, blocking_reason
        FROM accounting.ap_import_preview_lines
        WHERE batch_id = $1::uuid AND operating_company_id = $2::uuid
        ORDER BY vendor_name_qbo ASC, amount_cents DESC
      `,
      [batchId, operatingCompanyId]
    );
    return res.rows.map((r) => ({
      vendorNameQbo: r.vendor_name_qbo,
      qboVendorId: r.qbo_vendor_id,
      vendorMatchStatus: r.vendor_match_status,
      billNumber: r.bill_number,
      billDate: r.bill_date,
      dueDate: r.due_date,
      amountCents: Number(r.amount_cents),
      agingBucket: r.aging_bucket,
      blockingReason: r.blocking_reason,
    }));
  });
}

export class ApImportNotImplementedError extends Error {
  constructor() {
    super(
      "AF-4 execute step is NOT IMPLEMENTED. Writing approved A/P import lines into accounting.bills " +
      "(and, for unmatched vendors, mdata.vendors) is financial-cluster posting logic and is never built " +
      "solo — see docs/accounting/AF-4-AF-2-AF-7-DESIGN.md §4 for the full designed write path (column " +
      "list, idempotency key, GL-posting stance). A dedicated follow-up PR implements it with full SQL " +
      "shown to Jorge before merge, independent of this flag."
    );
    this.name = "ApImportNotImplementedError";
  }
}

/**
 * Stub for the (unbuilt) execute step. Always throws — see ApImportNotImplementedError. Still checks the
 * flag first so the failure mode is identical whether AP_IMPORT_ENABLED is on or off: there is no code
 * path in this repo, today, that writes an imported bill into accounting.bills.
 */
export async function executeApImportBatch(operatingCompanyId: string, _batchId: string): Promise<never> {
  await withLuciaBypass((client) => isEnabled(client, "AP_IMPORT_ENABLED", { operating_company_id: operatingCompanyId }));
  throw new ApImportNotImplementedError();
}
