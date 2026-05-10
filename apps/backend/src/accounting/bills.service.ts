import crypto from "node:crypto";
import { appendCrudAudit } from "../audit/crud-audit.js";
import { withCurrentUser, withLuciaBypass } from "../auth/db.js";
import { enqueueSyncJob } from "../integrations/qbo/qbo-sync.service.js";

type BillStatus = "open" | "partial" | "paid" | "voided";
type PaymentMethod = "check" | "ach" | "wire" | "cash" | "credit_card";

type CreateBillInput = {
  operatingCompanyId: string;
  vendorId: string;
  billNumber?: string;
  billDate: string;
  dueDate?: string;
  amountCents: number;
  memo?: string;
  coaAccountId?: string;
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
  vendor_id: string | null;
  vendor_uuid: string | null;
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
  created_at: string;
  updated_at: string;
  revoked_at: string | null;
};

type BillPaymentRow = {
  id: string;
  operating_company_id: string;
  bill_id: string;
  vendor_id: string | null;
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
};

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

async function resolveVendorDisplayMap(
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
    const where: string[] = ["b.operating_company_id = $1", "COALESCE(NULLIF(b.vendor_id,''), NULLIF(b.vendor_uuid,'')) = $2"];
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
    values.push(options.limit, options.offset);
    const res = await client.query<BillRow>(
      `
        SELECT *
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

export async function listBills(
  userId: string,
  operatingCompanyId: string,
  options: {
    vendorId?: string;
    status?: BillStatus;
    fromDate?: string;
    toDate?: string;
    limit: number;
    offset: number;
  }
) {
  if (!options.vendorId) return [];
  return listBillsByVendor(userId, operatingCompanyId, options.vendorId, options);
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
        SELECT *
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
    const billRes = await client.query<BillRow>(
      `
        SELECT *
        FROM accounting.bills
        WHERE id = $1
          AND operating_company_id = $2
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
    const auditEvents = await withLuciaBypass(async (auditClient) => {
      const res = await auditClient.query(
        `
          SELECT *
          FROM audit.audit_events
          WHERE payload->>'resource_id' = $1
            AND payload->>'resource_type' IN ('accounting.bills','accounting.bill_payments')
          ORDER BY happened_at DESC
          LIMIT 100
        `,
        [billId]
      );
      return res.rows;
    });
    return {
      bill: normalizeBill(bill),
      payments: paymentsRes.rows.map((row) => ({
        ...row,
        amount_cents: Number(row.amount_cents ?? Math.round(Number(row.amount ?? 0) * 100)),
      })),
      audit_events: auditEvents,
    };
  });
}

export async function createBill(input: CreateBillInput, userId: string) {
  if (input.amountCents <= 0) throw new Error("bill_amount_must_be_positive");
  const bill = await withCurrentUser(userId, async (client) => {
    await client.query(`SELECT set_config('app.operating_company_id', $1, true)`, [input.operatingCompanyId]);
    const res = await client.query<BillRow>(
      `
        INSERT INTO accounting.bills (
          operating_company_id,
          vendor_id,
          vendor_uuid,
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
          created_by_user_id,
          created_at,
          updated_at
        )
        VALUES ($1,$2,$2,$3,$4,$5,$6,$7,0,0,'unpaid',$8,$9,$10,now(),now())
        RETURNING *
      `,
      [
        input.operatingCompanyId,
        input.vendorId,
        input.billNumber ?? null,
        input.billDate,
        input.dueDate ?? null,
        input.amountCents,
        input.amountCents / 100,
        input.memo ?? null,
        input.coaAccountId ?? null,
        userId,
      ]
    );
    if ((res.rowCount ?? 0) === 0 || !res.rows[0]) throw new Error("bill_insert_failed");
    const created = normalizeBill(res.rows[0]);
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

  return bill;
}

export async function payBill(input: PayBillInput, userId: string) {
  if (input.amountCents <= 0) throw new Error("bill_payment_amount_must_be_positive");
  if (input.paymentMethod === "check" && !input.checkNumber?.trim()) {
    throw new Error("check_number_required");
  }
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

    return {
      ...paymentRes.rows[0],
      amount_cents: Number(paymentRes.rows[0].amount_cents ?? Math.round(Number(paymentRes.rows[0].amount ?? 0) * 100)),
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

  return payment;
}

export async function voidBill(operatingCompanyId: string, billId: string, reason: string, userId: string) {
  return withCurrentUser(userId, async (client) => {
    await client.query(`SELECT set_config('app.operating_company_id', $1, true)`, [operatingCompanyId]);
    const billRes = await client.query<BillRow>(
      `
        SELECT *
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
    return { ok: true };
  });
}

export async function voidBillPayment(operatingCompanyId: string, paymentId: string, reason: string, userId: string) {
  const voided = await withCurrentUser(userId, async (client) => {
    await client.query(`SELECT set_config('app.operating_company_id', $1, true)`, [operatingCompanyId]);
    const paymentRes = await client.query<BillPaymentRow>(
      `
        SELECT *
        FROM accounting.bill_payments
        WHERE id = $1
          AND operating_company_id = $2
        LIMIT 1
        FOR UPDATE
      `,
      [paymentId, operatingCompanyId]
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
      [payment.bill_id, operatingCompanyId]
    );
    const billRaw = billRes.rows[0];
    if (!billRaw) throw new Error("bill_not_found");
    const bill = normalizeBill(billRaw);

    const paymentAmountCents = Number(payment.amount_cents ?? Math.round(Number(payment.amount ?? 0) * 100));
    const newPaidCents = Math.max(0, Number(bill.paid_cents) - paymentAmountCents);
    const storageStatus = storageStatusForPaid(Number(bill.amount_cents), newPaidCents);

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
      [paymentId, operatingCompanyId, userId, reason]
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
      await updateBankBalance(client, operatingCompanyId, payment.from_bank_account_id, Math.abs(paymentAmountCents));
    }

    await appendCrudAudit(
      client,
      userId,
      "accounting.bill_payment.voided",
      {
        resource_type: "accounting.bill_payments",
        resource_id: paymentId,
        operating_company_id: operatingCompanyId,
        bill_id: payment.bill_id,
        reason,
      },
      "warning",
      "P5-D2-BILL-PAYMENT"
    );
    return { ok: true, bill_id: payment.bill_id };
  });

  return voided;
}
