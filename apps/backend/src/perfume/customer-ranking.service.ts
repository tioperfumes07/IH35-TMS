/**
 * PERFUME customer ranking — ROUND P1.31 L1 (owner 2026-11-27 15:45 CT item 10: "rank on purchase capacity or quantity").
 *
 * Import: the old systems' purchase history into perfume.customer_purchase_history (migration 202617160100) — what each customer
 * BOUGHT per month (USA store) / per year (Mexico, MXN). Never a balance (owner law 14:12 CT). Each row is matched to its contact company
 * by the shared match key (perfume.name_key); unmatched rows keep the source name and are listed as "not linked".
 *
 * Rank: ABC (Pareto) per currency on lifetime purchases — A = the customers that together make the first 80 % of the purchases,
 * B = the next 15 %, C = the rest — with 12-month purchases, invoices, months bought and the last month beside it. ScentsX's own
 * issued invoices (when there are any) count in USD for the same customer.
 */
import type pg from "pg";
import { z } from "zod";

type Q = Pick<pg.PoolClient, "query">;

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
export const historyImportSchema = z.object({
  rows: z.array(z.object({
    source: z.enum(["usa_store", "mexico_file"]),
    customer_no: z.string().trim().min(1).max(60),
    customer_name: z.string().trim().min(1).max(300),
    period_kind: z.enum(["month", "year"]),
    period_start: isoDate,
    invoices: z.number().int().min(0).max(100000).nullable().optional(),
    amount_cents: z.number().int().min(-1_000_000_000_000).max(1_000_000_000_000),
    currency: z.enum(["USD", "MXN"]),
  })).min(1).max(5000),
});

/** Upserts the rows (same source + customer no. + period replaces) and links each to its contact company by name. */
export async function importPurchaseHistory(c: Q, uid: string, rows: z.infer<typeof historyImportSchema>["rows"]) {
  const r = await c.query<{ inserted: boolean }>(
    `INSERT INTO perfume.customer_purchase_history (source, customer_no, customer_name, company_id, period_kind, period_start, invoices, amount_cents, currency, imported_by)
     SELECT x.source, x.customer_no, x.customer_name,
            (SELECT cc.id FROM perfume.contact_companies cc WHERE cc.archived_at IS NULL AND cc.name_key = perfume.name_key(x.customer_name)
              ORDER BY cc.role = 'customer' DESC, cc.role = 'both' DESC, cc.created_at LIMIT 1),
            x.period_kind, x.period_start, x.invoices, x.amount_cents, x.currency, $2::uuid
       FROM jsonb_to_recordset($1::jsonb) AS x(source text, customer_no text, customer_name text, period_kind text, period_start date, invoices int, amount_cents bigint, currency text)
     ON CONFLICT (source, customer_no, period_start) DO UPDATE SET customer_name = EXCLUDED.customer_name, company_id = EXCLUDED.company_id,
       invoices = EXCLUDED.invoices, amount_cents = EXCLUDED.amount_cents, currency = EXCLUDED.currency, imported_by = EXCLUDED.imported_by, imported_at = now()
     RETURNING (xmax = 0) AS inserted`,
    [JSON.stringify(rows.map((x) => ({ ...x, invoices: x.invoices ?? null }))), uid]);
  // A company that bought from TIO is a customer, not a lead (owner 2026-11-28 14:30 CT, migration 202617320100): approve the companies
  // this history links to that are still leads, with one 'approved' history row each.
  const ap = await c.query<{ id: string }>(
    `UPDATE perfume.contact_companies co SET approved_at = now(), approved_by = $2::uuid, role = coalesce(co.role, 'customer'), updated_at = now()
      WHERE co.approved_at IS NULL AND co.archived_at IS NULL
        AND co.id IN (SELECT h.company_id FROM perfume.customer_purchase_history h WHERE h.company_id IS NOT NULL
                        AND (h.source, h.customer_no) IN (SELECT x.source, x.customer_no FROM jsonb_to_recordset($1::jsonb) AS x(source text, customer_no text)))
      RETURNING co.id::text`, [JSON.stringify(rows.map((x) => ({ source: x.source, customer_no: x.customer_no }))), uid]);
  if (ap.rows.length) {
    await c.query(`INSERT INTO perfume.lead_events (entity, entity_id, company_id, action, detail, created_by)
                   SELECT 'company', x, x, 'approved', '{"how":"bought from TIO (purchase history import)"}'::jsonb, $2::uuid FROM unnest($1::uuid[]) AS x`,
      [ap.rows.map((x) => x.id), uid]);
  }
  return { rows: r.rowCount ?? 0, inserted: r.rows.filter((x) => x.inserted).length, updated: r.rows.filter((x) => !x.inserted).length, approved: ap.rows.length };
}

export type Tier = "A" | "B" | "C";
/** ABC on a list already sorted by amount (desc): A while the running share before the row is < 80 %, B < 95 %, else C. */
export function abcTiers(amounts: number[]): Tier[] {
  const total = amounts.reduce((s, a) => s + Math.max(0, a), 0);
  let run = 0;
  return amounts.map((a) => {
    const before = total > 0 ? run / total : 1;
    run += Math.max(0, a);
    return before < 0.8 ? "A" : before < 0.95 ? "B" : "C";
  });
}

export const rankingQuery = z.object({ currency: z.enum(["USD", "MXN"]).default("USD") });

export type RankRow = { key: string; company_id: string | null; customer: string; role: string | null; linked: boolean; sources: string[];
  lifetime_cents: number; last12_cents: number; invoices: number; months: number; first_period: string | null; last_period: string | null; tier: Tier; rank: number; share: number };

/** Every customer with purchases in the currency, ranked, with its ABC tier. */
export async function customerRanking(c: Q, f: z.infer<typeof rankingQuery>) {
  const rows = (await c.query<{ key: string; company_id: string | null; customer: string; role: string | null; sources: string[]; lifetime: string; last12: string;
    invoices: number; months: number; first_period: string | null; last_period: string | null }>(
    `WITH h AS (
       SELECT coalesce(h.company_id::text, h.source || ':' || h.customer_no) AS key, h.company_id, h.customer_name, h.source, h.period_start, h.period_kind,
              h.invoices, h.amount_cents
         FROM perfume.customer_purchase_history h WHERE h.currency = $1
       UNION ALL
       -- ScentsX's own issued invoices, by the contact company linked to the ScentsX customer (USD).
       SELECT l.contact_company_id::text, l.contact_company_id, cu.customer_name, 'scentsx', date_trunc('month', i.issue_date)::date, 'month', 1, i.total_cents
         FROM accounting.invoices i JOIN mdata.customers cu ON cu.id = i.customer_id
         JOIN scentsx.customer_links l ON l.customer_id = i.customer_id AND l.voided_at IS NULL
        WHERE $1 = 'USD' AND i.operating_company_id = (SELECT id FROM org.companies WHERE code = 'SCENTSX')
          AND i.status NOT IN ('void', 'voided', 'draft', 'proforma') AND i.voided_at IS NULL AND i.is_sample_data = false)
     SELECT h.key, (array_agg(h.company_id) FILTER (WHERE h.company_id IS NOT NULL))[1]::text AS company_id,
            coalesce(max(cc.name), (array_agg(h.customer_name ORDER BY h.period_start DESC))[1]) AS customer, max(cc.role) AS role,
            array_agg(DISTINCT h.source) AS sources, sum(h.amount_cents)::text AS lifetime,
            coalesce(sum(h.amount_cents) FILTER (WHERE h.period_start >= (date_trunc('month', now() AT TIME ZONE 'America/Chicago') - interval '12 months')::date), 0)::text AS last12,
            coalesce(sum(h.invoices), 0)::int AS invoices, count(DISTINCT h.period_start)::int AS months,
            min(h.period_start)::text AS first_period, max(h.period_start)::text AS last_period
       FROM h LEFT JOIN perfume.contact_companies cc ON cc.id = h.company_id
      GROUP BY h.key
     HAVING sum(h.amount_cents) > 0
      ORDER BY sum(h.amount_cents) DESC, h.key`, [f.currency])).rows;
  const amounts = rows.map((r) => Number(r.lifetime));
  const tiers = abcTiers(amounts);
  const total = amounts.reduce((s, a) => s + a, 0);
  const out: RankRow[] = rows.map((r, i) => ({ key: r.key, company_id: r.company_id, customer: r.customer, role: r.role, linked: r.company_id != null, sources: r.sources,
    lifetime_cents: Number(r.lifetime), last12_cents: Number(r.last12), invoices: r.invoices, months: r.months, first_period: r.first_period, last_period: r.last_period,
    tier: tiers[i]!, rank: i + 1, share: total > 0 ? Number(r.lifetime) / total : 0 }));
  const count = (t: Tier) => out.filter((r) => r.tier === t).length;
  return { currency: f.currency, total_cents: total, customers: out.length, tiers: { A: count("A"), B: count("B"), C: count("C") }, linked: out.filter((r) => r.linked).length, rows: out };
}

/** One contact company's tier in each currency (for its profile). */
export async function companyTier(c: Q, companyId: string) {
  const res: Record<string, { tier: Tier; rank: number; of: number; lifetime_cents: number; last12_cents: number } | null> = { USD: null, MXN: null };
  for (const cur of ["USD", "MXN"] as const) {
    const r = await customerRanking(c, { currency: cur });
    const row = r.rows.find((x) => x.company_id === companyId);
    res[cur] = row ? { tier: row.tier, rank: row.rank, of: r.customers, lifetime_cents: row.lifetime_cents, last12_cents: row.last12_cents } : null;
  }
  return res;
}

/**
 * LEAD item 23: re-link the imported purchase history to its contact companies — after customers are imported / merged, the rows that
 * had no company (measured 2026-11-27: 1,441 customer numbers) are matched again by the shared match key (perfume.name_key), and a row
 * whose company was merged into another follows it to the company that stayed. Rows already linked to a live company never change.
 */
export async function relinkPurchaseHistory(c: Q) {
  const merged = await c.query(
    `UPDATE perfume.customer_purchase_history h SET company_id = cc.merged_into_id
       FROM perfume.contact_companies cc WHERE cc.id = h.company_id AND cc.merged_into_id IS NOT NULL`);
  const linked = await c.query(
    `UPDATE perfume.customer_purchase_history h SET company_id = m.id
       FROM (SELECT DISTINCT ON (cc.name_key) cc.name_key, cc.id FROM perfume.contact_companies cc WHERE cc.archived_at IS NULL AND cc.name_key IS NOT NULL
              ORDER BY cc.name_key, cc.role = 'customer' DESC, cc.role = 'both' DESC, cc.created_at) m
      WHERE h.company_id IS NULL AND m.name_key = perfume.name_key(h.customer_name)`);
  const left = (await c.query<{ n: number }>(`SELECT count(DISTINCT (source, customer_no))::int n FROM perfume.customer_purchase_history WHERE company_id IS NULL`)).rows[0]!.n;
  return { followed_merge: merged.rowCount ?? 0, linked: linked.rowCount ?? 0, unlinked_customers: left };
}
