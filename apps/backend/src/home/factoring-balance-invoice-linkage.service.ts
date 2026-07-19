/**
 * 0280-05-factoring-balance-invoice-linkage — read-only Factoring Balance contract.
 *
 * ROOT CAUSE: /home/factoring-balance read views.factoring_summary (0124 redefinition) sourced from
 * never-written accounting.factoring_companies.current_reserve_balance / jsonb advance_amount, with
 * no invoice count and a catch that fabricated $0.
 *
 * FIX: entity-scoped read over accounting.factoring_advances + accounting.invoices (and the additive
 * security_invoker view views.factoring_balance_invoice_linkage). Owner-locked formula:
 *   outstanding_liability = funded − settled(collections/reserve releases) − recourse buybacks
 *   reserve_receivable = separate 1.5% short-term asset — NEVER netted into liability
 *   invoice_count = COUNT(DISTINCT invoice.id) — money columns aggregated at advance grain (no fanout)
 *
 * Reuses existing posted artifacts only — no new GL math, posting flags stay OFF, no QBO write-back.
 * Missing canonical surface → status=unverifiable (never fabricate zero). Legitimate empty distinct.
 *
 * Standards: QuickBooks/NetSuite liability vs asset honesty; McLeod/Alvys factoring tiles that do not
 * silently zero; CPA locked Faro ASC 860 secured borrowing (CHAIN-06).
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
};

export type FactoringBalanceInvoiceLinkageResult = {
  status: FactoringBalanceStatus;
  unverifiable_reason: string | null;
  /** Credit balance owed Faro (integer cents). Null when unverifiable. */
  outstanding_liability_cents: number | null;
  /** Separate 1.5% short-term reserve receivable (integer cents). Null when unverifiable. */
  reserve_receivable_cents: number | null;
  /** COUNT(DISTINCT accounting.invoices.id) linked to funded non-void advances. */
  invoice_count: number | null;
  funded_cents: number | null;
  settled_cents: number | null;
  recourse_buyback_cents: number | null;
  funded_advance_count: number | null;
  meta: FactoringBalanceMeta;
};

const META: FactoringBalanceMeta = {
  liability_label: "outstanding_secured_borrowing_liability",
  reserve_label: "factoring_reserve_receivable_asset",
  formula:
    "outstanding_liability_cents = funded_cents - settled_cents - recourse_buyback_cents; reserve_receivable_cents separate (never netted)",
  sources: [
    "accounting.factoring_advances",
    "accounting.invoices",
    "views.factoring_balance_invoice_linkage",
  ],
  never_net_reserve_into_liability: true,
  ar_remains_on_books: true,
};

type SchemaProbe = {
  ok: boolean;
  reason: string | null;
};

async function probeCanonicalSurface(client: DbClient): Promise<SchemaProbe> {
  const rel = await client.query<{
    advances_ok: boolean;
    invoices_ok: boolean;
    view_ok: boolean;
  }>(
    `
      SELECT
        to_regclass('accounting.factoring_advances') IS NOT NULL AS advances_ok,
        to_regclass('accounting.invoices') IS NOT NULL AS invoices_ok,
        to_regclass('views.factoring_balance_invoice_linkage') IS NOT NULL AS view_ok
    `
  );
  const row = rel.rows[0];
  if (!row?.advances_ok) {
    return { ok: false, reason: "missing_table:accounting.factoring_advances" };
  }
  if (!row.invoices_ok) {
    return { ok: false, reason: "missing_table:accounting.invoices" };
  }
  if (!row.view_ok) {
    return { ok: false, reason: "missing_view:views.factoring_balance_invoice_linkage" };
  }

  const cols = await client.query<{ column_name: string }>(
    `
      SELECT column_name
      FROM information_schema.columns
      WHERE table_schema = 'accounting'
        AND table_name = 'factoring_advances'
        AND column_name = ANY($1::text[])
    `,
    [
      [
        "id",
        "operating_company_id",
        "status",
        "invoice_total_cents",
        "reserve_amount_cents",
        "release_amount_cents",
        "advanced_at",
      ],
    ]
  );
  const have = new Set(cols.rows.map((r) => r.column_name));
  for (const required of [
    "id",
    "operating_company_id",
    "status",
    "invoice_total_cents",
    "reserve_amount_cents",
    "release_amount_cents",
    "advanced_at",
  ]) {
    if (!have.has(required)) {
      return { ok: false, reason: `missing_column:accounting.factoring_advances.${required}` };
    }
  }

  const invCols = await client.query<{ column_name: string }>(
    `
      SELECT column_name
      FROM information_schema.columns
      WHERE table_schema = 'accounting'
        AND table_name = 'invoices'
        AND column_name = ANY($1::text[])
    `,
    [["id", "operating_company_id", "factoring_advance_id", "voided_at"]]
  );
  const invHave = new Set(invCols.rows.map((r) => r.column_name));
  for (const required of ["id", "operating_company_id", "factoring_advance_id", "voided_at"]) {
    if (!invHave.has(required)) {
      return { ok: false, reason: `missing_column:accounting.invoices.${required}` };
    }
  }

  return { ok: true, reason: null };
}

function unverifiableResult(reason: string): FactoringBalanceInvoiceLinkageResult {
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
    meta: META,
  };
}

function emptyResult(): FactoringBalanceInvoiceLinkageResult {
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
    meta: META,
  };
}

type RollupRow = {
  outstanding_liability_cents: string | number;
  reserve_receivable_cents: string | number;
  funded_cents: string | number;
  settled_cents: string | number;
  recourse_buyback_cents: string | number;
  invoice_count: string | number;
  funded_advance_count: string | number;
};

/**
 * Compute Factoring Balance for one operating company.
 * Caller must already have set app.operating_company_id (withCompanyScope).
 *
 * Prefer the security_invoker view (migration 202607600000). On view read failure after a
 * successful probe, rethrow — routes must surface 500, never silent $0.
 */
export async function computeFactoringBalanceInvoiceLinkage(
  client: DbClient,
  input: { operatingCompanyId: string }
): Promise<FactoringBalanceInvoiceLinkageResult> {
  const { operatingCompanyId } = input;
  const probe = await probeCanonicalSurface(client);
  if (!probe.ok) {
    return unverifiableResult(probe.reason ?? "canonical_factoring_balance_unverifiable");
  }

  const res = await client.query<RollupRow>(
    `
      SELECT
        outstanding_liability_cents::bigint AS outstanding_liability_cents,
        reserve_receivable_cents::bigint AS reserve_receivable_cents,
        funded_cents::bigint AS funded_cents,
        settled_cents::bigint AS settled_cents,
        recourse_buyback_cents::bigint AS recourse_buyback_cents,
        invoice_count::int AS invoice_count,
        funded_advance_count::int AS funded_advance_count
      FROM views.factoring_balance_invoice_linkage
      WHERE operating_company_id = $1::uuid
      LIMIT 1
    `,
    [operatingCompanyId]
  );

  if (res.rows.length === 0) {
    return emptyResult();
  }

  const row = res.rows[0]!;
  const outstanding = Number(row.outstanding_liability_cents ?? 0);
  const reserve = Number(row.reserve_receivable_cents ?? 0);
  const invoiceCount = Number(row.invoice_count ?? 0);
  const funded = Number(row.funded_cents ?? 0);
  const settled = Number(row.settled_cents ?? 0);
  const recourse = Number(row.recourse_buyback_cents ?? 0);
  const advanceCount = Number(row.funded_advance_count ?? 0);

  if (
    !Number.isFinite(outstanding) ||
    !Number.isFinite(reserve) ||
    !Number.isFinite(invoiceCount) ||
    !Number.isInteger(outstanding) ||
    !Number.isInteger(reserve) ||
    !Number.isInteger(invoiceCount)
  ) {
    return unverifiableResult("non_integer_cents_or_count");
  }

  const status: FactoringBalanceStatus =
    funded === 0 && advanceCount === 0 && invoiceCount === 0 ? "empty" : "ok";

  return {
    status,
    unverifiable_reason: null,
    outstanding_liability_cents: outstanding,
    reserve_receivable_cents: reserve,
    invoice_count: invoiceCount,
    funded_cents: funded,
    settled_cents: settled,
    recourse_buyback_cents: recourse,
    funded_advance_count: advanceCount,
    meta: META,
  };
}

/**
 * Pure formula helper for unit tests — mirrors the SQL view math at advance grain.
 * Money must be summed on advances BEFORE any invoice join (fanout ban).
 */
export function computeOutstandingLiabilityCents(parts: {
  funded_cents: number;
  settled_cents: number;
  recourse_buyback_cents: number;
}): number {
  return Math.max(0, parts.funded_cents - parts.settled_cents - parts.recourse_buyback_cents);
}

/** Detect multi-invoice fanout: summing advance money after an invoice join multiplies. */
export function wouldFanoutMultiply(advanceCents: number, invoiceCountOnAdvance: number): number {
  return advanceCents * Math.max(1, invoiceCountOnAdvance);
}

export const __test__ = {
  probeCanonicalSurface,
  unverifiableResult,
  emptyResult,
  META,
};
