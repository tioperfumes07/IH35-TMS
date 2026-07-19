/**
 * 0280-05-factoring-balance-invoice-linkage — read-only Factoring Balance contract.
 *
 * CPA VETO (2026-07-19, head bb8b80f9f):
 *   - Per-factor / per-advance JE + source-link artifacts only (never company-wide role rollup).
 *   - Canonical active factor = EXACTLY one distinct factoring_company_vendor_id across
 *     customers ∪ non-void funded advances. Mixed/transition → fail closed.
 *   - No majority-customer inference; no vendor-name match; no hard-coded UUIDs.
 *   - Never clamp debit-liability / over-released-reserve to $0 — accounting_exception + signed diagnostics.
 *   - As-of = companyBusinessDate (America/Chicago); future-dated JEs excluded.
 *   - Lifecycle from source_transaction_type / TSL / reserve_movements — not account co-occurrence.
 *
 * No new GL math. Posting flags OFF. No QBO write-back.
 */

import { companyBusinessDate } from "../lib/company-business-date.js";

export type DbClient = {
  query: <T = Record<string, unknown>>(
    sql: string,
    values?: unknown[]
  ) => Promise<{ rows: T[] }>;
};

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
    "mdata.vendors",
    "mdata.customers",
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
};

/**
 * TRANSP contract entity + canonical single active factor.
 * Active factor = EXACTLY one distinct factoring_company_vendor_id across
 * (customers with assignment) ∪ (non-void funded advances). Mixed/transition → fail closed.
 * No majority inference. No vendor-name match. No hard-coded UUIDs.
 */
export async function resolveFaroFactorIdentity(
  client: DbClient,
  operatingCompanyId: string
): Promise<ActiveFactorIdentity> {
  return resolveCanonicalActiveFactor(client, operatingCompanyId);
}

export async function resolveCanonicalActiveFactor(
  client: DbClient,
  operatingCompanyId: string
): Promise<ActiveFactorIdentity> {
  const company = await client.query<{ code: string; legal_name: string }>(
    `
      SELECT code, legal_name
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
    };
  }
  const code = String(row.code ?? "");
  const legal = String(row.legal_name ?? "");
  const isTranspContractEntity =
    /^TRANSP\b/i.test(code) ||
    (/TRANSPORTATION/i.test(legal) && /IH\s*35/i.test(legal));
  if (!isTranspContractEntity) {
    return {
      ok: false,
      reason: "faro_contract_entity_mismatch",
      operatingCompanyId,
      companyCode: code,
      vendorId: null,
      vendorName: null,
    };
  }

  const factors = await client.query<{ vendor_id: string; vendor_name: string }>(
    `
      WITH candidates AS (
        SELECT c.factoring_company_vendor_id AS vendor_id
        FROM mdata.customers c
        WHERE c.operating_company_id = $1::uuid
          AND c.factoring_company_vendor_id IS NOT NULL
        UNION
        SELECT fa.factoring_company_vendor_id AS vendor_id
        FROM accounting.factoring_advances fa
        WHERE fa.operating_company_id = $1::uuid
          AND fa.factoring_company_vendor_id IS NOT NULL
          AND fa.advanced_at IS NOT NULL
          AND fa.status <> 'voided'
      )
      SELECT v.id::text AS vendor_id, v.vendor_name
      FROM candidates c
      JOIN mdata.vendors v
        ON v.id = c.vendor_id
       AND v.operating_company_id = $1::uuid
       AND v.deactivated_at IS NULL
      GROUP BY v.id, v.vendor_name
      ORDER BY v.id::text ASC
    `,
    [operatingCompanyId]
  );

  if (factors.rows.length === 0) {
    return {
      ok: false,
      reason: "active_factor_identity_unavailable",
      operatingCompanyId,
      companyCode: code,
      vendorId: null,
      vendorName: null,
    };
  }
  if (factors.rows.length > 1) {
    return {
      ok: false,
      reason: "mixed_factor_assignment",
      operatingCompanyId,
      companyCode: code,
      vendorId: factors.rows[0]?.vendor_id ?? null,
      vendorName: factors.rows[0]?.vendor_name ?? null,
    };
  }

  const vendor = factors.rows[0]!;
  return {
    ok: true,
    reason: null,
    operatingCompanyId,
    companyCode: code,
    vendorId: vendor.vendor_id,
    vendorName: vendor.vendor_name,
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
  }>(
    `
      SELECT
        to_regclass('accounting.factoring_advances') IS NOT NULL AS advances_ok,
        to_regclass('accounting.invoices') IS NOT NULL AS invoices_ok,
        to_regclass('accounting.journal_entry_postings') IS NOT NULL AS jep_ok,
        to_regclass('accounting.journal_entries') IS NOT NULL AS je_ok,
        to_regclass('accounting.chart_of_accounts_roles') IS NOT NULL AS roles_ok,
        to_regclass('views.factoring_balance_invoice_linkage') IS NOT NULL AS view_ok
    `
  );
  const row = rel.rows[0];
  if (!row?.advances_ok) return { ok: false, reason: "missing_table:accounting.factoring_advances" };
  if (!row.invoices_ok) return { ok: false, reason: "missing_table:accounting.invoices" };
  if (!row.jep_ok) return { ok: false, reason: "missing_table:accounting.journal_entry_postings" };
  if (!row.je_ok) return { ok: false, reason: "missing_table:accounting.journal_entries" };
  if (!row.roles_ok) return { ok: false, reason: "missing_table:accounting.chart_of_accounts_roles" };
  if (!row.view_ok) return { ok: false, reason: "missing_view:views.factoring_balance_invoice_linkage" };
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

  const identity = await resolveCanonicalActiveFactor(client, operatingCompanyId);
  const idMeta = {
    vendorId: identity.vendorId,
    vendorName: identity.vendorName,
    companyCode: identity.companyCode,
    asOf,
  };
  if (!identity.ok) {
    return nullHeadline("unverifiable", identity.reason ?? "active_factor_identity_unavailable", idMeta);
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
};
