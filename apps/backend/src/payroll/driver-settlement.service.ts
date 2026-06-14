import { withCurrentUser } from "../auth/db.js";
import { createBill, payBill } from "../accounting/bills.service.js";
import { resolveRoleAccount } from "../accounting/coa-roles/resolver.service.js";
import { depositEscrow, openEscrow } from "../accounting/escrow/service.js";
import { resolveSettlementMinNet } from "../driver-finance/settlement-deduction-cap.service.js";
import { resolveAccountForCategory } from "../accounting/expense-category-map/resolver.service.js";
import {
  computeCappedAdvanceRecovery,
  type CappedRecoveryPlan,
  type PendingDeduction,
} from "./settlement-capped-recovery.js";

type DbClient = {
  query: <T = Record<string, unknown>>(sql: string, values?: unknown[]) => Promise<{ rows: T[]; rowCount?: number }>;
};

type ComputeSettlementInput = {
  operatingCompanyId: string;
  driverId: string;
  periodStart: string;
  periodEnd: string;
  bankSettleDate?: string | null;
};

type SettlementLineType =
  | "mileage_pay"
  | "load_pay"
  | "bonus"
  | "advance_recovery"
  | "deduction"
  | "driver_bond_deduction"
  | "reimbursement";

type SettlementLineDraft = {
  line_type: SettlementLineType;
  description: string;
  amount_cents: number;
  load_id: string | null;
  posting_account_id: string;
};

type DriverSettlementRow = {
  id: string;
  operating_company_id: string;
  driver_id: string;
  pay_period_start: string;
  pay_period_end: string;
  gross_cents: number;
  deductions_cents: number;
  net_cents: number;
  bank_settle_date: string | null;
  accounting_bill_id: string | null;
  accounting_bill_payment_id: string | null;
  qbo_bill_id: string | null;
  qbo_bill_payment_id: string | null;
  status: string;
};

function asCents(input: unknown) {
  return Math.round(Number(input ?? 0));
}

function normalizeDate(input: string) {
  return input.slice(0, 10);
}

async function listSettlementLines(client: DbClient, settlementId: string) {
  const lines = await client.query<SettlementLineDraft>(
    `
      SELECT
        line_type::text AS line_type,
        description,
        amount_cents::bigint AS amount_cents,
        load_id::text AS load_id,
        posting_account_id::text AS posting_account_id
      FROM payroll.driver_settlement_line_items
      WHERE settlement_id = $1::uuid
      ORDER BY created_at ASC
    `,
    [settlementId]
  );
  return lines.rows.map((row) => ({
    ...row,
    amount_cents: asCents(row.amount_cents),
    load_id: row.load_id ? String(row.load_id) : null,
  }));
}

async function loadSettlementByPeriod(client: DbClient, input: ComputeSettlementInput): Promise<DriverSettlementRow | null> {
  const res = await client.query<DriverSettlementRow>(
    `
      SELECT
        id::text,
        operating_company_id::text,
        driver_id::text,
        pay_period_start::text,
        pay_period_end::text,
        gross_cents::bigint,
        deductions_cents::bigint,
        net_cents::bigint,
        bank_settle_date::text,
        accounting_bill_id::text,
        accounting_bill_payment_id::text,
        qbo_bill_id,
        qbo_bill_payment_id,
        status::text
      FROM payroll.driver_settlements
      WHERE operating_company_id = $1::uuid
        AND driver_id = $2::uuid
        AND pay_period_start = $3::date
        AND pay_period_end = $4::date
      LIMIT 1
    `,
    [input.operatingCompanyId, input.driverId, input.periodStart, input.periodEnd]
  );
  return res.rows[0] ?? null;
}

/** A3-2 cutover flag. OFF (default) = legacy blunt path; ON = capped-ledger engine. */
async function settlementCappedRecoveryEnabled(client: DbClient): Promise<boolean> {
  const res = await client.query<{ default_enabled: boolean }>(
    `SELECT default_enabled FROM lib.feature_flags WHERE flag_key = 'SETTLEMENT_CAPPED_RECOVERY_ENABLED' LIMIT 1`
  );
  return Boolean(res.rows[0]?.default_enabled);
}

export type DraftLinesResult = {
  lines: SettlementLineDraft[];
  /** Present only when the capped path ran (flag ON). Drives ledger persistence in computeSettlement. */
  recoveryPlan: CappedRecoveryPlan | null;
};

export async function buildDraftLines(client: DbClient, input: ComputeSettlementInput): Promise<DraftLinesResult> {
  const earningsAccountId = await resolveRoleAccount(client, input.operatingCompanyId, "expense_default");
  const deductionAccountId = await resolveRoleAccount(client, input.operatingCompanyId, "ap_control");

  const loads = await client.query<{
    load_id: string;
    load_number: string | null;
    gross_amount_cents: number | null;
  }>(
    `
      SELECT
        l.id::text AS load_id,
        l.load_number,
        COALESCE(db.gross_amount_cents, l.rate_total_cents, 0)::bigint AS gross_amount_cents
      FROM mdata.loads l
      LEFT JOIN LATERAL (
        SELECT ls.actual_departure_at
        FROM mdata.load_stops ls
        WHERE ls.load_id = l.id
          AND ls.stop_type = 'delivery'
        ORDER BY ls.sequence_number DESC
        LIMIT 1
      ) delivery ON true
      LEFT JOIN LATERAL (
        SELECT b.gross_amount_cents
        FROM driver_finance.driver_bills b
        WHERE b.operating_company_id = l.operating_company_id
          AND b.load_id = l.id
          AND b.driver_id = $2::uuid
          AND b.status <> 'void'
        ORDER BY b.created_at DESC
        LIMIT 1
      ) db ON true
      WHERE l.operating_company_id = $1::uuid
        AND l.soft_deleted_at IS NULL
        AND (l.assigned_primary_driver_id = $2::uuid OR l.assigned_secondary_driver_id = $2::uuid)
        AND l.status IN (
          'delivered_pending_docs'::mdata.load_status_enum,
          'completed_docs_received'::mdata.load_status_enum
        )
        AND COALESCE(delivery.actual_departure_at::date, l.updated_at::date, l.created_at::date)
          BETWEEN $3::date AND $4::date
      ORDER BY COALESCE(delivery.actual_departure_at, l.updated_at, l.created_at) ASC, l.id ASC
    `,
    [input.operatingCompanyId, input.driverId, input.periodStart, input.periodEnd]
  );

  const lines: SettlementLineDraft[] = [];
  for (const load of loads.rows) {
    const cents = Math.max(0, asCents(load.gross_amount_cents));
    if (cents <= 0) continue;
    lines.push({
      line_type: "load_pay",
      description: `Load ${String(load.load_number ?? load.load_id)}`,
      amount_cents: cents,
      load_id: String(load.load_id),
      posting_account_id: earningsAccountId,
    });
  }

  const capped = await settlementCappedRecoveryEnabled(client);

  if (!capped) {
    // ---- LEGACY blunt path (flag OFF) — byte-identical to pre-A3-2. ----
    // Sums approved cash_advance_requests reviewed in-period; no floor, no carry-forward.
    const advances = await client.query<{ deductions_cents: number | null }>(
      `
      SELECT COALESCE(SUM(requested_amount_cents), 0)::bigint AS deductions_cents
      FROM driver_finance.cash_advance_requests
      WHERE operating_company_id = $1::uuid
        AND driver_id = $2::uuid
        AND status = 'approved'
        AND reviewed_at::date BETWEEN $3::date AND $4::date
    `,
      [input.operatingCompanyId, input.driverId, input.periodStart, input.periodEnd]
    );
    const deductionsCents = Math.max(0, asCents(advances.rows[0]?.deductions_cents));
    if (deductionsCents > 0) {
      lines.push({
        line_type: "advance_recovery",
        description: "Cash advance recovery",
        amount_cents: -deductionsCents,
        load_id: null,
        posting_account_id: deductionAccountId,
      });
    }
    return { lines, recoveryPlan: null };
  }

  // ---- NEW capped-ledger path (flag ON) — cash_advance_repayment ledger rows ONLY. ----
  // Escrow (escrow_load_abandonment) is explicitly EXCLUDED: it keeps its own automatic deduction
  // and its own liability GL, untouched by A3.
  const grossCents = lines.filter((line) => line.amount_cents > 0).reduce((sum, line) => sum + line.amount_cents, 0);
  const floor = await resolveSettlementMinNet(
    client as unknown as Parameters<typeof resolveSettlementMinNet>[0],
    input.driverId,
    input.operatingCompanyId
  );
  const floorCents = Math.max(Math.round((grossCents * floor.pct) / 100), floor.cents);

  const pendingRes = await client.query<{
    id: string;
    amount_cents: string | number;
    remaining_balance_cents: string | number | null;
    deduction_type: string;
  }>(
    `
      SELECT id::text,
             amount_cents::bigint AS amount_cents,
             remaining_balance_cents::bigint AS remaining_balance_cents,
             deduction_type
      FROM driver_finance.driver_settlement_deductions
      WHERE operating_company_id = $1::uuid
        AND driver_id = $2::uuid
        AND deduction_type = 'cash_advance_repayment'
        AND applied_to_settlement_id IS NULL
        AND status IN ('pending', 'partial', 'deferred')
      ORDER BY created_at ASC, id ASC
      FOR UPDATE
    `,
    [input.operatingCompanyId, input.driverId]
  );
  const pending: PendingDeduction[] = pendingRes.rows.map((r) => ({
    id: String(r.id),
    amount_cents: asCents(r.amount_cents),
    remaining_balance_cents: r.remaining_balance_cents == null ? null : asCents(r.remaining_balance_cents),
    deduction_type: r.deduction_type,
  }));

  const recoveryPlan = computeCappedAdvanceRecovery({ grossCents, floorCents, pending });

  if (recoveryPlan.allocations.length > 0) {
    // Recovery line posting account = the cash-advance ASSET (QBO-149) being drawn down (never hardcoded).
    const mapped = await resolveAccountForCategory(input.operatingCompanyId, "cash_advance", "cash_advance");
    for (const a of recoveryPlan.allocations) {
      lines.push({
        line_type: "advance_recovery",
        description: "Cash advance recovery (capped)",
        amount_cents: -a.recovered_cents,
        load_id: null,
        posting_account_id: mapped.account_id,
      });
    }
  }

  return { lines, recoveryPlan };
}

export async function computeSettlement(input: ComputeSettlementInput, userId: string) {
  return withCurrentUser(userId, async (client) => {
    await client.query(`SELECT set_config('app.operating_company_id', $1::text, true)`, [input.operatingCompanyId]);
    const normalizedInput = {
      ...input,
      periodStart: normalizeDate(input.periodStart),
      periodEnd: normalizeDate(input.periodEnd),
      bankSettleDate: input.bankSettleDate ? normalizeDate(input.bankSettleDate) : null,
    };

    const existing = await loadSettlementByPeriod(client, normalizedInput);
    if (existing) {
      return {
        settlement: existing,
        lines: await listSettlementLines(client, existing.id),
      };
    }

    const { lines, recoveryPlan } = await buildDraftLines(client, normalizedInput);
    const grossCents = lines.filter((line) => line.amount_cents > 0).reduce((sum, line) => sum + line.amount_cents, 0);
    const deductionsCents = Math.abs(
      lines.filter((line) => line.amount_cents < 0).reduce((sum, line) => sum + line.amount_cents, 0)
    );

    const inserted = await client.query<{ id: string }>(
      `
        INSERT INTO payroll.driver_settlements (
          operating_company_id,
          driver_id,
          pay_period_start,
          pay_period_end,
          gross_cents,
          deductions_cents,
          bank_settle_date,
          status,
          created_by_user_id
        )
        VALUES ($1::uuid,$2::uuid,$3::date,$4::date,$5::bigint,$6::bigint,$7::date,'draft',$8::uuid)
        RETURNING id::text AS id
      `,
      [
        normalizedInput.operatingCompanyId,
        normalizedInput.driverId,
        normalizedInput.periodStart,
        normalizedInput.periodEnd,
        grossCents,
        deductionsCents,
        normalizedInput.bankSettleDate,
        userId,
      ]
    );
    const settlementId = String(inserted.rows[0]?.id ?? "");
    if (!settlementId) throw new Error("driver_settlement_insert_failed");

    for (const line of lines) {
      await client.query(
        `
          INSERT INTO payroll.driver_settlement_line_items (
            settlement_id,
            operating_company_id,
            line_type,
            load_id,
            description,
            amount_cents,
            posting_account_id
          )
          VALUES ($1::uuid,$2::uuid,$3,$4::uuid,$5,$6::bigint,$7::uuid)
        `,
        [
          settlementId,
          normalizedInput.operatingCompanyId,
          line.line_type,
          line.load_id,
          line.description,
          line.amount_cents,
          line.posting_account_id,
        ]
      );
    }

    // A3-2: persist the capped-recovery ledger updates (flag ON only — recoveryPlan is null when OFF,
    // so this is a no-op on the legacy path). The pending rows were SELECT ... FOR UPDATE in the same
    // transaction, so this is race-safe. applied_to_settlement_id is stamped ONLY when fully recovered;
    // partials keep it NULL with status 'partial'; rows with no room are 'deferred' (carried forward).
    // NOTE: the matching GL asset draw-down (Cr QBO-149) is intentionally NOT wired here yet — it is
    // gated on the GL-mechanism decision (see A3-2 preflight-of-record). The flag MUST stay OFF until
    // that ships, so this persistence never runs against a real (posted) settlement before then.
    if (recoveryPlan) {
      for (const a of recoveryPlan.allocations) {
        await client.query(
          `
            UPDATE driver_finance.driver_settlement_deductions
               SET remaining_balance_cents = $2::bigint,
                   status = $3,
                   applied_to_settlement_id = CASE WHEN $4 THEN $5::uuid ELSE applied_to_settlement_id END,
                   updated_at = now()
             WHERE id = $1::uuid
          `,
          [a.deduction_id, a.new_remaining_cents, a.new_status, a.fully_applied, settlementId]
        );
      }
      for (const d of recoveryPlan.deferred) {
        await client.query(
          `
            UPDATE driver_finance.driver_settlement_deductions
               SET status = 'deferred', updated_at = now()
             WHERE id = $1::uuid
          `,
          [d.deduction_id]
        );
      }
    }

    const settlement = await loadSettlementByPeriod(client, normalizedInput);
    if (!settlement) throw new Error("driver_settlement_read_after_write_failed");
    return { settlement, lines };
  });
}

type PostSettlementInput = {
  settlementId: string;
  operatingCompanyId: string;
  paymentMethod?: "check" | "ach" | "wire" | "cash" | "credit_card";
};

export async function postSettlement(input: PostSettlementInput, userId: string) {
  return withCurrentUser(userId, async (client) => {
    await client.query(`SELECT set_config('app.operating_company_id', $1::text, true)`, [input.operatingCompanyId]);
    const settlementRes = await client.query<DriverSettlementRow>(
      `
        SELECT
          id::text,
          operating_company_id::text,
          driver_id::text,
          pay_period_start::text,
          pay_period_end::text,
          gross_cents::bigint,
          deductions_cents::bigint,
          net_cents::bigint,
          bank_settle_date::text,
          accounting_bill_id::text,
          accounting_bill_payment_id::text,
          qbo_bill_id,
          qbo_bill_payment_id,
          status::text
        FROM payroll.driver_settlements
        WHERE id = $1::uuid
          AND operating_company_id = $2::uuid
        LIMIT 1
        FOR UPDATE
      `,
      [input.settlementId, input.operatingCompanyId]
    );
    const settlement = settlementRes.rows[0];
    if (!settlement) throw new Error("driver_settlement_not_found");

    if (
      ["posted", "synced", "paid"].includes(settlement.status) &&
      settlement.accounting_bill_id &&
      settlement.accounting_bill_payment_id
    ) {
      return { settlement, idempotent: true as const };
    }
    if (settlement.status !== "draft") throw new Error("driver_settlement_must_be_draft");
    if (asCents(settlement.net_cents) <= 0) throw new Error("driver_settlement_net_non_positive");

    const driverRes = await client.query<{ qbo_vendor_id: string | null }>(
      `
        SELECT qbo_vendor_id
        FROM mdata.drivers
        WHERE id = $1::uuid
          AND operating_company_id = $2::uuid
        LIMIT 1
      `,
      [settlement.driver_id, input.operatingCompanyId]
    );
    const vendorId = String(driverRes.rows[0]?.qbo_vendor_id ?? settlement.driver_id).trim();
    if (!vendorId) throw new Error("driver_vendor_missing");

    const billDate = normalizeDate(settlement.pay_period_end);
    const paymentDate = normalizeDate(settlement.bank_settle_date ?? settlement.pay_period_end);
    const expenseAccountId = await resolveRoleAccount(client, input.operatingCompanyId, "expense_default");
    const bill = await createBill(
      {
        operatingCompanyId: input.operatingCompanyId,
        vendorId,
        billNumber: `DRV-SET-${settlement.id.slice(0, 8).toUpperCase()}`,
        billDate,
        dueDate: paymentDate,
        amountCents: asCents(settlement.net_cents),
        memo: `Driver settlement ${settlement.id}`,
        coaAccountId: expenseAccountId,
      },
      userId
    );
    const payment = await payBill(
      {
        operatingCompanyId: input.operatingCompanyId,
        billId: bill.id,
        paymentDate,
        amountCents: asCents(settlement.net_cents),
        paymentMethod: input.paymentMethod ?? "ach",
        memo: `Driver settlement payment ${settlement.id}`,
      },
      userId
    );

    const bondLineTotal = await client.query<{ amount_cents: number | null }>(
      `
        SELECT COALESCE(SUM(ABS(amount_cents)), 0)::bigint AS amount_cents
        FROM payroll.driver_settlement_line_items
        WHERE settlement_id = $1::uuid
          AND operating_company_id = $2::uuid
          AND line_type = 'driver_bond_deduction'
      `,
      [input.settlementId, input.operatingCompanyId]
    );
    const bondAmountCents = Math.max(0, asCents(bondLineTotal.rows[0]?.amount_cents));
    if (bondAmountCents > 0) {
      const escrow = await openEscrow(
        {
          operating_company_id: input.operatingCompanyId,
          holder_id: settlement.driver_id,
          holder_type: "driver",
          purpose: "driver_bond",
        },
        { userId, role: "Accountant" }
      );
      await depositEscrow(
        {
          operating_company_id: input.operatingCompanyId,
          escrow_account_id: escrow.escrow_account.id,
          amount_cents: bondAmountCents,
          source_type: "driver_settlement",
          source_id: settlement.id,
          note: `Driver bond deduction from settlement ${settlement.id}`,
        },
        { userId, role: "Accountant" }
      );
    }
    const updatedRes = await client.query<DriverSettlementRow>(
      `
        UPDATE payroll.driver_settlements
        SET
          status = 'posted',
          accounting_bill_id = $3::uuid,
          accounting_bill_payment_id = $4::uuid,
          qbo_bill_id = COALESCE($5, qbo_bill_id),
          qbo_bill_payment_id = COALESCE($6, qbo_bill_payment_id),
          posted_by_user_id = $7::uuid,
          posted_at = now(),
          updated_at = now()
        WHERE id = $1::uuid
          AND operating_company_id = $2::uuid
        RETURNING
          id::text,
          operating_company_id::text,
          driver_id::text,
          pay_period_start::text,
          pay_period_end::text,
          gross_cents::bigint,
          deductions_cents::bigint,
          net_cents::bigint,
          bank_settle_date::text,
          accounting_bill_id::text,
          accounting_bill_payment_id::text,
          qbo_bill_id,
          qbo_bill_payment_id,
          status::text
      `,
      [input.settlementId, input.operatingCompanyId, bill.id, payment.id, bill.qbo_bill_id ?? null, payment.qbo_bill_payment_id ?? null, userId]
    );
    const updated = updatedRes.rows[0];
    if (!updated) throw new Error("driver_settlement_post_update_failed");
    return { settlement: updated, idempotent: false as const };
  });
}
