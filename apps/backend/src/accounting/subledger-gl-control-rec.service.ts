/**
 * ACCT-DOM-02 — READ-ONLY standing sub-ledger ↔ GL control-account reconciliation.
 *
 * Compares operational subledger totals (AR aging, AP aging, escrow accounts, factoring liability
 * artifacts) to each entity's designated control GL account balance. No posting, no write-back.
 * Any non-zero variance is flagged (RECON-01: no dollar threshold).
 */
import { computeFactoringBalanceInvoiceLinkage } from "../home/factoring-balance-invoice-linkage.service.js";
import { companyBusinessDate } from "../lib/company-business-date.js";
import { getApAgingReport } from "./ap-aging.service.js";
import { getArAgingReport } from "./ar-aging.service.js";
import { resolveRoleAccountOptional, type CoaRole } from "./coa-roles/resolver.service.js";
import { withCompanyScope } from "./shared.js";

/** Standing control roles reconciled by this report (TRANSP + USMCA per-opco).
 *
 * LAW-TRANSACTION-HEALTH-REGISTER-2026-09-01 band B — added operating_bank (B3: vs
 * banking.bank_transactions), unbilled_revenue (B4: vs delivered-not-invoiced loads),
 * prepaid_asset_default (B7: vs amortization schedule), fixed_asset_default (B8: vs asset
 * register net of accumulated depreciation). B6 (driver cash advance) and B10 (intercompany) are
 * NOT roles here — cash advance resolves to MULTIPLE per-driver control accounts
 * (driver_finance.driver_advance_accounts.coa_account_id), not one company-wide role, and
 * intercompany nets ACROSS entities rather than against one company's subledger — both are
 * bespoke checks in ledger-integrity-detectors.service.ts instead. B9 (factoring) is already
 * covered by factoring_advance_liability above; B5 (escrow) by escrow_liability_default. */
export const SUBLEDGER_GL_CONTROL_ROLES = [
  "ar_control",
  "ap_control",
  "escrow_liability_default",
  "factoring_advance_liability",
  "operating_bank",
  "unbilled_revenue",
  "prepaid_asset_default",
  "fixed_asset_default",
] as const satisfies readonly CoaRole[];

export type SubledgerGlControlRole = (typeof SUBLEDGER_GL_CONTROL_ROLES)[number];

// "unverified" (LAW-TRANSACTION-HEALTH-REGISTER-2026-09-01 band B vocabulary) — the subledger side
// has no buildable source yet (B7 prepaid: no amortization-schedule table exists in this repo
// today). Deliberately distinct from "tied": a $0 subledger compared against a $0 control balance
// IS a real tie (both sides genuinely zero); "unverified" means there is nothing to compare at
// all, which must never render as a false pass.
export type SubledgerGlControlRecStatus = "tied" | "variance" | "unverified";

export type SubledgerGlControlRecRow = {
  role: SubledgerGlControlRole;
  control_account_id: string | null;
  control_balance_cents: number | null;
  subledger_balance_cents: number | null;
  variance_cents: number | null;
  status: SubledgerGlControlRecStatus;
  subledger_source: string;
};

export type SubledgerGlControlRecReport = {
  operating_company_id: string;
  as_of_date: string;
  rows: SubledgerGlControlRecRow[];
  generated_at: string;
};

type DbClient = {
  query: <T = Record<string, unknown>>(sql: string, values?: unknown[]) => Promise<{ rows: T[] }>;
};

/** Pure — RECON-01: flag every non-zero cent; no tolerance. null means nothing to compare yet. */
export function deriveSubledgerGlControlRecStatus(varianceCents: number | null): SubledgerGlControlRecStatus {
  if (varianceCents === null) return "unverified";
  return varianceCents === 0 ? "tied" : "variance";
}

/** Pure row builder (guard selftest + unit tests). variance = control − subledger. */
export function buildSubledgerGlControlRecRow(input: {
  role: SubledgerGlControlRole;
  control_account_id: string | null;
  control_balance_cents: number | null;
  subledger_balance_cents: number | null;
  subledger_source: string;
}): SubledgerGlControlRecRow {
  const control = input.control_balance_cents ?? 0;
  const variance_cents = input.subledger_balance_cents === null ? null : control - input.subledger_balance_cents;
  return {
    role: input.role,
    control_account_id: input.control_account_id,
    control_balance_cents: input.control_balance_cents,
    subledger_balance_cents: input.subledger_balance_cents,
    variance_cents,
    status: deriveSubledgerGlControlRecStatus(variance_cents),
    subledger_source: input.subledger_source,
  };
}

// ACCT-F5695 — fn_account_balances_as_of.closing_balance_cents is DEBIT-POSITIVE by construction
// (SUM(debit) − SUM(credit), see 202606072356), regardless of the account's own normal_balance. A
// credit-normal control account (ap_control / escrow_liability_default / factoring_advance_liability
// — all Liability) with a real $X owed therefore reports closing_balance_cents = −X, while every
// subledger source in this report (AR/AP aging totals, escrow_accounts.balance_cents, factoring
// linkage) expresses its figure as a POSITIVE magnitude. Comparing the two directly for a
// credit-normal role doubles the apparent variance instead of proving tie-out — live-verified on
// USMCA 2026-08-21: ap_control read control=-$123.45 / subledger=$123.45, i.e. exactly the same
// dollar amount with the sign that this exact bug predicts, not a real $246.90 gap. Only ar_control
// (Asset, debit-normal) was ever comparable as-is. Fix: read the function's OWN already-computed
// normal_balance (never re-derive the Asset/Liability CASE a second time — reuse, don't duplicate)
// and flip sign for a credit-normal account so this function always returns the balance in the SAME
// "positive = real economic amount in that account's natural direction" convention every subledger
// source already uses.
// LV-ESCROW-CONTROL-ACCOUNT-BLIND-TO-CHILD-SUBACCOUNTS — a control account can be a GRANDPARENT
// with real money posted only to descendant sub-accounts, not to itself. Live-verified on USMCA
// 2026-08-21: escrow_liability_default resolves to "Driver Escrow - Held in Trust" (the ACCT-F5681
// alias-fixed grandparent, parent_account_id IS NULL) — ZERO direct postings against it — while the
// real $250.00 first-ever escrow accrual posted to a per-driver LEAF account THREE LEVELS down
// (grandparent -> "Driver Escrow" middle parent -> the specific driver's own sub-account, the row
// driver-subaccount-provision.service.ts's own resolveDriverEscrowParentId hierarchy creates).
// `fn_account_balances_as_of` reads one account_id's own postings only; a single-row lookup is
// therefore structurally blind to any hierarchy with real depth. Fix: recurse the FULL descendant
// subtree via catalogs.accounts.parent_account_id (arbitrary depth, not hardcoded to one level —
// the escrow hierarchy alone is already 3 levels deep) and sum every descendant's own
// sign-normalized balance, not just the root's.
// Exported (LAW-TRANSACTION-HEALTH-REGISTER band B) — ledger-integrity-detectors.service.ts's
// bespoke B6/B10 checks reuse this SAME sign-normalized, subtree-aware GL reader rather than
// re-deriving control-balance math a second time. "Reuse it, do not rebuild it" per the owner.
export async function loadControlBalanceCents(
  client: DbClient,
  operatingCompanyId: string,
  asOfDate: string,
  controlAccountId: string
): Promise<number> {
  const res = await client.query<{ closing_balance_cents: string | number; normal_balance: string }>(
    `
      WITH RECURSIVE subtree AS (
        SELECT id FROM catalogs.accounts
         WHERE id = $3::uuid AND operating_company_id = $1::uuid
        UNION ALL
        SELECT a.id
          FROM catalogs.accounts a
          JOIN subtree s ON a.parent_account_id = s.id
         WHERE a.operating_company_id = $1::uuid
      )
      SELECT b.closing_balance_cents::bigint AS closing_balance_cents, b.normal_balance
        FROM accounting.fn_account_balances_as_of($1::uuid, $2::date, NULL::date) b
        JOIN subtree s ON s.id = b.account_id
    `,
    [operatingCompanyId, asOfDate, controlAccountId]
  );
  if (res.rows.length === 0) return 0;
  // Every row in one account's own subtree shares the same account_type by construction (a
  // Liability parent never has an Asset child in this chart) — sign-normalize per row using each
  // row's OWN normal_balance anyway, rather than reading it once from the root and assuming every
  // descendant matches, so a hypothetical future miscategorized child still sums correctly instead
  // of silently reusing the wrong sign.
  return res.rows.reduce((sum, row) => {
    const raw = Number(row.closing_balance_cents ?? 0);
    return sum + (row.normal_balance === "credit" ? -raw : raw);
  }, 0);
}

async function sumEscrowSubledgerCents(client: DbClient, operatingCompanyId: string): Promise<number> {
  const res = await client.query<{ total_cents: string | number }>(
    `
      SELECT COALESCE(SUM(balance_cents), 0)::bigint AS total_cents
      FROM accounting.escrow_accounts
      WHERE operating_company_id = $1::uuid
        AND status = 'active'
    `,
    [operatingCompanyId]
  );
  return Number(res.rows[0]?.total_cents ?? 0);
}

async function sumFactoringLiabilitySubledgerCents(
  client: DbClient,
  operatingCompanyId: string,
  asOfDate: string
): Promise<number> {
  const factoring = await computeFactoringBalanceInvoiceLinkage(client, {
    operatingCompanyId,
    asOfBusinessDate: asOfDate,
  });
  if (factoring.diagnostics?.outstanding_liability_signed_cents != null) {
    return Number(factoring.diagnostics.outstanding_liability_signed_cents);
  }
  if (factoring.outstanding_liability_cents != null) {
    return Number(factoring.outstanding_liability_cents);
  }
  return 0;
}

// B3 — bank subledger is the bank's OWN transaction book for the specific GL account the
// operating_bank role resolved to. FIRST DRAFT of this function joined on
// banking.bank_transactions.coa_account_id, which live-verification caught as WRONG before
// shipping: that column is the transaction's CATEGORIZATION target (which expense/revenue account
// a deposit or withdrawal was coded to — 396 of 404 USMCA rows are even NULL, uncategorized), not
// the bank's own cash GL account. The real link is banking.bank_accounts.ledger_account_id (one
// bank_account row per real bank/card/wallet, each pointing at its own GL cash account) — a
// transaction belongs to a bank_account via bank_account_id, and the bank_account is what carries
// the GL link. Excludes voided rows — a voided bank transaction is not real money in the account.
// Not filtered by categorization status: pending_categorization/split rows are still real cleared
// transactions, just not yet coded — excluding them would UNDERSTATE the subledger and manufacture
// a fake tie.
export async function sumBankSubledgerCents(client: DbClient, operatingCompanyId: string, bankAccountGlId: string): Promise<number> {
  const res = await client.query<{ total_cents: string | number }>(
    `
      SELECT COALESCE(SUM(bt.amount_cents), 0)::bigint AS total_cents
      FROM banking.bank_transactions bt
      JOIN banking.bank_accounts ba ON ba.id = bt.bank_account_id
      WHERE bt.operating_company_id = $1::uuid
        AND ba.ledger_account_id = $2::uuid
        AND bt.voided_at IS NULL
    `,
    [operatingCompanyId, bankAccountGlId]
  );
  return Number(res.rows[0]?.total_cents ?? 0);
}

// B4 — "delivered-not-invoiced loads": a load has reached a delivered state but no real
// (non-voided, non-sample) invoice has ever been minted against it via source_load_id. Valued at
// the load's own rate_total_cents (the revenue amount Event 1 of the two-event latch would book).
// This is DELIBERATELY not scoped to invoice_type='from_load' on the invoice side — the point is
// "does ANY invoice reference this load at all", not one specific invoice shape.
export async function sumUnbilledRevenueSubledgerCents(client: DbClient, operatingCompanyId: string): Promise<number> {
  const res = await client.query<{ total_cents: string | number }>(
    `
      SELECT COALESCE(SUM(l.rate_total_cents), 0)::bigint AS total_cents
      FROM mdata.loads l
      WHERE l.operating_company_id = $1::uuid
        AND l.status IN ('delivered', 'delivered_pending_docs', 'completed_docs_received')
        AND NOT EXISTS (
          SELECT 1 FROM accounting.invoices i
          WHERE i.source_load_id = l.id
            AND i.voided_at IS NULL
            AND COALESCE(i.is_sample_data, false) = false
        )
    `,
    [operatingCompanyId]
  );
  return Number(res.rows[0]?.total_cents ?? 0);
}

// B7 — prepaid subledger: accounting.prepaid_assets + accounting.prepaid_amortization_rows IS the
// real amortization schedule (initially assumed this table didn't exist and wrote a null-
// placeholder here; live-queried information_schema before finalizing this function and found it
// does — never ship an unverified "not buildable" claim when five minutes of grounding disproves
// it). Per active (non-voided) prepaid asset, the current unamortized balance is the most recent
// POSTED amortization row's remaining_balance_cents; an asset with no posted rows yet still owes
// its full total_amount_cents (nothing has been recognized against it).
export async function sumPrepaidSubledgerCents(client: DbClient, operatingCompanyId: string): Promise<number> {
  const res = await client.query<{ total_cents: string | number }>(
    `
      SELECT COALESCE(SUM(
        COALESCE(
          (
            SELECT r.remaining_balance_cents
            FROM accounting.prepaid_amortization_rows r
            WHERE r.asset_id = pa.id AND r.posted = true
            ORDER BY r.period_number DESC
            LIMIT 1
          ),
          pa.total_amount_cents
        )
      ), 0)::bigint AS total_cents
      FROM accounting.prepaid_assets pa
      WHERE pa.operating_company_id = $1::uuid
        AND pa.voided_at IS NULL
    `,
    [operatingCompanyId]
  );
  return Number(res.rows[0]?.total_cents ?? 0);
}

// B8 — fixed-asset subledger is net book value: purchase price less accumulated depreciation,
// summed across every non-voided asset. FIN-21 posts acquisition/depreciation from these SAME row
// columns (per this file's own accum_depr_default comment above), so this is the identical amount
// the asset_account_id + accum_depr_account_id postings should net to in the GL.
// CAVEAT (not live-verified against a bound company — fixed_asset_default has no live role
// binding on USMCA/TRANSP/TRK today, so this leg currently always resolves control_account_id to
// null and skips): prior_accumulated_depr_cents is this row's OPENING/legacy accumulated
// depreciation as of go-live, not necessarily every dollar of depreciation posted by this system
// since acquisition. If/when this role is bound and FIN-21 periodic depreciation postings are
// live, re-verify whether current-period depreciation needs to be added here (read from postings
// against accum_depr_account_id) rather than trusting only the opening snapshot column.
export async function sumFixedAssetNetBookValueSubledgerCents(client: DbClient, operatingCompanyId: string): Promise<number> {
  const res = await client.query<{ total_cents: string | number }>(
    `
      SELECT COALESCE(SUM(purchase_price_cents - COALESCE(prior_accumulated_depr_cents, 0)), 0)::bigint AS total_cents
      FROM accounting.fixed_assets
      WHERE operating_company_id = $1::uuid
        AND voided_at IS NULL
    `,
    [operatingCompanyId]
  );
  return Number(res.rows[0]?.total_cents ?? 0);
}

export async function getSubledgerGlControlRecReport(input: {
  userId: string;
  operating_company_id: string;
  as_of_date?: string;
}): Promise<SubledgerGlControlRecReport> {
  const asOfDate = input.as_of_date ?? companyBusinessDate();

  const [arAging, apAging] = await Promise.all([
    getArAgingReport({
      userId: input.userId,
      operating_company_id: input.operating_company_id,
      as_of_date: asOfDate,
    }),
    getApAgingReport({
      userId: input.userId,
      operating_company_id: input.operating_company_id,
      as_of_date: asOfDate,
    }),
  ]);

  const subledgerByRole: Record<SubledgerGlControlRole, { cents: number | null; source: string }> = {
    ar_control: {
      cents: arAging.totals.total_outstanding,
      source: "accounting.invoices.amount_open_cents (AR aging)",
    },
    ap_control: {
      cents: apAging.totals.total_outstanding,
      source: "accounting.bills open balance (AP aging)",
    },
    escrow_liability_default: {
      cents: 0,
      source: "accounting.escrow_accounts.balance_cents",
    },
    factoring_advance_liability: {
      cents: 0,
      source: "views.factoring_balance_invoice_linkage outstanding_liability_signed_cents",
    },
    operating_bank: {
      // Resolved inside the loop below (unlike the others, its subledger source is scoped to the
      // SPECIFIC account the role resolves to — see sumBankSubledgerCents's own comment).
      cents: null,
      source: "banking.bank_transactions.amount_cents (real, non-voided, this account only)",
    },
    unbilled_revenue: {
      cents: 0,
      source: "mdata.loads.rate_total_cents (delivered, not yet invoiced)",
    },
    prepaid_asset_default: {
      cents: 0,
      source: "accounting.prepaid_assets/prepaid_amortization_rows unamortized balance",
    },
    fixed_asset_default: {
      cents: 0,
      source: "accounting.fixed_assets net book value (purchase_price_cents - prior_accumulated_depr_cents)",
    },
  };

  const rows = await withCompanyScope(input.userId, input.operating_company_id, async (client) => {
    subledgerByRole.escrow_liability_default.cents = await sumEscrowSubledgerCents(client, input.operating_company_id);
    subledgerByRole.factoring_advance_liability.cents = await sumFactoringLiabilitySubledgerCents(
      client,
      input.operating_company_id,
      asOfDate
    );
    subledgerByRole.unbilled_revenue.cents = await sumUnbilledRevenueSubledgerCents(client, input.operating_company_id);
    subledgerByRole.fixed_asset_default.cents = await sumFixedAssetNetBookValueSubledgerCents(client, input.operating_company_id);
    subledgerByRole.prepaid_asset_default.cents = await sumPrepaidSubledgerCents(client, input.operating_company_id);

    const built: SubledgerGlControlRecRow[] = [];
    for (const role of SUBLEDGER_GL_CONTROL_ROLES) {
      const controlAccountId = await resolveRoleAccountOptional(client, input.operating_company_id, role);
      const controlBalanceCents =
        controlAccountId != null
          ? await loadControlBalanceCents(client, input.operating_company_id, asOfDate, controlAccountId)
          : null;
      // operating_bank's subledger is scoped to THIS specific account, so it can only be computed
      // once controlAccountId is known — every other role's subledger is company-wide and was
      // already precomputed above.
      if (role === "operating_bank" && controlAccountId != null) {
        subledgerByRole.operating_bank.cents = await sumBankSubledgerCents(client, input.operating_company_id, controlAccountId);
      }
      const subledger = subledgerByRole[role];
      built.push(
        buildSubledgerGlControlRecRow({
          role,
          control_account_id: controlAccountId,
          control_balance_cents: controlBalanceCents,
          subledger_balance_cents: subledger.cents,
          subledger_source: subledger.source,
        })
      );
    }
    return built;
  });

  return {
    operating_company_id: input.operating_company_id,
    as_of_date: asOfDate,
    rows,
    generated_at: new Date().toISOString(),
  };
}
