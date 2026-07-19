/**
 * 0280-05-factoring-balance-invoice-linkage — read-only Factoring Balance contract.
 *
 * ROOT CAUSE: /home/factoring-balance read superseded views.factoring_summary (0124) from
 * never-written factoring_companies figures, with no invoice count and a silent $0 catch.
 *
 * FIX (independent VETO 2026-07-19):
 *   - Outstanding Faro LIABILITY from structural posted JE legs on
 *     chart_of_accounts_roles.role = 'factoring_advance_liability' (exclude voided/reversed JEs).
 *   - Reserve receivable from structural legs on role 'factor_reserve_held' (never netted).
 *   - Mutable advance/invoice statuses NEVER clear liability or zero reserve.
 *   - TRANSP + Faro factor identity from org.companies + mdata.customers/vendors (no hard-coded UUIDs).
 *   - Incomplete/missing artifacts → status=unverifiable (never fabricate zero).
 *   - invoice_count = COUNT(DISTINCT invoices.id) at Faro-vendor scope (money not JOIN-summed).
 *
 * No new GL math. Posting flags OFF. No QBO write-back. Reuses poster role accounts + JE spine.
 */

export type DbClient = {
  query: <T = Record<string, unknown>>(
    sql: string,
    values?: unknown[]
  ) => Promise<{ rows: T[] }>;
};

export type FactoringBalanceStatus = "ok" | "empty" | "unverifiable";

export type FactoringBalanceMeta = {
  liability_label: "outstanding_secured_borrowing_liability";
  reserve_label: "factoring_reserve_receivable_asset";
  formula: string;
  sources: string[];
  never_net_reserve_into_liability: true;
  ar_remains_on_books: true;
  liability_from_status: false;
  reserve_from_status: false;
  faro_factor_vendor_id: string | null;
  faro_factor_vendor_name: string | null;
  company_code: string | null;
};

export type FactoringBalanceInvoiceLinkageResult = {
  status: FactoringBalanceStatus;
  unverifiable_reason: string | null;
  /** Credit balance owed Faro (integer cents). Null when unverifiable. */
  outstanding_liability_cents: number | null;
  /** Separate short-term reserve receivable (integer cents). Null when unverifiable. */
  reserve_receivable_cents: number | null;
  /** COUNT(DISTINCT accounting.invoices.id) for Faro-scoped funded advances. */
  invoice_count: number | null;
  funded_cents: number | null;
  settled_cents: number | null;
  recourse_buyback_cents: number | null;
  funded_advance_count: number | null;
  meta: FactoringBalanceMeta;
};

const BASE_META: Omit<
  FactoringBalanceMeta,
  "faro_factor_vendor_id" | "faro_factor_vendor_name" | "company_code"
> = {
  liability_label: "outstanding_secured_borrowing_liability",
  reserve_label: "factoring_reserve_receivable_asset",
  formula:
    "outstanding_liability_cents = liability_credits - liability_debits (JE legs on factoring_advance_liability; voided/reversed excluded); reserve_receivable_cents = reserve_debits - reserve_credits (factor_reserve_held); never netted; never from mutable status",
  sources: [
    "accounting.journal_entry_postings",
    "accounting.journal_entries",
    "accounting.chart_of_accounts_roles",
    "accounting.factoring_advances",
    "accounting.invoices",
    "accounting.factoring_reserve_movements",
    "mdata.vendors",
    "mdata.customers",
    "org.companies",
    "views.factoring_balance_invoice_linkage",
  ],
  never_net_reserve_into_liability: true,
  ar_remains_on_books: true,
  liability_from_status: false,
  reserve_from_status: false,
};

function metaWith(
  identity: { vendorId: string | null; vendorName: string | null; companyCode: string | null }
): FactoringBalanceMeta {
  return {
    ...BASE_META,
    faro_factor_vendor_id: identity.vendorId,
    faro_factor_vendor_name: identity.vendorName,
    company_code: identity.companyCode,
  };
}

export type FaroFactorIdentity = {
  ok: boolean;
  reason: string | null;
  operatingCompanyId: string;
  companyCode: string | null;
  vendorId: string | null;
  vendorName: string | null;
};

/**
 * TRANSP/Faro contract identity — no hard-coded UUIDs.
 * Company must be TRANSP-class; active factor vendor (majority customer assignment) must be Faro-named.
 */
export async function resolveFaroFactorIdentity(
  client: DbClient,
  operatingCompanyId: string
): Promise<FaroFactorIdentity> {
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

  const factor = await client.query<{ id: string; vendor_name: string }>(
    `
      SELECT v.id::text AS id, v.vendor_name
      FROM mdata.vendors v
      JOIN (
        SELECT factoring_company_vendor_id AS vendor_id, COUNT(*)::int AS customer_count
        FROM mdata.customers
        WHERE operating_company_id = $1::uuid
          AND factoring_company_vendor_id IS NOT NULL
        GROUP BY factoring_company_vendor_id
        ORDER BY COUNT(*) DESC, factoring_company_vendor_id ASC
        LIMIT 1
      ) c ON c.vendor_id = v.id
      WHERE v.operating_company_id = $1::uuid
        AND v.deactivated_at IS NULL
      LIMIT 1
    `,
    [operatingCompanyId]
  );
  const vendor = factor.rows[0];
  if (!vendor?.id) {
    return {
      ok: false,
      reason: "faro_factor_identity_unavailable",
      operatingCompanyId,
      companyCode: code,
      vendorId: null,
      vendorName: null,
    };
  }
  if (!/\bfaro\b/i.test(String(vendor.vendor_name ?? ""))) {
    return {
      ok: false,
      reason: "active_factor_is_not_faro",
      operatingCompanyId,
      companyCode: code,
      vendorId: vendor.id,
      vendorName: vendor.vendor_name,
    };
  }
  return {
    ok: true,
    reason: null,
    operatingCompanyId,
    companyCode: code,
    vendorId: vendor.id,
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

function unverifiableResult(
  reason: string,
  identity: { vendorId: string | null; vendorName: string | null; companyCode: string | null }
): FactoringBalanceInvoiceLinkageResult {
  return {
    status: "unverifiable",
    unverifiable_reason: reason,
    outstanding_liability_cents: null,
    reserve_receivable_cents: null,
    invoice_count: null,
    funded_cents: null,
    settled_cents: null,
    recourse_buyback_cents: null,
    funded_advance_count: null,
    meta: metaWith(identity),
  };
}

function emptyResult(identity: {
  vendorId: string | null;
  vendorName: string | null;
  companyCode: string | null;
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
    meta: metaWith(identity),
  };
}

type ArtifactRollup = {
  liability_credits_cents: string | number;
  liability_debits_settled_cents: string | number;
  liability_debits_recourse_cents: string | number;
  reserve_debits_cents: string | number;
  reserve_credits_cents: string | number;
  invoice_count: string | number;
  funded_advance_count: string | number;
  faro_advances_without_funding_artifact: string | number;
  faro_advances_with_reserve_missing_held_artifact: string | number;
};

/**
 * Live JE predicate: posted, not voided, not a reversing entry, not replaced by a reversal.
 * Does not consult factoring_advances.status.
 */
const LIVE_JE_SQL = `
  je.status = 'posted'
  AND je.voided_at IS NULL
  AND je.reverses_je_id IS NULL
  AND je.reversed_by_je_id IS NULL
`;

export async function computeFactoringBalanceInvoiceLinkage(
  client: DbClient,
  input: { operatingCompanyId: string }
): Promise<FactoringBalanceInvoiceLinkageResult> {
  const { operatingCompanyId } = input;
  const probe = await probeCanonicalSurface(client);
  if (!probe.ok) {
    return unverifiableResult(probe.reason ?? "canonical_factoring_balance_unverifiable", {
      vendorId: null,
      vendorName: null,
      companyCode: null,
    });
  }

  const identity = await resolveFaroFactorIdentity(client, operatingCompanyId);
  if (!identity.ok) {
    return unverifiableResult(identity.reason ?? "faro_factor_identity_unavailable", {
      vendorId: identity.vendorId,
      vendorName: identity.vendorName,
      companyCode: identity.companyCode,
    });
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
    return unverifiableResult("missing_role_binding:factoring_advance_liability", {
      vendorId: identity.vendorId,
      vendorName: identity.vendorName,
      companyCode: identity.companyCode,
    });
  }
  if (!roleMap.has("factor_reserve_held")) {
    return unverifiableResult("missing_role_binding:factor_reserve_held", {
      vendorId: identity.vendorId,
      vendorName: identity.vendorName,
      companyCode: identity.companyCode,
    });
  }

  // Prefer the security_invoker view (migration) — it encodes the same artifact joins.
  const res = await client.query<ArtifactRollup>(
    `
      SELECT
        liability_credits_cents::bigint AS liability_credits_cents,
        liability_debits_settled_cents::bigint AS liability_debits_settled_cents,
        liability_debits_recourse_cents::bigint AS liability_debits_recourse_cents,
        reserve_debits_cents::bigint AS reserve_debits_cents,
        reserve_credits_cents::bigint AS reserve_credits_cents,
        invoice_count::int AS invoice_count,
        funded_advance_count::int AS funded_advance_count,
        faro_advances_without_funding_artifact::int AS faro_advances_without_funding_artifact,
        faro_advances_with_reserve_missing_held_artifact::int AS faro_advances_with_reserve_missing_held_artifact
      FROM views.factoring_balance_invoice_linkage
      WHERE operating_company_id = $1::uuid
        AND faro_factor_vendor_id = $2::uuid
      LIMIT 1
    `,
    [operatingCompanyId, identity.vendorId]
  );

  if (res.rows.length === 0) {
    return emptyResult({
      vendorId: identity.vendorId,
      vendorName: identity.vendorName,
      companyCode: identity.companyCode,
    });
  }

  const row = res.rows[0]!;
  const funded = Number(row.liability_credits_cents ?? 0);
  const settled = Number(row.liability_debits_settled_cents ?? 0);
  const recourse = Number(row.liability_debits_recourse_cents ?? 0);
  const reserveHeld = Number(row.reserve_debits_cents ?? 0);
  const reserveReleased = Number(row.reserve_credits_cents ?? 0);
  const invoiceCount = Number(row.invoice_count ?? 0);
  const advanceCount = Number(row.funded_advance_count ?? 0);
  const missingFunding = Number(row.faro_advances_without_funding_artifact ?? 0);
  const missingReserveHeld = Number(row.faro_advances_with_reserve_missing_held_artifact ?? 0);

  if (
    ![funded, settled, recourse, reserveHeld, reserveReleased, invoiceCount, advanceCount].every(
      (n) => Number.isFinite(n) && Number.isInteger(n)
    )
  ) {
    return unverifiableResult("non_integer_cents_or_count", {
      vendorId: identity.vendorId,
      vendorName: identity.vendorName,
      companyCode: identity.companyCode,
    });
  }

  if (missingFunding > 0) {
    return unverifiableResult("incomplete_funding_je_artifacts", {
      vendorId: identity.vendorId,
      vendorName: identity.vendorName,
      companyCode: identity.companyCode,
    });
  }
  if (missingReserveHeld > 0) {
    return unverifiableResult("incomplete_reserve_held_artifacts", {
      vendorId: identity.vendorId,
      vendorName: identity.vendorName,
      companyCode: identity.companyCode,
    });
  }

  const outstanding = Math.max(0, funded - settled - recourse);
  const reserve = Math.max(0, reserveHeld - reserveReleased);

  if (funded === 0 && advanceCount === 0 && invoiceCount === 0 && reserve === 0) {
    return emptyResult({
      vendorId: identity.vendorId,
      vendorName: identity.vendorName,
      companyCode: identity.companyCode,
    });
  }

  return {
    status: "ok",
    unverifiable_reason: null,
    outstanding_liability_cents: outstanding,
    reserve_receivable_cents: reserve,
    invoice_count: invoiceCount,
    funded_cents: funded,
    settled_cents: settled,
    recourse_buyback_cents: recourse,
    funded_advance_count: advanceCount,
    meta: metaWith({
      vendorId: identity.vendorId,
      vendorName: identity.vendorName,
      companyCode: identity.companyCode,
    }),
  };
}

/** Pure helper — outstanding liability from artifact legs (never statuses). */
export function computeOutstandingLiabilityCents(parts: {
  funded_cents: number;
  settled_cents: number;
  recourse_buyback_cents: number;
}): number {
  return Math.max(0, parts.funded_cents - parts.settled_cents - parts.recourse_buyback_cents);
}

/** Pure helper — reserve receivable; recourse alone must not zero. */
export function computeReserveReceivableCents(parts: {
  reserve_held_cents: number;
  reserve_released_cents: number;
}): number {
  return Math.max(0, parts.reserve_held_cents - parts.reserve_released_cents);
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
  unverifiableResult,
  emptyResult,
  BASE_META,
  LIVE_JE_SQL,
  metaWith,
};
