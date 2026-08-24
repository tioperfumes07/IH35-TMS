/**
 * G2-A: single atomic transaction wrapping existing dispersal math + bill persistence.
 * Writes insurance.policy (1) + insurance.policy_unit (N) + term_months scheduled bills in ONE
 * BEGIN/COMMIT via withCurrentUser. A failure anywhere rolls the whole thing back.
 * No new financial calculation code — math via dispersal.service.ts + accounting/allocation.ts.
 */
import { setScopedCompanyContext } from "../_helpers/scoped-company-context.js";
import type { PoolClient } from "pg";
import { appendCrudAudit } from "../audit/crud-audit.js";
import { withCurrentUser } from "../auth/db.js";
import { enqueueAccountingOutbox } from "../accounting/outbox-events.js";
import { bankAccountHiddenFilterSql, isBankAccountHideEnabled } from "../banking/bank-account-visibility.js";
import {
  computeInsuranceDispersal,
  coverageTypeToPsItem,
  INSURANCE_PS_CATEGORY,
  type InsuranceDispersalBill,
  type InsuranceDispersalUnit,
} from "./dispersal.service.js";
import type { InsuranceCoverageType, InsurancePolicyStatus } from "./policy.shared.js";
import { resolveMdataAssetId } from "./resolve-asset-id.shared.js";

export type AllocationMethod = "equal_split" | "pro_rata" | "weighted";

export type CreatePolicyWithBillsInput = {
  operatingCompanyId: string;
  vendorId: string;
  userId: string;
  insurerName: string;
  policyNumber: string;
  coverageType: InsuranceCoverageType;
  effectiveDate: string;
  expiryDate: string;
  totalPremiumCents: number;
  downPaymentCents: number;
  termMonths: number;
  allocationMethod: AllocationMethod;
  manualPcts?: Record<string, number>;
  unitIds: string[];
  dueDay?: number | null;
  payDay?: number | null;
  lateFee?: number;
  status?: InsurancePolicyStatus;
  insurerEmail?: string | null;
  agentContact?: string | null;
};

export type CreatedPolicyWithBills = {
  policyId: string;
  unitCount: number;
  billCount: number;
  totalAmountCents: number;
};

/**
 * Persist dispersal bills on an already-open PoolClient (no BEGIN/COMMIT inside).
 * Each bill is idempotency-keyed: `ins:{policyId}:{sequence}` → unique on (company, key).
 */
async function persistBillsOnClient(
  client: PoolClient,
  input: {
    operatingCompanyId: string;
    userId: string;
    policyId: string;
    policyNumber: string;
    vendorId: string;
    insurerName: string;
    bills: InsuranceDispersalBill[];
  }
): Promise<string[]> {
  if (!input.bills.length) return [];

  const vendorRes = await client.query<{ id: string; vendor_name: string; is_sample_data: boolean | null }>(
    `SELECT id::text, is_sample_data FROM mdata.vendors
     WHERE operating_company_id = $1::uuid AND deactivated_at IS NULL
       AND id = $2::uuid
     ORDER BY created_at ASC LIMIT 1`,
    [input.operatingCompanyId, input.vendorId]
  );
  const vendorId = vendorRes.rows[0]?.id;
  if (!vendorId) throw new Error("insurance_vendor_not_found");
  // ACCT-F353 — derive from the insurer vendor being billed (same relationship the FK derives from).
  const vendorIsSampleData = vendorRes.rows[0]?.is_sample_data === true;

  // BANK-ACCOUNT-HIDE: an account hidden for THIS entity must never be auto-picked to seed insurance
  // premium bill transactions (flag OFF by default — see docs/accounting/BANK-ACCOUNT-ENTITY-HIDE-DESIGN.md).
  const hideOnPolicy = await isBankAccountHideEnabled(client, input.operatingCompanyId);
  const bankAccountRes = await client.query<{ id: string }>(
    `SELECT id::text FROM banking.bank_accounts
     WHERE operating_company_id = $1::uuid AND is_active = true
     ${bankAccountHiddenFilterSql(hideOnPolicy, "banking.bank_accounts")}
     ORDER BY created_at ASC LIMIT 1`,
    [input.operatingCompanyId]
  );
  const bankAccountId = bankAccountRes.rows[0]?.id;
  if (!bankAccountId) throw new Error("insurance_seed_bank_account_not_found");

  const psItem = input.bills[0]?.ps_item ?? "Insurance Premium";
  const billIds: string[] = [];

  for (const bill of input.bills) {
    const idempotencyKey = `ins:${input.policyId}:${bill.sequence}`;

    const txnRes = await client.query<{ id: string }>(
      `INSERT INTO banking.bank_transactions (
         bank_account_id, operating_company_id, transaction_date, posted_date,
         amount_cents, description, merchant_name, status, category, category_kind, notes
       )
       VALUES ($1,$2,$3::date,$3::date,$4,$5,$6,'pending_categorization',NULL,NULL,$7)
       RETURNING id::text`,
      [
        bankAccountId,
        input.operatingCompanyId,
        bill.due_date,
        Math.abs(bill.amount_cents),
        `Insurance dispersal ${input.policyNumber} #${String(bill.sequence).padStart(2, "0")}`,
        input.insurerName,
        // ACCT-F6284 — banking.bank_transactions.notes is rendered verbatim in
        // BankTransactionAttachmentsNotesModal.tsx ({tx.notes}) and string-matched by several
        // BankingTransactionsDesignView.tsx filters; a serialized object here both displays raw
        // JSON to the user and silently breaks those substring checks. policy_id/policy_number/
        // sequence/due_date are all already columns or derivable from the linked bill this
        // transaction seeds; idempotency_key is stored on the bill's own qbo_idempotency_key.
        `Insurance wizard seed transaction — policy ${input.policyNumber}, installment ${bill.sequence}`,
      ]
    );
    const txnId = txnRes.rows[0]?.id;
    if (!txnId) throw new Error("insurance_seed_transaction_insert_failed");

    const billRes = await client.query<{ id: string }>(
      // LV-BILL-MDATA-VENDOR-FK-OPTOUT sweep — vendorId is already a resolved, entity-scoped
      // mdata.vendors.id (looked up above by name), so it stamps the typed FK directly — no
      // separate resolution needed, unlike the other 5 writers in the sweep.
      `INSERT INTO accounting.bills (
         operating_company_id, vendor_id, vendor_uuid, mdata_vendor_id,
         bill_date, due_date, amount_cents, total_amount,
         paid_cents, paid_amount, status, memo,
         qbo_idempotency_key, created_by_user_id, created_at, updated_at,
         -- ACCT-F353 — derived from the insurer vendor above (vendorIsSampleData).
         is_sample_data
       )
       VALUES ($1,$2,$2,$2,$3,$3,$4,$5,0,0,'unpaid',$6,$7,$8,now(),now(),$9)
       ON CONFLICT (operating_company_id, qbo_idempotency_key)
         WHERE qbo_idempotency_key IS NOT NULL DO NOTHING
       RETURNING id::text`,
      [
        input.operatingCompanyId,
        vendorId,
        bill.due_date,
        Math.abs(bill.amount_cents),
        Math.abs(bill.amount_cents) / 100,
        // ACCT-F6284 — plain sentence, not a serialized object, in this free-text memo column;
        // qbo_idempotency_key (bound below) already carries idempotencyKey losslessly and
        // category_kind (set on the linked bank_transactions row) already carries ps_category/
        // ps_item.
        `Insurance wizard bill — policy ${input.policyNumber}, installment ${bill.sequence} (${bill.phase})`,
        idempotencyKey,
        input.userId,
        vendorIsSampleData,
      ]
    );
    const billId = billRes.rows[0]?.id;
    if (!billId) throw new Error("insurance_created_bill_not_found");

    await client.query(
      `UPDATE accounting.bills
       SET bill_number = $3, memo = $4, updated_at = now()
       WHERE id = $1 AND operating_company_id = $2::uuid`,
      [
        billId,
        input.operatingCompanyId,
        `${input.policyNumber}-INS-${String(bill.sequence).padStart(2, "0")}`,
        bill.memo,
      ]
    );

    await client.query(
      `UPDATE banking.bank_transactions
       SET status = 'categorized', category = 'bill',
           category_kind = $2, linked_entity_id = $3::uuid,
           categorization_vendor_id = $4::uuid,
           categorization_memo = $5, categorized_at = now(), updated_at = now()
       WHERE id = $1 AND operating_company_id = $6::uuid`,
      [
        txnId,
        `${INSURANCE_PS_CATEGORY}::${psItem}`,
        billId,
        vendorId,
        // ACCT-F6284 — plain sentence, not a serialized object, in this free-text memo column;
        // linked_entity_id (bound above) already carries billId losslessly and category_kind
        // already carries INSURANCE_PS_CATEGORY/psItem.
        `${INSURANCE_PS_CATEGORY} — ${psItem} (bill ${billId})`,
        input.operatingCompanyId,
      ]
    );

    for (const allocation of bill.allocations) {
      await client.query(
        `INSERT INTO accounting.bill_unit_allocation (
           tenant_id, bill_id, asset_id,
           allocation_method, allocation_pct, allocated_amount_cents
         )
         VALUES ($1,$2,$3,$4,$5,$6)`,
        [
          input.operatingCompanyId,
          billId,
          allocation.asset_id,
          allocation.allocation_method,
          allocation.allocation_pct,
          allocation.allocated_amount_cents,
        ]
      );
    }

    await enqueueAccountingOutbox(
      client,
      input.operatingCompanyId,
      "qbo.insurance_bill.created",
      "bill",
      billId,
      { policy_id: input.policyId, bill_sequence: bill.sequence, idempotency_key: idempotencyKey }
    );

    billIds.push(billId);
  }

  return billIds;
}

function computeEqualSplitMonthly(monthlyPremiumCents: number, unitCount: number): number[] {
  if (unitCount === 0) return [];
  const base = Math.floor(monthlyPremiumCents / unitCount);
  const remainder = monthlyPremiumCents - base * unitCount;
  return Array.from({ length: unitCount }, (_, i) => base + (i < remainder ? 1 : 0));
}

/**
 * One BEGIN/COMMIT: policy + N policy_units + term_months bills.
 * Uses computeInsuranceDispersal (existing math) with equal weights for all allocation methods
 * (dispersal handles per-bill splitting; per-unit cost is stored separately in policy_unit).
 */
export async function createInsurancePolicyWithBills(
  input: CreatePolicyWithBillsInput
): Promise<CreatedPolicyWithBills> {
  return withCurrentUser(input.userId, async (rawClient) => {
    const client = rawClient as unknown as PoolClient;
    await setScopedCompanyContext(client, input.userId, input.operatingCompanyId);

    const coverageTypeRes = await client.query<{ id: string }>(
      `SELECT id::text FROM insurance.type_catalog
       WHERE tenant_id = $1::uuid AND code = $2 AND active = true LIMIT 1`,
      [input.operatingCompanyId, input.coverageType]
    );
    if (!coverageTypeRes.rows[0]) throw new Error("coverage_type_not_found");
    const coverageTypeId = coverageTypeRes.rows[0].id;

    const vendorRes = await client.query<{ vendor_name: string }>(
      `SELECT vendor_name FROM mdata.vendors
       WHERE id = $1::uuid AND operating_company_id = $2::uuid AND deactivated_at IS NULL
       LIMIT 1`,
      [input.vendorId, input.operatingCompanyId]
    );
    const vendorName = vendorRes.rows[0]?.vendor_name;
    if (!vendorName) throw new Error("insurance_vendor_not_found");

    const policyRes = await client.query<{ id: string }>(
      `INSERT INTO insurance.policy (
         tenant_id, operating_company_id, vendor_id, insurer_name, policy_number, coverage_type, coverage_type_id,
         effective_date, expiry_date, total_premium_cents, down_payment_cents,
         installment_count, due_day, pay_day, late_fee_pct,
         insurer_email, agent_contact, status, allocation_method
       )
       VALUES (
         $1::uuid,$1::uuid,$2,$3,$4,$5,$6::uuid,
         $7::date,$8::date,$9,$10,
         $11,$12,$13,$14,$15,$16,$17,$18
       )
       RETURNING id::text`,
      [
        input.operatingCompanyId,
        input.vendorId,
        vendorName,
        input.policyNumber,
        input.coverageType,
        coverageTypeId,
        input.effectiveDate,
        input.expiryDate,
        input.totalPremiumCents,
        input.downPaymentCents,
        input.termMonths,
        input.dueDay ?? null,
        input.payDay ?? null,
        input.lateFee ?? 0,
        input.insurerEmail ?? null,
        input.agentContact ?? null,
        input.status ?? "active",
        input.allocationMethod,
      ]
    );
    const policyId = policyRes.rows[0]?.id;
    if (!policyId) throw new Error("insurance_policy_insert_failed");

    await appendCrudAudit(client, input.userId, "insurance.policy.created", {
      resource_id: policyId,
      operating_company_id: input.operatingCompanyId,
      wizard: true,
    });

    const monthlyPremiumCents = Math.round(input.totalPremiumCents / input.termMonths);
    const costPerUnit = computeEqualSplitMonthly(monthlyPremiumCents, input.unitIds.length);

    const resolvedAssetIds: string[] = [];
    for (const unitId of input.unitIds) {
      const resolvedAssetId = await resolveMdataAssetId(client, input.operatingCompanyId, unitId);
      if (!resolvedAssetId) {
        throw new Error(`asset_not_found:${unitId}`);
      }
      resolvedAssetIds.push(resolvedAssetId);
    }

    for (let i = 0; i < resolvedAssetIds.length; i++) {
      const resolvedAssetId = resolvedAssetIds[i]!;
      const costPerMonth = costPerUnit[i] ?? 0;
      await client.query(
        `INSERT INTO insurance.policy_unit (
           tenant_id, operating_company_id, policy_id, asset_id, insured_value_cents, cost_per_month_cents
         )
         VALUES ($1::uuid,$1::uuid,$2::uuid,$3::uuid,0,$4)`,
        [input.operatingCompanyId, policyId, resolvedAssetId, costPerMonth]
      );
      await appendCrudAudit(client, input.userId, "insurance.policy_unit.created", {
        resource_id: policyId,
        operating_company_id: input.operatingCompanyId,
        asset_id: resolvedAssetId,
      });
    }

    // dispersal.service allocateBill uses by_value weights; set equal weight = 1 for equal/equal_split
    const dispersalUnits: InsuranceDispersalUnit[] = resolvedAssetIds.map((asset_id) => ({
      asset_id,
      insured_value_cents: 1,
    }));

    const dispersal = computeInsuranceDispersal(
      {
        id: policyId,
        policy_number: input.policyNumber,
        insurer_name: input.insurerName,
        coverage_type: input.coverageType,
        effective_date: input.effectiveDate,
        expiry_date: input.expiryDate,
        total_premium_cents: input.totalPremiumCents,
        down_payment_cents: input.downPaymentCents,
        installment_count: input.termMonths,
        due_day: input.dueDay ?? null,
        pay_day: input.payDay ?? null,
      },
      dispersalUnits,
      { remainder_installment_count: input.termMonths, remainder_cadence: "monthly" }
    );

    const billIds = await persistBillsOnClient(client, {
      operatingCompanyId: input.operatingCompanyId,
      userId: input.userId,
      policyId,
      policyNumber: input.policyNumber,
      vendorId: input.vendorId,
      insurerName: vendorName,
      bills: dispersal.bills,
    });

    return {
      policyId,
      unitCount: input.unitIds.length,
      billCount: billIds.length,
      totalAmountCents: dispersal.total_amount_cents,
    };
  });
}
