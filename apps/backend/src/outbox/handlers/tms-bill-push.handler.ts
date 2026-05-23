import { buildQboBillPayload } from "../../integrations/qbo/translators/bill.js";
import { deliverQboBillPush } from "../../qbo/push.service.js";
import type { QboBillPushPayload } from "../../qbo/push.service.js";
import type { OutboxEventHandler, OutboxHandlerContext, OutboxPayload } from "./registry.js";

function requireUuid(value: unknown, field: string): string {
  const trimmed = String(value ?? "").trim();
  if (!/^[0-9a-fA-F-]{36}$/.test(trimmed)) throw new Error(`${field}_invalid_uuid`);
  return trimmed;
}

function requireOperation(value: unknown): "create" | "update" {
  const operation = String(value ?? "").trim();
  if (operation !== "create" && operation !== "update") throw new Error("operation_invalid");
  return operation;
}

type BillHeaderRow = {
  bill_id: string;
  bill_number: string | null;
  bill_date: string;
  due_date: string | null;
  amount_cents: number | null;
  memo: string | null;
  vendor_key: string | null;
  qbo_vendor_id: string | null;
  coa_account_id: string | null;
  qbo_bill_id: string | null;
  qbo_sync_token: string | null;
};

type BillLineRow = {
  line_id: string;
  line_sequence: number;
  amount: string;
  description: string | null;
  account_id: string | null;
};

async function resolveAccountQboId(ctx: OutboxHandlerContext, operatingCompanyId: string, accountId: string | null, errorCode: string) {
  if (!accountId) throw new Error(errorCode);
  const accountRes = await ctx.client.query<{ qbo_account_id: string | null }>(
    `
      SELECT a.qbo_account_id
      FROM catalogs.accounts a
      WHERE a.id = $2::uuid
        AND a.operating_company_id = $1::uuid
      LIMIT 1
    `,
    [operatingCompanyId, accountId],
  );
  const qboAccountId = accountRes.rows[0]?.qbo_account_id ? String(accountRes.rows[0].qbo_account_id).trim() : "";
  if (!qboAccountId) throw new Error(errorCode);
  return qboAccountId;
}

async function resolveApAccountQboId(ctx: OutboxHandlerContext, operatingCompanyId: string, fallbackAccountId: string | null) {
  if (fallbackAccountId) {
    try {
      return await resolveAccountQboId(ctx, operatingCompanyId, fallbackAccountId, "bill_ap_account_qbo_id_missing");
    } catch {
      // Fall through to AP snapshot fallback when a bill account exists but is not a usable AP QBO account.
    }
  }
  const apRes = await ctx.client.query<{ qbo_entity_id: string | null }>(
    `
      SELECT qbo_entity_id
      FROM qbo_archive.entities_snapshot
      WHERE operating_company_id = $1::uuid
        AND qbo_entity_type = 'Account'
        AND COALESCE(raw_snapshot->>'AccountType', '') IN ('Accounts Payable', 'Credit Card')
      ORDER BY snapshot_taken_at DESC NULLS LAST
      LIMIT 1
    `,
    [operatingCompanyId],
  );
  const apQboId = apRes.rows[0]?.qbo_entity_id ? String(apRes.rows[0].qbo_entity_id).trim() : "";
  if (!apQboId) throw new Error("bill_ap_account_qbo_id_missing");
  return apQboId;
}

async function upsertBillMirror(
  ctx: OutboxHandlerContext,
  args: {
    operating_company_id: string;
    bill_id: string;
    qbo_id: string;
    qbo_sync_token: string | null;
    payload_json: Record<string, unknown>;
    doc_number: string | null;
    txn_date: string;
    due_date: string | null;
    total_cents: number;
  },
) {
  await ctx.client.query(
    `
      INSERT INTO mdata.qbo_bills (
        operating_company_id,
        bill_id,
        qbo_id,
        qbo_sync_token,
        doc_number,
        txn_date,
        due_date,
        total_cents,
        sync_status,
        last_synced_at,
        last_push_at,
        created_in_tms,
        payload_json
      )
      VALUES (
        $1::uuid, $2::uuid, $3, $4, $5, $6::date, $7::date, $8::bigint,
        'synced', now(), now(), true, $9::jsonb
      )
      ON CONFLICT (operating_company_id, bill_id)
      DO UPDATE SET
        qbo_id = EXCLUDED.qbo_id,
        qbo_sync_token = EXCLUDED.qbo_sync_token,
        doc_number = EXCLUDED.doc_number,
        txn_date = EXCLUDED.txn_date,
        due_date = EXCLUDED.due_date,
        total_cents = EXCLUDED.total_cents,
        sync_status = 'synced',
        last_synced_at = now(),
        last_push_at = now(),
        created_in_tms = true,
        payload_json = EXCLUDED.payload_json
    `,
    [
      args.operating_company_id,
      args.bill_id,
      args.qbo_id,
      args.qbo_sync_token,
      args.doc_number,
      args.txn_date,
      args.due_date,
      args.total_cents,
      JSON.stringify(args.payload_json),
    ],
  );
}

export class TmsBillPushHandler implements OutboxEventHandler {
  eventType = "tms.bill.push_requested" as const;

  canHandle() {
    return (process.env.TMS_BILL_PUSH_HANDLER_ENABLED ?? "true").trim() !== "false";
  }

  async deliver(payload: OutboxPayload, ctx: OutboxHandlerContext) {
    const operating_company_id = requireUuid(payload.operating_company_id, "operating_company_id");
    const bill_id = requireUuid(payload.bill_id, "bill_id");
    const operationHint = requireOperation(payload.operation);

    await ctx.client.query(`SELECT set_config('app.bypass_rls', 'lucia', true)`);
    await ctx.client.query(`SELECT set_config('app.operating_company_id', $1, true)`, [operating_company_id]);

    const billRes = await ctx.client.query<BillHeaderRow>(
      `
        SELECT
          b.id::text AS bill_id,
          b.bill_number,
          b.bill_date::text,
          b.due_date::text,
          b.amount_cents::int,
          b.memo,
          COALESCE(NULLIF(trim(b.vendor_uuid), ''), NULLIF(trim(b.vendor_id), '')) AS vendor_key,
          v.qbo_vendor_id,
          b.coa_account_id::text,
          b.qbo_bill_id,
          b.qbo_sync_token
        FROM accounting.bills b
        LEFT JOIN mdata.vendors v
          ON v.id::text = COALESCE(NULLIF(trim(b.vendor_uuid), ''), NULLIF(trim(b.vendor_id), ''))
         AND v.operating_company_id = b.operating_company_id
        WHERE b.id = $1::uuid
          AND b.operating_company_id = $2::uuid
        LIMIT 1
      `,
      [bill_id, operating_company_id],
    );
    const bill = billRes.rows[0];
    if (!bill) throw new Error("tms_bill_missing");
    const vendorQboId = String(bill.qbo_vendor_id ?? "").trim();
    if (!vendorQboId) throw new Error("bill_vendor_qbo_id_missing");

    const lineRes = await ctx.client.query<BillLineRow>(
      `
        SELECT
          bl.id::text AS line_id,
          bl.line_sequence,
          bl.amount::text,
          bl.description,
          b.coa_account_id::text AS account_id
        FROM accounting.bill_lines bl
        JOIN accounting.bills b
          ON b.id = bl.bill_id
         AND b.operating_company_id = $2::uuid
        WHERE bl.bill_id = $1::uuid
        ORDER BY bl.line_sequence ASC, bl.created_at ASC
      `,
      [bill_id, operating_company_id],
    );

    const sourceLines =
      lineRes.rows.length > 0
        ? lineRes.rows
        : [
            {
              line_id: bill.bill_id,
              line_sequence: 1,
              amount: String(Number(bill.amount_cents ?? 0) / 100),
              description: bill.memo,
              account_id: bill.coa_account_id,
            },
          ];

    const resolvedLines = await Promise.all(
      sourceLines.map(async (line) => {
        const amountCents = Math.round(Number(line.amount) * 100);
        if (!Number.isFinite(amountCents) || amountCents <= 0) {
          throw new Error("bill_line_amount_invalid");
        }
        const accountQboId = await resolveAccountQboId(
          ctx,
          operating_company_id,
          line.account_id ?? bill.coa_account_id,
          "bill_line_account_qbo_id_missing",
        );
        return {
          amountCents,
          description: line.description,
          accountQboId,
        };
      }),
    );

    const apAccountQboId = await resolveApAccountQboId(ctx, operating_company_id, bill.coa_account_id);
    const totalCents = resolvedLines.reduce((sum, line) => sum + line.amountCents, 0);
    const qboBody = buildQboBillPayload({
      vendorQboId,
      apAccountQboId,
      txnDate: bill.bill_date,
      dueDate: bill.due_date,
      docNumber: bill.bill_number,
      privateNote: bill.memo,
      totalCents,
      qbo_bill_id: bill.qbo_bill_id,
      qbo_sync_token: bill.qbo_sync_token,
      lines: resolvedLines,
    });

    const effectiveOperation: "create" | "update" =
      operationHint === "create"
        ? bill.qbo_bill_id && bill.qbo_sync_token
          ? "update"
          : "create"
        : "update";

    const pushPayload: QboBillPushPayload = {
      operating_company_id,
      bill_id,
      operation: effectiveOperation,
      qbo_body: qboBody,
    };
    const delivered = await deliverQboBillPush(pushPayload);
    const qboId = delivered.Id != null ? String(delivered.Id).trim() : "";
    const qboSyncToken = delivered.SyncToken != null ? String(delivered.SyncToken) : null;
    if (!qboId) throw new Error("bill_push_missing_qbo_id");

    await upsertBillMirror(ctx, {
      operating_company_id,
      bill_id,
      qbo_id: qboId,
      qbo_sync_token: qboSyncToken,
      payload_json: {
        source: "accounting.bills",
        qbo_bill: delivered,
      },
      doc_number: bill.bill_number,
      txn_date: bill.bill_date,
      due_date: bill.due_date,
      total_cents: totalCents,
    });

    await ctx.client.query(
      `
        UPDATE accounting.bills
        SET qbo_bill_id = $3,
            qbo_sync_token = COALESCE($4, qbo_sync_token),
            last_qbo_synced_at = now(),
            version_int = COALESCE(version_int, 1) + 1,
            qbo_sync_pending = false,
            updated_at = now()
        WHERE id = $1::uuid
          AND operating_company_id = $2::uuid
      `,
      [bill_id, operating_company_id, qboId, qboSyncToken],
    );

    await ctx.client.query(`SELECT audit.append_event($1, $2, $3::jsonb, $4::uuid, $5)`, [
      "qbo_bill_pushed",
      "info",
      JSON.stringify({
        operating_company_id,
        bill_id,
        qbo_bill_id: qboId,
      }),
      null,
      "T11.20.6.2-CUT6-BILLS",
    ]);

    return { message: `tms_bill_push_${effectiveOperation}_${qboId}` };
  }
}
