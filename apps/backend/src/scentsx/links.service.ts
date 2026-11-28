/**
 * SCENTSX B3a — the bridge between the TIO Perfumes desk (perfume.*) and ScentsX LLC's books.
 *
 * Owner 2026-11-26 20:13 CT "Own company, same engine"; 20:16 CT "full accounting engines making sure linkage
 * connectivity reverse … complete wiring to ledgers". Design: https://claude.ai/artifact/VQ83ogvJyPpVoop1FNKJXC.
 *
 * The perfume desk never writes accounting. This module is the only place a perfume record is tied to an engine
 * record, and it writes only link rows (scentsx.customer_links / vendor_links / document_links). The engine rows
 * themselves (customers, vendors, invoices, bills, journal entries) are created by their own canonical services.
 * The database refuses any link to a row that is not ScentsX's (trigger scentsx.refuse_non_scentsx_link).
 */
import type pg from "pg";
import { appendCrudAudit } from "../audit/crud-audit.js";

type Q = Pick<pg.PoolClient, "query">;

export class ScentsxNotSetUp extends Error {}
export class ScentsxLinkInvalid extends Error {}
export class ScentsxLinkNotFound extends Error {}

/** ScentsX's company id (resolved by code, never hard-coded), and the RLS scope set to it for this transaction. */
export async function scopeToScentsx(c: Q): Promise<string> {
  const r = await c.query<{ id: string | null }>(`SELECT scentsx.company_id()::text AS id`);
  const id = r.rows[0]?.id ?? null;
  if (!id) throw new ScentsxNotSetUp("ScentsX company row is missing (migration 202616820200)");
  await c.query(`SELECT set_config('app.operating_company_id', $1::text, true)`, [id]);
  return id;
}

export async function scentsxSummary(c: Q) {
  const id = await scopeToScentsx(c);
  const r = await c.query<{
    id: string; code: string; legal_name: string; short_name: string | null; company_type: string;
    tax_id: string | null; accounts: number; roles: number; periods: number; customers_linked: number; vendors_linked: number;
  }>(
    `SELECT c.id::text, c.code, c.legal_name, c.short_name, c.company_type::text, c.tax_id,
            (SELECT count(*)::int FROM catalogs.accounts a WHERE a.operating_company_id = c.id AND a.deactivated_at IS NULL) AS accounts,
            (SELECT count(*)::int FROM accounting.chart_of_accounts_roles r WHERE r.operating_company_id = c.id AND r.is_active) AS roles,
            (SELECT count(*)::int FROM accounting.periods p WHERE p.operating_company_id = c.id) AS periods,
            (SELECT count(*)::int FROM scentsx.customer_links l WHERE l.operating_company_id = c.id AND l.voided_at IS NULL) AS customers_linked,
            (SELECT count(*)::int FROM scentsx.vendor_links l WHERE l.operating_company_id = c.id AND l.voided_at IS NULL) AS vendors_linked
       FROM org.companies c WHERE c.id = $1::uuid`,
    [id]
  );
  return r.rows[0];
}

export type LinkKind = "customer" | "vendor";
const SPEC = {
  customer: { table: "scentsx.customer_links", deskCol: "contact_company_id", engineCol: "customer_id", engineTable: "mdata.customers", engineName: "customer_name" },
  vendor: { table: "scentsx.vendor_links", deskCol: "perfume_vendor_id", engineCol: "vendor_id", engineTable: "mdata.vendors", engineName: "vendor_name" },
} as const;

export async function listLinks(c: Q, kind: LinkKind, filter: { desk_id?: string; engine_id?: string }) {
  const s = SPEC[kind];
  await scopeToScentsx(c);
  const r = await c.query(
    `SELECT l.id::text, l.${s.deskCol}::text AS desk_id, l.${s.engineCol}::text AS engine_id, e.${s.engineName} AS engine_name,
            l.created_at, l.created_by::text, l.voided_at, l.void_reason
       FROM ${s.table} l JOIN ${s.engineTable} e ON e.id = l.${s.engineCol}
      WHERE ($1::uuid IS NULL OR l.${s.deskCol} = $1::uuid) AND ($2::uuid IS NULL OR l.${s.engineCol} = $2::uuid)
      ORDER BY l.voided_at NULLS FIRST, l.created_at DESC
      LIMIT 200`,
    [filter.desk_id ?? null, filter.engine_id ?? null]
  );
  return r.rows;
}

export async function createLink(c: Q, uid: string, kind: LinkKind, deskId: string, engineId: string) {
  const s = SPEC[kind];
  const co = await scopeToScentsx(c);
  // Owner 2026-11-27 18:38 CT ("a vendor can have multiple lists"): a ScentsX vendor may serve several price lists of the SAME
  // company (trigger scentsx.vendor_link_one_company, migration 202617190100). A list still has one live vendor; a customer
  // link stays one-to-one both ways.
  const dup = await c.query(
    kind === "vendor"
      ? `SELECT 1 FROM ${s.table} WHERE voided_at IS NULL AND ${s.deskCol} = $1::uuid LIMIT 1`
      : `SELECT 1 FROM ${s.table} WHERE voided_at IS NULL AND (${s.deskCol} = $1::uuid OR ${s.engineCol} = $2::uuid) LIMIT 1`,
    kind === "vendor" ? [deskId] : [deskId, engineId]
  );
  if (dup.rows.length) throw new ScentsxLinkInvalid(`this ${kind} is already linked — void the old link first`);
  try {
    const r = await c.query<{ id: string }>(
      `INSERT INTO ${s.table} (operating_company_id, ${s.deskCol}, ${s.engineCol}, created_by)
       VALUES ($1::uuid, $2::uuid, $3::uuid, $4::uuid) RETURNING id::text`,
      [co, deskId, engineId, uid]
    );
    await appendCrudAudit(c, uid, `scentsx.${kind}_link.created`, { link_id: r.rows[0]!.id, desk_id: deskId, engine_id: engineId, operating_company_id: co });
    return r.rows[0]!;
  } catch (e) {
    const err = e as { code?: string; message?: string };
    if (err.code === "23514" || err.code === "23503") throw new ScentsxLinkInvalid(err.message ?? "link refused");
    throw e;
  }
}

export async function voidLink(c: Q, uid: string, kind: LinkKind, id: string, reason: string) {
  const s = SPEC[kind];
  const co = await scopeToScentsx(c);
  const r = await c.query<{ id: string }>(
    `UPDATE ${s.table} SET voided_at = now(), void_reason = $2 WHERE id = $1::uuid AND voided_at IS NULL RETURNING id::text`,
    [id, reason]
  );
  if (!r.rows.length) throw new ScentsxLinkNotFound();
  await appendCrudAudit(c, uid, `scentsx.${kind}_link.voided`, { link_id: id, reason, operating_company_id: co });
  return r.rows[0]!;
}

export type DocFilter = { quote_id?: string; sales_order_id?: string; purchase_order_id?: string; invoice_id?: string; bill_id?: string; journal_entry_id?: string };

/** Every engine document tied to a perfume document, or every perfume document tied to an engine document. */
export async function listDocumentLinks(c: Q, f: DocFilter) {
  await scopeToScentsx(c);
  const r = await c.query(
    `SELECT l.id::text, l.quote_id::text, l.sales_order_id::text, l.purchase_order_id::text,
            l.invoice_id::text, i.display_id AS invoice_number, i.total_cents AS invoice_total_cents, i.status AS invoice_status,
            l.bill_id::text, l.journal_entry_id::text, l.created_at, l.voided_at, l.void_reason
       FROM scentsx.document_links l
       LEFT JOIN accounting.invoices i ON i.id = l.invoice_id
      WHERE ($1::uuid IS NULL OR l.quote_id = $1::uuid) AND ($2::uuid IS NULL OR l.sales_order_id = $2::uuid)
        AND ($3::uuid IS NULL OR l.purchase_order_id = $3::uuid) AND ($4::uuid IS NULL OR l.invoice_id = $4::uuid)
        AND ($5::uuid IS NULL OR l.bill_id = $5::uuid) AND ($6::uuid IS NULL OR l.journal_entry_id = $6::uuid)
      ORDER BY l.created_at DESC
      LIMIT 200`,
    [f.quote_id ?? null, f.sales_order_id ?? null, f.purchase_order_id ?? null, f.invoice_id ?? null, f.bill_id ?? null, f.journal_entry_id ?? null]
  );
  return r.rows;
}

/** ScentsX's chart of accounts with each account's role bindings and posted balance (read-only). */
export async function scentsxChart(c: Q) {
  const co = await scopeToScentsx(c);
  const r = await c.query<{
    id: string; account_number: string | null; account_name: string; account_type: string; account_subtype: string | null;
    roles: string[]; debit_cents: string; credit_cents: string;
  }>(
    `SELECT a.id::text, a.account_number, a.account_name, a.account_type, a.account_subtype,
            coalesce((SELECT array_agg(r.role ORDER BY r.role) FROM accounting.chart_of_accounts_roles r
                       WHERE r.account_id = a.id AND r.operating_company_id = a.operating_company_id AND r.is_active), '{}') AS roles,
            coalesce((SELECT sum(p.amount_cents) FILTER (WHERE p.debit_or_credit = 'debit') FROM accounting.journal_entry_postings p
                        JOIN accounting.journal_entries j ON j.id = p.journal_entry_uuid
                       WHERE p.account_id = a.id AND j.operating_company_id = a.operating_company_id AND j.status = 'posted'), 0)::text AS debit_cents,
            coalesce((SELECT sum(p.amount_cents) FILTER (WHERE p.debit_or_credit = 'credit') FROM accounting.journal_entry_postings p
                        JOIN accounting.journal_entries j ON j.id = p.journal_entry_uuid
                       WHERE p.account_id = a.id AND j.operating_company_id = a.operating_company_id AND j.status = 'posted'), 0)::text AS credit_cents
       FROM catalogs.accounts a
      WHERE a.operating_company_id = $1::uuid AND a.deactivated_at IS NULL
      ORDER BY a.account_number NULLS LAST, a.account_name`,
    [co]
  );
  return r.rows;
}

/** One ScentsX account's register: every posted line on it, newest first, with the document it came from. */
export async function scentsxAccountRegister(c: Q, accountId: string) {
  const co = await scopeToScentsx(c);
  const own = await c.query(`SELECT 1 FROM catalogs.accounts WHERE id = $1::uuid AND operating_company_id = $2::uuid`, [accountId, co]);
  if (!own.rows.length) throw new ScentsxLinkNotFound();
  const r = await c.query<{
    posting_id: string; journal_entry_id: string; entry_date: string; memo: string | null; debit_or_credit: string;
    amount_cents: string; source_transaction_type: string | null; source_transaction_id: string | null;
  }>(
    `SELECT p.id::text AS posting_id, j.id::text AS journal_entry_id, j.entry_date::text, coalesce(p.description, j.memo) AS memo,
            p.debit_or_credit, p.amount_cents::text, p.source_transaction_type, p.source_transaction_id
       FROM accounting.journal_entry_postings p JOIN accounting.journal_entries j ON j.id = p.journal_entry_uuid
      WHERE p.account_id = $1::uuid AND j.operating_company_id = $2::uuid AND j.status = 'posted'
      ORDER BY j.entry_date DESC, j.created_at DESC
      LIMIT 500`,
    [accountId, co]
  );
  return r.rows;
}

/**
 * L.31 M18 E2 — perfume customer companies (live: not archived, not merged into another) with at least one email that are not yet a
 * ScentsX customer (no live scentsx.customer_links row). The canonical customer create needs an email, so a company without one is
 * left out and counted separately.
 */
export async function eligibleForScentsxCustomer(c: Q, limit = 500): Promise<{ total: number; contacts: Array<{ id: string; name: string; email: string; phone: string | null }> }> {
  const totalR = await c.query<{ n: string }>(
    `SELECT count(DISTINCT cc.id)::text AS n
       FROM perfume.contact_companies cc
       JOIN perfume.contact_people p ON p.company_id = cc.id AND p.email IS NOT NULL AND p.email <> ''
      WHERE cc.role IN ('customer', 'both')
        AND cc.archived_at IS NULL AND cc.merged_into_id IS NULL
        AND NOT EXISTS (SELECT 1 FROM scentsx.customer_links l WHERE l.contact_company_id = cc.id AND l.voided_at IS NULL)`
  );
  const total = Number(totalR.rows[0]?.n ?? 0);
  if (total === 0) return { total: 0, contacts: [] };
  const rows = await c.query<{ id: string; name: string; email: string; phone: string | null }>(
    `SELECT DISTINCT ON (cc.id) cc.id::text, cc.name, p.email,
            (SELECT ph FROM unnest(p.phones) ph LIMIT 1) AS phone
       FROM perfume.contact_companies cc
       JOIN perfume.contact_people p ON p.company_id = cc.id AND p.email IS NOT NULL AND p.email <> ''
      WHERE cc.role IN ('customer', 'both')
        AND cc.archived_at IS NULL AND cc.merged_into_id IS NULL
        AND NOT EXISTS (SELECT 1 FROM scentsx.customer_links l WHERE l.contact_company_id = cc.id AND l.voided_at IS NULL)
      ORDER BY cc.id, p.email
      LIMIT $1`,
    [limit]
  );
  return { total, contacts: rows.rows };
}
