import type { PoolClient } from "pg";
import { insertQboSyncConflictRow } from "./qbo-sync-conflict.util.js";

function centsFromQboMoney(amount: unknown): number | null {
  const n = Number(amount);
  if (!Number.isFinite(n)) return null;
  return Math.round(n * 100);
}

function parsePgTs(raw: string | null): number {
  if (!raw) return 0;
  const d = new Date(raw);
  return Number.isFinite(d.getTime()) ? d.getTime() : 0;
}

async function loadInvoiceTms(
  client: PoolClient,
  oc: string,
  qboId: string
): Promise<Record<string, unknown> | null> {
  const res = await client.query(
    `
      SELECT
        i.id::text,
        i.total_cents::text,
        i.amount_paid_cents::text,
        i.status::text,
        i.issue_date::text,
        i.due_date::text,
        i.updated_at::text,
        i.last_qbo_synced_at::text,
        i.qbo_sync_pending,
        (SELECT COUNT(*)::text FROM accounting.invoice_lines il WHERE il.invoice_id = i.id) AS line_count
      FROM accounting.invoices i
      WHERE i.operating_company_id = $1::uuid AND i.qbo_invoice_id = $2
      LIMIT 1
    `,
    [oc, qboId]
  );
  return (res.rows[0] as Record<string, unknown>) ?? null;
}

async function loadBillTms(client: PoolClient, oc: string, qboId: string): Promise<Record<string, unknown> | null> {
  const res = await client.query(
    `
      SELECT
        b.id::text,
        b.amount_cents::text,
        b.status::text,
        b.bill_date::text,
        b.due_date::text,
        b.updated_at::text,
        b.last_qbo_synced_at::text,
        (SELECT COUNT(*)::text FROM accounting.bill_lines bl WHERE bl.bill_id = b.id) AS line_count
      FROM accounting.bills b
      WHERE b.operating_company_id = $1::uuid AND b.qbo_bill_id = $2
      LIMIT 1
    `,
    [oc, qboId]
  );
  return (res.rows[0] as Record<string, unknown>) ?? null;
}

function compareInvoice(qbo: Record<string, unknown>, tms: Record<string, unknown>, fields: string[]) {
  const qboTotal = centsFromQboMoney(qbo.TotalAmt);
  const tmsTotal = Number(tms.total_cents ?? 0);
  if (qboTotal != null && qboTotal !== tmsTotal) fields.push("total_cents");

  const qboLines = Array.isArray(qbo.Line)
    ? (qbo.Line as Record<string, unknown>[]).filter((l) => String(l?.DetailType ?? "") === "SalesItemLineDetail").length
    : 0;
  const tmsLines = Number(tms.line_count ?? 0);
  if (qboLines !== tmsLines) fields.push("lines");

  const qboDate = typeof qbo.TxnDate === "string" ? qbo.TxnDate : null;
  const tmsIssue = typeof tms.issue_date === "string" ? tms.issue_date.slice(0, 10) : null;
  if (qboDate && tmsIssue && qboDate !== tmsIssue) fields.push("dates");

  const qboBal = centsFromQboMoney(qbo.Balance);
  const paid = Number(tms.amount_paid_cents ?? 0);
  const open = tmsTotal - paid;
  if (qboBal != null && qboBal !== open) fields.push("balance_open");

  const qboBalNum = centsFromQboMoney(qbo.Balance);
  const tmsStatus = String(tms.status ?? "").toLowerCase();
  if (qboBalNum === 0 && !["paid", "void", "voided"].includes(tmsStatus)) fields.push("status");
  if (qboBalNum != null && qboBalNum > 0 && tmsStatus === "paid") fields.push("status");
}

function compareBill(qbo: Record<string, unknown>, tms: Record<string, unknown>, fields: string[]) {
  const qboTotal = centsFromQboMoney(qbo.TotalAmt ?? qbo.Balance);
  const tmsTotal = Number(tms.amount_cents ?? 0);
  if (qboTotal != null && qboTotal !== tmsTotal) fields.push("amount_cents");

  const qboLines = Array.isArray(qbo.Line) ? (qbo.Line as unknown[]).filter(Boolean).length : 0;
  const tmsLines = Number(tms.line_count ?? 0);
  if (qboLines > 0 && qboLines !== tmsLines) fields.push("lines");

  const qboDate = typeof qbo.TxnDate === "string" ? qbo.TxnDate : null;
  const billDate = typeof tms.bill_date === "string" ? tms.bill_date.slice(0, 10) : null;
  if (qboDate && billDate && qboDate !== billDate) fields.push("dates");
}

/** Returns true when inbound snapshot-only processing must stop with conflict ledger outcome. */
export async function evaluateInboundVersusTms(params: {
  client: PoolClient;
  operating_company_id: string;
  qbo_entity_type: string;
  qbo_entity_id: string;
  entity_payload: Record<string, unknown>;
}): Promise<boolean> {
  const pascal = params.qbo_entity_type;
  const qboId = params.qbo_entity_id;

  if (pascal === "Invoice") {
    const row = await loadInvoiceTms(params.client, params.operating_company_id, qboId);
    if (!row) return false;
    if (Boolean(row.qbo_sync_pending)) {
      await insertQboSyncConflictRow(params.client, {
        operating_company_id: params.operating_company_id,
        entity_type: "invoice",
        entity_id: String(row.id),
        qbo_id: qboId,
        tms_snapshot: row,
        qbo_snapshot: params.entity_payload,
        conflict_fields: ["qbo_sync_pending"],
        severity: "high",
      });
      return true;
    }
    const fields: string[] = [];
    compareInvoice(params.entity_payload, row, fields);
    const updatedMs = parsePgTs(String(row.updated_at ?? ""));
    const syncedMs = parsePgTs(String(row.last_qbo_synced_at ?? ""));
    if (fields.length && updatedMs > syncedMs) {
      await insertQboSyncConflictRow(params.client, {
        operating_company_id: params.operating_company_id,
        entity_type: "invoice",
        entity_id: String(row.id),
        qbo_id: qboId,
        tms_snapshot: row,
        qbo_snapshot: params.entity_payload,
        conflict_fields: fields,
        severity: "medium",
      });
      return true;
    }
    return false;
  }

  if (pascal === "Bill") {
    const row = await loadBillTms(params.client, params.operating_company_id, qboId);
    if (!row) return false;
    const fields: string[] = [];
    compareBill(params.entity_payload, row, fields);
    const updatedMs = parsePgTs(String(row.updated_at ?? ""));
    const syncedMs = parsePgTs(String(row.last_qbo_synced_at ?? ""));
    if (fields.length && updatedMs > syncedMs) {
      await insertQboSyncConflictRow(params.client, {
        operating_company_id: params.operating_company_id,
        entity_type: "bill",
        entity_id: String(row.id),
        qbo_id: qboId,
        tms_snapshot: row,
        qbo_snapshot: params.entity_payload,
        conflict_fields: fields,
        severity: "medium",
      });
      return true;
    }
    return false;
  }

  // Other entity deep comparisons can follow the same pattern (payment, JE, …).
  return false;
}
