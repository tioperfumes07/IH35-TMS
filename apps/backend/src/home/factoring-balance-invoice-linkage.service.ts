/**
 * 0280-05-factoring-balance-invoice-linkage — read-only Factoring Balance contract.
 *
 * CPA VETO (2026-07-19, heads bb8b80f9f → ee7ba85ee → this revision):
 *   - Per-factor / per-advance JE + source-link artifacts only (never company-wide role rollup).
 *   - Faro identity = owner-seeded factoring.canonical_factor_agreements (FARO_FULL_RECOURSE_V1)
 *     effective as-of companyBusinessDate + locked full-recourse terms on the bound factoring.factor
 *     profile. NEVER label a generic sole factor as Faro. No display-name match, no majority
 *     inference, no invented UUIDs. Absent/ambiguous/expired/wrong-terms → typed unverifiable.
 *   - Never clamp debit-liability / over-released-reserve to $0 — accounting_exception + signed diagnostics.
 *   - As-of = companyBusinessDate (America/Chicago); future-dated JEs excluded.
 *   - Lifecycle from source_transaction_type / TSL / reserve_movements — not account co-occurrence.
 *
 * No new GL math. Posting flags OFF. No QBO write-back.
 */

import { companyBusinessDate } from "../lib/company-business-date.js";
import {
  FACTORING_DEFAULT_INTEREST_DAILY_RATE,
  FACTORING_GRACE_DAYS,
  FACTORING_REPURCHASE_DEADLINE_DAYS,
  FACTORING_REPURCHASE_TERM_DAYS,
  FACTORING_SECURITY_RESERVE_RATIO,
  FACTORING_TIER1_RATIO,
  FACTORING_TIER2_RATIO,
} from "../accounting/factoring-posting/contract-config.js";

/** Owner-seeded agreement_code for the locked Faro full-recourse contract (TRANSP). */
export const FARO_FULL_RECOURSE_AGREEMENT_CODE = "FARO_FULL_RECOURSE_V1";

export type DbClient = {
  query: <T = Record<string, unknown>>(
    sql: string,
    values?: unknown[]
  ) => Promise<{ rows: T[] }>;
};

/** Retry read queries that lose a Postgres deadlock race (40P01) against concurrent agreement seeds. */
async function queryWithDeadlockRetry<T>(
  client: DbClient,
  sql: string,
  values: unknown[],
  attempts = 3
): Promise<{ rows: T[] }> {
  let last: unknown;
  for (let i = 0; i < attempts; i++) {
    try {
      return await client.query<T>(sql, values);
    } catch (err) {
      last = err;
      const code = (err as { code?: string } | null)?.code;
      if (code !== "40P01" || i === attempts - 1) throw err;
      await new Promise((r) => setTimeout(r, 25 * (i + 1)));
    }
  }
  throw last;
}

export type FactoringBalanceStatus = "ok" | "empty" | "unverifiable" | "accounting_exception";

export type FactoringBalanceDiagnostics = {
  as_of_business_date: string;
  liability_credits_cents: number;
  liability_debits_settled_cents: number;
  liability_debits_recourse_cents: number;
  /** Signed — negative means debit-liability anomaly (never clamped to 0). */
  outstanding_liability_signed_cents: number;
  reserve_debits_cents: number;
  reserve_credits_cents: number;
  /** Signed — negative means reserve over-release anomaly (never clamped to 0). */
  reserve_receivable_signed_cents: number;
  orphan_liability_role_cents: number;
  orphan_reserve_role_cents: number;
};

export type FactoringBalanceMeta = {
  liability_label: "outstanding_secured_borrowing_liability";
  reserve_label: "factoring_reserve_receivable_asset";
  formula: string;
  sources: string[];
  never_net_reserve_into_liability: true;
  ar_remains_on_books: true;
  liability_from_status: false;
  reserve_from_status: false;
  never_clamp_anomaly_to_zero: true;
  active_factor_vendor_id: string | null;
  active_factor_vendor_name: string | null;
  company_code: string | null;
  as_of_business_date: string | null;
  /** @deprecated alias — same as active_factor_vendor_id (TRANSP Faro contract semantics). */
  faro_factor_vendor_id: string | null;
  faro_factor_vendor_name: string | null;
};

export type FactoringBalanceInvoiceLinkageResult = {
  status: FactoringBalanceStatus;
  unverifiable_reason: string | null;
  /** Credit balance owed active factor (integer cents). Null when unverifiable/exception. */
  outstanding_liability_cents: number | null;
  /** Separate short-term reserve receivable (integer cents). Null when unverifiable/exception. */
  reserve_receivable_cents: number | null;
  /** COUNT(DISTINCT accounting.invoices.id) for active-factor funded advances. */
  invoice_count: number | null;
  funded_cents: number | null;
  settled_cents: number | null;
  recourse_buyback_cents: number | null;
  funded_advance_count: number | null;
  diagnostics: FactoringBalanceDiagnostics | null;
  meta: FactoringBalanceMeta;
};

const BASE_META: Omit<
  FactoringBalanceMeta,
  | "active_factor_vendor_id"
  | "active_factor_vendor_name"
  | "faro_factor_vendor_id"
  | "faro_factor_vendor_name"
  | "company_code"
  | "as_of_business_date"
> = {
  liability_label: "outstanding_secured_borrowing_liability",
  reserve_label: "factoring_reserve_receivable_asset",
  formula:
    "outstanding_liability_signed = liability_credits(factoring_advance|default_interest) - settled(factoring_customer_payment) - recourse(factoring_chargeback) via advance-linked JE legs only; reserve_signed = held - released via advance-linked legs; never netted; never from mutable status; never clamp anomalies to 0; as_of=companyBusinessDate",
  sources: [
    "accounting.journal_entry_postings.source_transaction_type",
    "accounting.transaction_source_links",
    "accounting.factoring_reserve_movements",
    "accounting.journal_entries",
    "accounting.chart_of_accounts_roles",
    "accounting.factoring_advances",
    "accounting.invoices",
    "factoring.canonical_factor_agreements",
    "factoring.factor",
    "mdata.vendors",
    "org.companies",
    "views.factoring_balance_invoice_linkage",
  ],
  never_net_reserve_into_liability: true,
  ar_remains_on_books: true,
  liability_from_status: false,
  reserve_from_status: false,
  never_clamp_anomaly_to_zero: true,
};

function metaWith(identity: {
  vendorId: string | null;
  vendorName: string | null;
  companyCode: string | null;
  asOf: string | null;
}): FactoringBalanceMeta {
  return {
    ...BASE_META,
    active_factor_vendor_id: identity.vendorId,
    active_factor_vendor_name: identity.vendorName,
    faro_factor_vendor_id: identity.vendorId,
    faro_factor_vendor_name: identity.vendorName,
    company_code: identity.companyCode,
    as_of_business_date: identity.asOf,
  };
}

export type ActiveFactorIdentity = {
  ok: boolean;
  reason: string | null;
  operatingCompanyId: string;
  companyCode: string | null;
  vendorId: string | null;
  vendorName: string | null;
  agreementId?: string | null;
  factorProfileId?: string | null;
};

function ratesMatch(a: number, b: number): boolean {
  return Math.abs(a - b) < 1e-9;
}

function profileMatchesLockedFaroTerms(profile: {
  fee_rate: number;
  reserve_rate: number;
  recourse_days: number;
}): boolean {
  const feeOk =
    ratesMatch(profile.fee_rate, FACTORING_TIER1_RATIO) ||
    ratesMatch(profile.fee_rate, FACTORING_TIER2_RATIO);
  return (
    feeOk &&
    ratesMatch(profile.reserve_rate, FACTORING_SECURITY_RESERVE_RATIO) &&
    profile.recourse_days === FACTORING_REPURCHASE_DEADLINE_DAYS
  );
}

function agreementTermsMatchLockedFaro(row: {
  is_full_recourse: boolean;
  fee_rate_tier1: number;
  fee_rate_tier2: number;
  reserve_rate: number;
  repurchase_term_days: number;
  grace_days: number;
  repurchase_deadline_days: number;
  default_interest_daily_rate: number;
}): boolean {
  return (
    row.is_full_recourse === true &&
    ratesMatch(row.fee_rate_tier1, FACTORING_TIER1_RATIO) &&
    ratesMatch(row.fee_rate_tier2, FACTORING_TIER2_RATIO) &&
    ratesMatch(row.reserve_rate, FACTORING_SECURITY_RESERVE_RATIO) &&
    row.repurchase_term_days === FACTORING_REPURCHASE_TERM_DAYS &&
    row.grace_days === FACTORING_GRACE_DAYS &&
    row.repurchase_deadline_days === FACTORING_REPURCHASE_DEADLINE_DAYS &&
    ratesMatch(row.default_interest_daily_rate, FACTORING_DEFAULT_INTEREST_DAILY_RATE)
  );
}

/**
 * TRANSP contract entity (canonical company code only) + owner-seeded Faro agreement.
 * Never labels a generic sole factor as Faro. No majority / display-name / legal-name /
 * invented UUIDs.
 */
export async function resolveFaroFactorIdentity(
  client: DbClient,
  operatingCompanyId: string,
  asOfBusinessDate?: string
): Promise<ActiveFactorIdentity> {
  return resolveCanonicalActiveFactor(client, operatingCompanyId, asOfBusinessDate);
}

/** Canonical Faro contract entity gate — company.code prefix only (never legal_name inference). */
export function isTranspContractEntityCode(code: string | null | undefined): boolean {
  return /^TRANSP\b/i.test(String(code ?? ""));
}

export async function resolveCanonicalActiveFactor(
  client: DbClient,
  operatingCompanyId: string,
  asOfBusinessDate?: string
): Promise<ActiveFactorIdentity> {
  const asOf = asOfBusinessDate ?? companyBusinessDate();
  const company = await client.query<{ code: string }>(
    `
      SELECT code
      FROM org.companies
      WHERE id = $1::uuid
        AND is_active = true
      LIMIT 1
    `,
    [operatingCompanyId]
  );
  const row = company.rows[0];
  if (!row) {
    return {
      ok: false,
      reason: "missing_operating_company",
      operatingCompanyId,
      companyCode: null,
      vendorId: null,
      vendorName: null,
      agreementId: null,
      factorProfileId: null,
    };
  }
  const code = String(row.code ?? "");
  if (!isTranspContractEntityCode(code)) {
    return {
      ok: false,
      reason: "faro_contract_entity_mismatch",
      operatingCompanyId,
      companyCode: code,
      vendorId: null,
      vendorName: null,
      agreementId: null,
      factorProfileId: null,
    };
  }

  const agreementTable = await client.query<{ ok: boolean }>(
    `SELECT to_regclass('factoring.canonical_factor_agreements') IS NOT NULL AS ok`
  );
  if (!agreementTable.rows[0]?.ok) {
    return {
      ok: false,
      reason: "missing_faro_agreement_binding",
      operatingCompanyId,
      companyCode: code,
      vendorId: null,
      vendorName: null,
      agreementId: null,
      factorProfileId: null,
    };
  }

  // Effective window: as_of ∈ [effective_from, effective_to] (NULL effective_to = open-ended).
  // Overlapping/ambiguous bindings → fail closed (never pick by majority or name).
  // 40P01 retry: concurrent agreement/profile/vendor seeders (CI forks; rare owner re-seed) can
  // deadlock this JOIN — fail-closed retry, never invent a binding.
  const bindings = await queryWithDeadlockRetry<{
    agreement_id: string;
    factor_profile_id: string;
    factor_vendor_id: string;
    vendor_name: string;
    is_full_recourse: boolean;
    fee_rate_tier1: string;
    fee_rate_tier2: string;
    reserve_rate: string;
    repurchase_term_days: number;
    grace_days: number;
    repurchase_deadline_days: number;
    default_interest_daily_rate: string;
    profile_fee_rate: string;
    profile_reserve_rate: string;
    profile_recourse_days: number;
    profile_active: boolean;
  }>(
    client,
    `
      SELECT
        a.id::text AS agreement_id,
        a.factor_profile_id::text AS factor_profile_id,
        a.factor_vendor_id::text AS factor_vendor_id,
        v.vendor_name,
        a.is_full_recourse,
        a.fee_rate_tier1::text,
        a.fee_rate_tier2::text,
        a.reserve_rate::text,
        a.repurchase_term_days,
        a.grace_days,
        a.repurchase_deadline_days,
        a.default_interest_daily_rate::text,
        f.fee_rate::text AS profile_fee_rate,
        f.reserve_rate::text AS profile_reserve_rate,
        f.recourse_days AS profile_recourse_days,
        f.active AS profile_active
      FROM factoring.canonical_factor_agreements a
      JOIN factoring.factor f
        ON f.id = a.factor_profile_id
       AND f.tenant_id = a.tenant_id
      JOIN mdata.vendors v
        ON v.id = a.factor_vendor_id
       AND v.operating_company_id = a.tenant_id
       AND v.deactivated_at IS NULL
      WHERE a.tenant_id = $1::uuid
        AND a.agreement_code = $2
        AND a.voided_at IS NULL
        AND a.effective_from <= $3::date
        AND (a.effective_to IS NULL OR a.effective_to >= $3::date)
      ORDER BY a.effective_from DESC, a.id::text ASC
    `,
    [operatingCompanyId, FARO_FULL_RECOURSE_AGREEMENT_CODE, asOf]
  );

  if (bindings.rows.length === 0) {
    // Distinguish never-seeded / VOIDED-current (→ missing) vs a merely not-yet/expired live binding
    // (→ not_effective). Classifier ordering law (PR #2724 CR VETO): a VOID/archive of the binding that
    // WOULD be effective as-of the date means the agreement is gone → missing_faro_agreement_binding.
    // A stale future/expired sibling row (e.g. an earlier ambiguity-test leftover) must NEVER short-circuit
    // that void→missing verdict. Only a *non-voided* out-of-window binding, with NO voided-current binding,
    // yields faro_agreement_not_effective.
    const anyBinding = await queryWithDeadlockRetry<{
      live_future_n: string;
      live_expired_n: string;
      voided_current_n: string;
    }>(
      client,
      `
        SELECT
          COUNT(*) FILTER (
            WHERE voided_at IS NULL AND effective_from > $2::date
          )::text AS live_future_n,
          COUNT(*) FILTER (
            WHERE voided_at IS NULL AND effective_to IS NOT NULL AND effective_to < $2::date
          )::text AS live_expired_n,
          COUNT(*) FILTER (
            WHERE voided_at IS NOT NULL
              AND effective_from <= $2::date
              AND (effective_to IS NULL OR effective_to >= $2::date)
          )::text AS voided_current_n
        FROM factoring.canonical_factor_agreements
        WHERE tenant_id = $1::uuid
          AND agreement_code = $3
      `,
      [operatingCompanyId, asOf, FARO_FULL_RECOURSE_AGREEMENT_CODE]
    );
    const liveFutureN = Number(anyBinding.rows[0]?.live_future_n ?? 0);
    const liveExpiredN = Number(anyBinding.rows[0]?.live_expired_n ?? 0);
    const voidedCurrentN = Number(anyBinding.rows[0]?.voided_current_n ?? 0);
    // Void/archive of the as-of binding wins: it is missing, not merely "not yet / expired".
    let reason = "missing_faro_agreement_binding";
    if (voidedCurrentN === 0 && (liveFutureN > 0 || liveExpiredN > 0)) {
      reason = "faro_agreement_not_effective";
    }
    return {
      ok: false,
      reason,
      operatingCompanyId,
      companyCode: code,
      vendorId: null,
      vendorName: null,
      agreementId: null,
      factorProfileId: null,
    };
  }

  const distinctVendors = new Set(bindings.rows.map((b) => b.factor_vendor_id));
  if (bindings.rows.length > 1 || distinctVendors.size > 1) {
    return {
      ok: false,
      reason: "ambiguous_faro_agreement_binding",
      operatingCompanyId,
      companyCode: code,
      vendorId: bindings.rows[0]?.factor_vendor_id ?? null,
      vendorName: bindings.rows[0]?.vendor_name ?? null,
      agreementId: bindings.rows[0]?.agreement_id ?? null,
      factorProfileId: bindings.rows[0]?.factor_profile_id ?? null,
    };
  }

  const binding = bindings.rows[0]!;
  const agreementOk = agreementTermsMatchLockedFaro({
    is_full_recourse: binding.is_full_recourse,
    fee_rate_tier1: Number(binding.fee_rate_tier1),
    fee_rate_tier2: Number(binding.fee_rate_tier2),
    reserve_rate: Number(binding.reserve_rate),
    repurchase_term_days: Number(binding.repurchase_term_days),
    grace_days: Number(binding.grace_days),
    repurchase_deadline_days: Number(binding.repurchase_deadline_days),
    default_interest_daily_rate: Number(binding.default_interest_daily_rate),
  });
  const profileOk =
    binding.profile_active === true &&
    profileMatchesLockedFaroTerms({
      fee_rate: Number(binding.profile_fee_rate),
      reserve_rate: Number(binding.profile_reserve_rate),
      recourse_days: Number(binding.profile_recourse_days),
    });
  if (!agreementOk || !profileOk) {
    return {
      ok: false,
      reason: "faro_agreement_terms_mismatch",
      operatingCompanyId,
      companyCode: code,
      vendorId: binding.factor_vendor_id,
      vendorName: binding.vendor_name,
      agreementId: binding.agreement_id,
      factorProfileId: binding.factor_profile_id,
    };
  }

  return {
    ok: true,
    reason: null,
    operatingCompanyId,
    companyCode: code,
    vendorId: binding.factor_vendor_id,
    vendorName: binding.vendor_name,
    agreementId: binding.agreement_id,
    factorProfileId: binding.factor_profile_id,
  };
}

async function probeCanonicalSurface(client: DbClient): Promise<{ ok: boolean; reason: string | null }> {
  const rel = await client.query<{
    advances_ok: boolean;
    invoices_ok: boolean;
    jep_ok: boolean;
    je_ok: boolean;
    roles_ok: boolean;
    view_ok: boolean;
    agreements_ok: boolean;
    factor_ok: boolean;
  }>(
    `
      SELECT
        to_regclass('accounting.factoring_advances') IS NOT NULL AS advances_ok,
        to_regclass('accounting.invoices') IS NOT NULL AS invoices_ok,
        to_regclass('accounting.journal_entry_postings') IS NOT NULL AS jep_ok,
        to_regclass('accounting.journal_entries') IS NOT NULL AS je_ok,
        to_regclass('accounting.chart_of_accounts_roles') IS NOT NULL AS roles_ok,
        to_regclass('views.factoring_balance_invoice_linkage') IS NOT NULL AS view_ok,
        to_regclass('factoring.canonical_factor_agreements') IS NOT NULL AS agreements_ok,
        to_regclass('factoring.factor') IS NOT NULL AS factor_ok
    `
  );
  const row = rel.rows[0];
  if (!row?.advances_ok) return { ok: false, reason: "missing_table:accounting.factoring_advances" };
  if (!row.invoices_ok) return { ok: false, reason: "missing_table:accounting.invoices" };
  if (!row.jep_ok) return { ok: false, reason: "missing_table:accounting.journal_entry_postings" };
  if (!row.je_ok) return { ok: false, reason: "missing_table:accounting.journal_entries" };
  if (!row.roles_ok) return { ok: false, reason: "missing_table:accounting.chart_of_accounts_roles" };
  if (!row.view_ok) return { ok: false, reason: "missing_view:views.factoring_balance_invoice_linkage" };
  if (!row.factor_ok) return { ok: false, reason: "missing_table:factoring.factor" };
  if (!row.agreements_ok) return { ok: false, reason: "missing_faro_agreement_binding" };
  return { ok: true, reason: null };
}

function nullHeadline(
  status: FactoringBalanceStatus,
  reason: string,
  identity: {
    vendorId: string | null;
    vendorName: string | null;
    companyCode: string | null;
    asOf: string | null;
  },
  diagnostics: FactoringBalanceDiagnostics | null = null
): FactoringBalanceInvoiceLinkageResult {
  return {
    status,
    unverifiable_reason: reason,
    outstanding_liability_cents: null,
    reserve_receivable_cents: null,
    invoice_count: null,
    funded_cents: null,
    settled_cents: null,
    recourse_buyback_cents: null,
    funded_advance_count: null,
    diagnostics,
    meta: metaWith(identity),
  };
}

function emptyResult(identity: {
  vendorId: string | null;
  vendorName: string | null;
  companyCode: string | null;
  asOf: string | null;
}): FactoringBalanceInvoiceLinkageResult {
  return {
    status: "empty",
    unverifiable_reason: null,
    outstanding_liability_cents: 0,
    reserve_receivable_cents: 0,
    invoice_count: 0,
    funded_cents: 0,
    settled_cents: 0,
    recourse_buyback_cents: 0,
    funded_advance_count: 0,
    diagnostics: {
      as_of_business_date: identity.asOf ?? companyBusinessDate(),
      liability_credits_cents: 0,
      liability_debits_settled_cents: 0,
      liability_debits_recourse_cents: 0,
      outstanding_liability_signed_cents: 0,
      reserve_debits_cents: 0,
      reserve_credits_cents: 0,
      reserve_receivable_signed_cents: 0,
      orphan_liability_role_cents: 0,
      orphan_reserve_role_cents: 0,
    },
    meta: metaWith(identity),
  };
}

type ArtifactRollup = {
  liability_credits_cents: string | number;
  liability_debits_settled_cents: string | number;
  liability_debits_recourse_cents: string | number;
  outstanding_liability_signed_cents: string | number;
  reserve_debits_cents: string | number;
  reserve_credits_cents: string | number;
  reserve_receivable_signed_cents: string | number;
  invoice_count: string | number;
  funded_advance_count: string | number;
  factor_advances_without_funding_artifact: string | number;
  factor_advances_with_reserve_missing_held_artifact: string | number;
  orphan_liability_role_cents: string | number;
  orphan_reserve_role_cents: string | number;
  as_of_business_date: string;
};

export async function computeFactoringBalanceInvoiceLinkage(
  client: DbClient,
  input: { operatingCompanyId: string; asOfBusinessDate?: string }
): Promise<FactoringBalanceInvoiceLinkageResult> {
  const { operatingCompanyId } = input;
  const asOf = input.asOfBusinessDate ?? companyBusinessDate();

  const probe = await probeCanonicalSurface(client);
  if (!probe.ok) {
    return nullHeadline("unverifiable", probe.reason ?? "canonical_factoring_balance_unverifiable", {
      vendorId: null,
      vendorName: null,
      companyCode: null,
      asOf,
    });
  }

  const identity = await resolveCanonicalActiveFactor(client, operatingCompanyId, asOf);
  const idMeta = {
    vendorId: identity.vendorId,
    vendorName: identity.vendorName,
    companyCode: identity.companyCode,
    asOf,
  };
  if (!identity.ok) {
    return nullHeadline("unverifiable", identity.reason ?? "missing_faro_agreement_binding", idMeta);
  }

  const roles = await client.query<{ role: string; account_id: string }>(
    `
      SELECT role, account_id::text AS account_id
      FROM accounting.chart_of_accounts_roles
      WHERE operating_company_id = $1::uuid
        AND is_active = true
        AND role = ANY($2::text[])
    `,
    [operatingCompanyId, ["factoring_advance_liability", "factor_reserve_held", "factoring_recoursed_ar"]]
  );
  const roleMap = new Map(roles.rows.map((r) => [r.role, r.account_id]));
  if (!roleMap.has("factoring_advance_liability")) {
    return nullHeadline("unverifiable", "missing_role_binding:factoring_advance_liability", idMeta);
  }
  if (!roleMap.has("factor_reserve_held")) {
    return nullHeadline("unverifiable", "missing_role_binding:factor_reserve_held", idMeta);
  }

  // Bound as-of for the security_invoker view (America/Chicago business date).
  await client.query(`SELECT set_config('app.factoring_balance_as_of', $1::text, true)`, [asOf]);

  const res = await client.query<ArtifactRollup>(
    `
      SELECT
        liability_credits_cents::bigint AS liability_credits_cents,
        liability_debits_settled_cents::bigint AS liability_debits_settled_cents,
        liability_debits_recourse_cents::bigint AS liability_debits_recourse_cents,
        outstanding_liability_signed_cents::bigint AS outstanding_liability_signed_cents,
        reserve_debits_cents::bigint AS reserve_debits_cents,
        reserve_credits_cents::bigint AS reserve_credits_cents,
        reserve_receivable_signed_cents::bigint AS reserve_receivable_signed_cents,
        invoice_count::int AS invoice_count,
        funded_advance_count::int AS funded_advance_count,
        factor_advances_without_funding_artifact::int AS factor_advances_without_funding_artifact,
        factor_advances_with_reserve_missing_held_artifact::int AS factor_advances_with_reserve_missing_held_artifact,
        orphan_liability_role_cents::bigint AS orphan_liability_role_cents,
        orphan_reserve_role_cents::bigint AS orphan_reserve_role_cents,
        as_of_business_date::text AS as_of_business_date
      FROM views.factoring_balance_invoice_linkage
      WHERE operating_company_id = $1::uuid
        AND factor_vendor_id = $2::uuid
      LIMIT 1
    `,
    [operatingCompanyId, identity.vendorId]
  );

  if (res.rows.length === 0) {
    return emptyResult(idMeta);
  }

  const row = res.rows[0]!;
  const funded = Number(row.liability_credits_cents ?? 0);
  const settled = Number(row.liability_debits_settled_cents ?? 0);
  const recourse = Number(row.liability_debits_recourse_cents ?? 0);
  const liabilitySigned = Number(row.outstanding_liability_signed_cents ?? funded - settled - recourse);
  const reserveHeld = Number(row.reserve_debits_cents ?? 0);
  const reserveReleased = Number(row.reserve_credits_cents ?? 0);
  const reserveSigned = Number(row.reserve_receivable_signed_cents ?? reserveHeld - reserveReleased);
  const invoiceCount = Number(row.invoice_count ?? 0);
  const advanceCount = Number(row.funded_advance_count ?? 0);
  const missingFunding = Number(row.factor_advances_without_funding_artifact ?? 0);
  const missingReserveHeld = Number(row.factor_advances_with_reserve_missing_held_artifact ?? 0);
  const orphanLiab = Number(row.orphan_liability_role_cents ?? 0);
  const orphanReserve = Number(row.orphan_reserve_role_cents ?? 0);

  const diagnostics: FactoringBalanceDiagnostics = {
    as_of_business_date: String(row.as_of_business_date ?? asOf),
    liability_credits_cents: funded,
    liability_debits_settled_cents: settled,
    liability_debits_recourse_cents: recourse,
    outstanding_liability_signed_cents: liabilitySigned,
    reserve_debits_cents: reserveHeld,
    reserve_credits_cents: reserveReleased,
    reserve_receivable_signed_cents: reserveSigned,
    orphan_liability_role_cents: orphanLiab,
    orphan_reserve_role_cents: orphanReserve,
  };

  if (
    ![
      funded,
      settled,
      recourse,
      liabilitySigned,
      reserveHeld,
      reserveReleased,
      reserveSigned,
      invoiceCount,
      advanceCount,
      orphanLiab,
      orphanReserve,
    ].every((n) => Number.isFinite(n) && Number.isInteger(n))
  ) {
    return nullHeadline("unverifiable", "non_integer_cents_or_count", idMeta, diagnostics);
  }

  if (missingFunding > 0) {
    return nullHeadline("unverifiable", "incomplete_funding_je_artifacts", idMeta, diagnostics);
  }
  if (missingReserveHeld > 0) {
    return nullHeadline("unverifiable", "incomplete_reserve_held_artifacts", idMeta, diagnostics);
  }

  // Orphan/unattributed liability or reserve role legs — never status=ok; never include in Faro headline.
  if (orphanLiab > 0 || orphanReserve > 0) {
    return nullHeadline(
      "unverifiable",
      orphanLiab > 0
        ? "orphan_unattributed_liability_role_legs"
        : "orphan_unattributed_reserve_role_legs",
      idMeta,
      diagnostics
    );
  }

  // Voided advance status with live unreverted JE legs — ledger/status inconsistency; fail closed.
  const voidedWithLiveJe = await client.query<{ n: string }>(
    `
      SELECT COUNT(*)::text AS n
        FROM accounting.factoring_advances fa
       WHERE fa.operating_company_id = $1::uuid
         AND fa.factoring_company_vendor_id = $2::uuid
         AND fa.status = 'voided'
         AND fa.advanced_at IS NOT NULL
         AND (fa.advanced_at AT TIME ZONE 'America/Chicago')::date <= $3::date
         AND EXISTS (
               SELECT 1
                 FROM accounting.journal_entry_postings jep
                 JOIN accounting.journal_entries je
                   ON je.id = jep.journal_entry_uuid
                  AND je.operating_company_id = jep.operating_company_id
                WHERE jep.operating_company_id = fa.operating_company_id
                  AND jep.source_transaction_id = fa.id::text
                  AND jep.source_transaction_type IN (
                    'factoring_advance',
                    'factoring_customer_payment',
                    'factoring_reserve_release',
                    'factoring_chargeback',
                    'factoring_default_interest'
                  )
                  AND je.status = 'posted'
                  AND je.voided_at IS NULL
                  AND je.reverses_je_id IS NULL
                  AND je.reversed_by_je_id IS NULL
             )
    `,
    [operatingCompanyId, identity.vendorId, asOf]
  );
  if (Number(voidedWithLiveJe.rows[0]?.n ?? 0) > 0) {
    return nullHeadline(
      "unverifiable",
      "voided_advance_without_reversing_je",
      idMeta,
      diagnostics
    );
  }

  // Never clamp — surface accounting_exception with signed diagnostics; headline stays null.
  if (liabilitySigned < 0) {
    return nullHeadline(
      "accounting_exception",
      "accounting_exception:debit_liability_anomaly",
      idMeta,
      diagnostics
    );
  }
  if (reserveSigned < 0) {
    return nullHeadline(
      "accounting_exception",
      "accounting_exception:reserve_over_release",
      idMeta,
      diagnostics
    );
  }

  if (funded === 0 && advanceCount === 0 && invoiceCount === 0 && reserveSigned === 0) {
    return emptyResult(idMeta);
  }

  return {
    status: "ok",
    unverifiable_reason: null,
    outstanding_liability_cents: liabilitySigned,
    reserve_receivable_cents: reserveSigned,
    invoice_count: invoiceCount,
    funded_cents: funded,
    settled_cents: settled,
    recourse_buyback_cents: recourse,
    funded_advance_count: advanceCount,
    diagnostics,
    meta: metaWith(idMeta),
  };
}

/** Pure helper — signed outstanding liability (never clamped). */
export function computeOutstandingLiabilityCents(parts: {
  funded_cents: number;
  settled_cents: number;
  recourse_buyback_cents: number;
}): number {
  return parts.funded_cents - parts.settled_cents - parts.recourse_buyback_cents;
}

/** Pure helper — signed reserve receivable; recourse alone must not zero. Never clamped. */
export function computeReserveReceivableCents(parts: {
  reserve_held_cents: number;
  reserve_released_cents: number;
}): number {
  return parts.reserve_held_cents - parts.reserve_released_cents;
}

/** Detect multi-invoice fanout: summing advance money after an invoice join multiplies. */
export function wouldFanoutMultiply(advanceCents: number, invoiceCountOnAdvance: number): number {
  return advanceCents * Math.max(1, invoiceCountOnAdvance);
}

/** Canonical invoice display_id for fixtures / contract checks (^INV-[0-9]{4}-[0-9]{5}$). */
export const INVOICE_DISPLAY_ID_RE = /^INV-[0-9]{4}-[0-9]{5}$/;

export function isCanonicalInvoiceDisplayId(value: string): boolean {
  return INVOICE_DISPLAY_ID_RE.test(value);
}

export const __test__ = {
  probeCanonicalSurface,
  nullHeadline,
  emptyResult,
  BASE_META,
  metaWith,
  resolveCanonicalActiveFactor,
  profileMatchesLockedFaroTerms,
  agreementTermsMatchLockedFaro,
  FARO_FULL_RECOURSE_AGREEMENT_CODE,
};
