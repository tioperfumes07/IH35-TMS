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

/** Standing control roles reconciled by this report (TRANSP + USMCA per-opco). */
export const SUBLEDGER_GL_CONTROL_ROLES = [
  "ar_control",
  "ap_control",
  "escrow_liability_default",
  "factoring_advance_liability",
] as const satisfies readonly CoaRole[];

export type SubledgerGlControlRole = (typeof SUBLEDGER_GL_CONTROL_ROLES)[number];

export type SubledgerGlControlRecStatus = "tied" | "variance";

export type SubledgerGlControlRecRow = {
  role: SubledgerGlControlRole;
  control_account_id: string | null;
  control_balance_cents: number | null;
  subledger_balance_cents: number;
  variance_cents: number;
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

/** Pure — RECON-01: flag every non-zero cent; no tolerance. */
export function deriveSubledgerGlControlRecStatus(varianceCents: number): SubledgerGlControlRecStatus {
  return varianceCents === 0 ? "tied" : "variance";
}

/** Pure row builder (guard selftest + unit tests). variance = control − subledger. */
export function buildSubledgerGlControlRecRow(input: {
  role: SubledgerGlControlRole;
  control_account_id: string | null;
  control_balance_cents: number | null;
  subledger_balance_cents: number;
  subledger_source: string;
}): SubledgerGlControlRecRow {
  const control = input.control_balance_cents ?? 0;
  const variance_cents = control - input.subledger_balance_cents;
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
async function loadControlBalanceCents(
  client: DbClient,
  operatingCompanyId: string,
  asOfDate: string,
  controlAccountId: string
): Promise<number> {
  const res = await client.query<{ closing_balance_cents: string | number; normal_balance: string }>(
    `
      SELECT closing_balance_cents::bigint AS closing_balance_cents, normal_balance
      FROM accounting.fn_account_balances_as_of($1::uuid, $2::date, NULL::date)
      WHERE account_id = $3::uuid
      LIMIT 1
    `,
    [operatingCompanyId, asOfDate, controlAccountId]
  );
  const row = res.rows[0];
  if (!row) return 0;
  const raw = Number(row.closing_balance_cents ?? 0);
  return row.normal_balance === "credit" ? -raw : raw;
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

  const subledgerByRole: Record<SubledgerGlControlRole, { cents: number; source: string }> = {
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
  };

  const rows = await withCompanyScope(input.userId, input.operating_company_id, async (client) => {
    subledgerByRole.escrow_liability_default.cents = await sumEscrowSubledgerCents(client, input.operating_company_id);
    subledgerByRole.factoring_advance_liability.cents = await sumFactoringLiabilitySubledgerCents(
      client,
      input.operating_company_id,
      asOfDate
    );

    const built: SubledgerGlControlRecRow[] = [];
    for (const role of SUBLEDGER_GL_CONTROL_ROLES) {
      const controlAccountId = await resolveRoleAccountOptional(client, input.operating_company_id, role);
      const controlBalanceCents =
        controlAccountId != null
          ? await loadControlBalanceCents(client, input.operating_company_id, asOfDate, controlAccountId)
          : null;
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
