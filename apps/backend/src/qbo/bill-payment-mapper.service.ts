import { withLuciaBypass } from "../auth/db.js";
import { qboApiBase } from "../integrations/qbo/qbo-client.js";
import { getValidAccessToken } from "../integrations/qbo/qbo-oauth.service.js";

export type BillPaymentApplyAllocation = {
  billId: string;
  qboBillId: string;
  amountCents: number;
};

export function buildQboBillPaymentApplyPayload(input: {
  vendorQboId: string;
  paymentDate: string;
  memo?: string | null;
  allocations: BillPaymentApplyAllocation[];
}) {
  const totalCents = input.allocations.reduce((sum, row) => sum + row.amountCents, 0);
  if (totalCents <= 0) throw new Error("bill_payment_total_must_be_positive");

  return {
    VendorRef: { value: input.vendorQboId },
    TxnDate: input.paymentDate.slice(0, 10),
    PrivateNote: input.memo ?? "",
    TotalAmt: totalCents / 100,
    Line: input.allocations.map((row) => ({
      Amount: row.amountCents / 100,
      LinkedTxn: [{ TxnId: row.qboBillId, TxnType: "Bill" }],
    })),
  };
}

function preview(text: string) {
  return text
    .replace(/"access_token"\s*:\s*"[^"]*"/g, '"access_token":"[REDACTED]"')
    .replace(/"refresh_token"\s*:\s*"[^"]*"/g, '"refresh_token":"[REDACTED]"')
    .slice(0, 500);
}

export async function pushBillPaymentToQuickBooksFromQueue(job: { operating_company_id: string; entity_id: string }) {
  const oc = job.operating_company_id;

  const existing = await withLuciaBypass(async (client) => {
    await client.query(`SELECT set_config('app.operating_company_id', $1, true)`, [oc]);
    return client.query<{ qbo_bill_payment_id: string | null }>(
      `
        SELECT qbo_bill_payment_id
        FROM accounting.bill_payments
        WHERE id = $1
          AND operating_company_id = $2
        LIMIT 1
      `,
      [job.entity_id, oc]
    );
  });
  const existingId = existing.rows[0]?.qbo_bill_payment_id ?? null;
  if (existingId) {
    return { qboId: existingId };
  }

  const loaded = await withLuciaBypass(async (client) => {
    await client.query(`SELECT set_config('app.operating_company_id', $1, true)`, [oc]);
    const payRes = await client.query<{
      payment_date: string;
      amount_cents: number;
      memo: string | null;
      bill_id: string;
      qbo_bill_id: string | null;
      vendor_name: string | null;
    }>(
      `
        SELECT
          bp.payment_date::text AS payment_date,
          bp.amount_cents::int AS amount_cents,
          bp.memo,
          b.id AS bill_id,
          b.qbo_bill_id,
          mv.vendor_name
        FROM accounting.bill_payments bp
        JOIN accounting.bills b ON b.id = bp.bill_id
        LEFT JOIN mdata.vendors mv ON mv.id::text = trim(b.vendor_uuid)
        WHERE bp.id = $1
          AND bp.operating_company_id = $2
        LIMIT 1
      `,
      [job.entity_id, oc]
    );
    return payRes.rows[0] ?? null;
  });

  if (!loaded) throw new Error("bill_payment_not_found_for_sync");
  if (!loaded.qbo_bill_id) throw new Error("bill_missing_qbo_bill_id");
  if (!loaded.vendor_name) throw new Error("bill_vendor_name_missing");

  const vendorRow = await withLuciaBypass(async (client) => {
    await client.query(`SELECT set_config('app.operating_company_id', $1, true)`, [oc]);
    return client.query<{ qbo_id: string }>(
      `
        SELECT qbo_id
        FROM mdata.qbo_vendors
        WHERE operating_company_id = $1::uuid
          AND active = true
          AND (
            display_name ILIKE $2
            OR company_name ILIKE $2
          )
        ORDER BY mirrored_at DESC NULLS LAST
        LIMIT 1
      `,
      [oc, loaded.vendor_name]
    );
  });
  const vendorQboId = vendorRow.rows[0]?.qbo_id ?? null;
  if (!vendorQboId) throw new Error("qbo_vendor_match_not_found");

  const payload = buildQboBillPaymentApplyPayload({
    vendorQboId,
    paymentDate: loaded.payment_date,
    memo: loaded.memo,
    allocations: [{ billId: loaded.bill_id, qboBillId: loaded.qbo_bill_id, amountCents: loaded.amount_cents }],
  });

  const token = await getValidAccessToken(oc);
  const url = `${qboApiBase()}/${token.realm_id}/billpayment?minorversion=75`;
  const response = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token.access_token}`,
      Accept: "application/json",
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });

  const responseText = await response.text();
  if (!response.ok) {
    const err = new Error(`qbo_bill_payment_failed_status_${response.status}`);
    (err as { status?: number }).status = response.status;
    (err as { bodyPreview?: string }).bodyPreview = preview(responseText);
    throw err;
  }

  const parsed = JSON.parse(responseText) as { BillPayment?: { Id?: string } };
  const qboPaymentId = parsed.BillPayment?.Id ?? null;
  if (!qboPaymentId) throw new Error("qbo_bill_payment_missing_id");

  await withLuciaBypass(async (client) => {
    await client.query(`SELECT set_config('app.operating_company_id', $1, true)`, [oc]);
    await client.query(
      `
        UPDATE accounting.bill_payments
        SET qbo_bill_payment_id = $3,
            updated_at = now()
        WHERE id = $1
          AND operating_company_id = $2
      `,
      [job.entity_id, oc, qboPaymentId]
    );

    const mappingExists = await client.query(`SELECT to_regclass('qbo.bill_payment_mappings') IS NOT NULL AS ok`);
    if (mappingExists.rows[0]?.ok) {
      await client.query(
        `
          INSERT INTO qbo.bill_payment_mappings (
            operating_company_id,
            payment_id,
            qbo_bill_payment_id,
            bill_id,
            qbo_bill_id,
            amount_cents
          )
          VALUES ($1,$2,$3,$4,$5,$6)
        `,
        [oc, job.entity_id, qboPaymentId, loaded.bill_id, loaded.qbo_bill_id, loaded.amount_cents]
      );
    }
  });

  return { qboId: qboPaymentId };
}
