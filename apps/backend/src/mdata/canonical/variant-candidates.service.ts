/**
 * ROUND 297 — the one party namespace (customers + vendors + Faro debtors) for one company, with each record's own
 * document count, total and open balance, run through the variant generator. Read only: the owner approves each
 * merge through POST /api/v1/mdata/canonical/:kind/merge (evidence "owner_approved_variant").
 */
import { normalizedKeySql } from "./canonical-entities.service.js";
import { variantPairs, type PartyRecord, type VariantPair } from "./variant-candidates.js";

type Db = { query: <T = Record<string, unknown>>(sql: string, values?: unknown[]) => Promise<{ rows: T[] }> };

const normalizedKey = (name: string) => name.toUpperCase().replace(/[^A-Z0-9]/g, "");

export async function loadPartyNamespace(client: Db, oc: string): Promise<PartyRecord[]> {
  const customers = await client.query<{ id: string; name: string; docs: string; total: string; open: string }>(
    `SELECT c.id::text, c.customer_name AS name,
            count(i.id)::text AS docs, COALESCE(sum(i.total_cents), 0)::text AS total, COALESCE(sum(i.amount_open_cents), 0)::text AS open
       FROM mdata.customers c
       LEFT JOIN accounting.invoices i ON i.customer_id::text = c.id::text AND i.voided_at IS NULL AND i.operating_company_id = c.operating_company_id
      WHERE c.operating_company_id = $1::uuid AND ${normalizedKeySql("c.customer_name")} <> ''
      GROUP BY c.id`,
    [oc]
  );
  const vendors = await client.query<{ id: string; name: string; docs: string; total: string; open: string }>(
    `SELECT v.id::text, v.vendor_name AS name,
            count(b.id)::text AS docs, COALESCE(sum(b.amount_cents), 0)::text AS total,
            COALESCE(sum(b.amount_cents - COALESCE(b.paid_cents, 0)) FILTER (WHERE b.status <> 'void'), 0)::text AS open
       FROM mdata.vendors v
       LEFT JOIN accounting.bills b ON (b.mdata_vendor_id = v.id OR b.vendor_uuid = v.id::text OR b.vendor_id = v.id::text)
                                   AND b.voided_at IS NULL AND b.revoked_at IS NULL AND b.operating_company_id = v.operating_company_id
      WHERE v.operating_company_id = $1::uuid AND ${normalizedKeySql("v.vendor_name")} <> ''
      GROUP BY v.id`,
    [oc]
  );
  // Faro debtors: the debtor names on the factor's own daily statements (the Factoring module's debtor list).
  const debtors = await client.query<{ name: string; docs: string; total: string }>(
    `SELECT l->>'customer_name' AS name, count(*)::text AS docs, COALESCE(sum((l->>'gross_amount_cents')::bigint), 0)::text AS total
       FROM factor.faro_daily_imports f, jsonb_array_elements(COALESCE(f.raw_payload->'lines', '[]'::jsonb)) l
      WHERE f.operating_company_id = $1::uuid AND COALESCE(l->>'customer_name', '') <> ''
      GROUP BY 1`,
    [oc]
  );
  return [
    ...customers.rows.map((r) => ({ kind: "customer" as const, id: r.id, name: r.name, docs: Number(r.docs), total_cents: Number(r.total), open_cents: Number(r.open) })),
    ...vendors.rows.map((r) => ({ kind: "vendor" as const, id: r.id, name: r.name, docs: Number(r.docs), total_cents: Number(r.total), open_cents: Number(r.open) })),
    ...debtors.rows.map((r) => ({ kind: "factoring_debtor" as const, id: r.name, name: r.name, docs: Number(r.docs), total_cents: Number(r.total), open_cents: 0 })),
  ];
}

export async function readVariantCandidates(client: Db, oc: string): Promise<{ parties: number; pairs: VariantPair[] }> {
  const parties = await loadPartyNamespace(client, oc);
  return { parties: parties.length, pairs: variantPairs(parties, normalizedKey) };
}
