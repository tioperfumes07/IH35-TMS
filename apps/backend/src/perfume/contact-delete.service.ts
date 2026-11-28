/**
 * PERFUME — delete contacts from Vendors / Customers / All leads (owner 2026-11-27 21:39 CT: "IN VENDORS AND CUSTOMERS WHEN SELECTING
 * MULTIPLE THE OPTION TO DELETE AS WELL, SO I CAN CLEAN ALL THOSE CONTACTS THAT ARE NOT FOR THE BUSINESS").
 * A deleted company leaves every list (archived_at, the same way a merged duplicate leaves): its people and its vendor record go
 * with it, and the company's history gets a 'deleted' row (who, when, how many people). Nothing is erased, so a mistake can be put
 * back (restoreContacts).
 * A company that already has business on file is NOT deleted — the way QuickBooks will not delete a name with transactions:
 * quotes, sales orders, purchase orders, vendor price lists, a ScentsX customer / vendor link, a customer account, a credit
 * application, a pagaré or a resale certificate. Those come back in `kept` with the reason.
 */
import type pg from "pg";
import { z } from "zod";

type Q = Pick<pg.PoolClient, "query">;

export const deleteContactsSchema = z.object({ ids: z.array(z.string().uuid()).min(1).max(500) });

/** The business already on file for each company (empty = safe to delete). */
const ON_FILE = `
  SELECT co.id, array_remove(ARRAY[
      CASE WHEN EXISTS (SELECT 1 FROM perfume.quotes q WHERE q.company_id = co.id) THEN 'quotes' END,
      CASE WHEN EXISTS (SELECT 1 FROM perfume.sales_orders o WHERE o.company_id = co.id) THEN 'sales orders' END,
      CASE WHEN EXISTS (SELECT 1 FROM perfume.vendors v JOIN perfume.purchase_orders p ON p.vendor_id = v.id WHERE v.company_id = co.id) THEN 'purchase orders' END,
      CASE WHEN EXISTS (SELECT 1 FROM perfume.vendors v JOIN perfume.price_lists pl ON pl.vendor_id = v.id WHERE v.company_id = co.id) THEN 'price lists' END,
      CASE WHEN EXISTS (SELECT 1 FROM scentsx.customer_links l WHERE l.contact_company_id = co.id AND l.voided_at IS NULL) THEN 'ScentsX customer' END,
      CASE WHEN EXISTS (SELECT 1 FROM perfume.vendors v JOIN scentsx.vendor_links l ON l.perfume_vendor_id = v.id WHERE v.company_id = co.id AND l.voided_at IS NULL) THEN 'ScentsX vendor' END,
      CASE WHEN EXISTS (SELECT 1 FROM perfume.customer_accounts a WHERE a.company_id = co.id) THEN 'customer account' END,
      CASE WHEN EXISTS (SELECT 1 FROM perfume.credit_applications a WHERE a.company_id = co.id) THEN 'credit application' END,
      CASE WHEN EXISTS (SELECT 1 FROM scentsx.pagares p WHERE p.contact_company_id = co.id) THEN 'pagaré' END,
      CASE WHEN EXISTS (SELECT 1 FROM scentsx.resale_certificates r WHERE r.contact_company_id = co.id) THEN 'resale certificate' END
    ], NULL) AS on_file
    FROM perfume.contact_companies co WHERE co.id = ANY($1::uuid[])`;

export async function deleteContacts(c: Q, uid: string, ids: string[]) {
  const want = [...new Set(ids)];
  const found = (await c.query<{ id: string; name: string; archived: boolean; on_file: string[] }>(
    `SELECT f.id::text, co.name, (co.archived_at IS NOT NULL) AS archived, f.on_file FROM (${ON_FILE}) f JOIN perfume.contact_companies co ON co.id = f.id`, [want])).rows;
  const kept: Array<{ id: string; name: string; reason: string }> = [];
  const del: string[] = [];
  let already = 0;
  for (const r of found) {
    if (r.archived) { already++; continue; }
    if (r.on_file.length) kept.push({ id: r.id, name: r.name, reason: `has ${r.on_file.join(", ")}` });
    else del.push(r.id);
  }
  let people = 0;
  if (del.length) {
    const p = await c.query<{ company_id: string; n: number }>(
      `WITH u AS (UPDATE perfume.contact_people SET archived_at = now() WHERE company_id = ANY($1::uuid[]) AND archived_at IS NULL RETURNING company_id)
       SELECT company_id::text, count(*)::int AS n FROM u GROUP BY 1`, [del]);
    const byCo = new Map(p.rows.map((x) => [x.company_id, x.n]));
    people = p.rows.reduce((s, x) => s + x.n, 0);
    await c.query(`UPDATE perfume.vendors SET archived_at = now(), updated_at = now() WHERE company_id = ANY($1::uuid[]) AND archived_at IS NULL`, [del]);
    await c.query(`UPDATE perfume.contact_companies SET archived_at = now(), updated_at = now() WHERE id = ANY($1::uuid[]) AND archived_at IS NULL`, [del]);
    await c.query(
      `INSERT INTO perfume.lead_events (entity, entity_id, company_id, action, detail, created_by)
       SELECT 'company', x, x, 'deleted', jsonb_build_object('people', coalesce((($2::jsonb) ->> x::text)::int, 0), 'how', 'owner deleted from the list (not for the business)'), $3::uuid
         FROM unnest($1::uuid[]) AS x`, [del, JSON.stringify(Object.fromEntries(byCo)), uid]);
  }
  return { deleted: del.length, people, already_deleted: already, not_found: want.length - found.length, kept };
}

/** Puts deleted companies back (with their people and vendor record) — only ones deleted this way, never a merged duplicate. */
export async function restoreContacts(c: Q, uid: string, ids: string[]) {
  // Only what the delete took: people / vendor records archived in the same moment as the company (not ones archived before).
  const cos = (await c.query<{ id: string }>(
    `SELECT id::text FROM perfume.contact_companies WHERE id = ANY($1::uuid[]) AND archived_at IS NOT NULL AND merged_into_id IS NULL`, [[...new Set(ids)]])).rows.map((r) => r.id);
  if (!cos.length) return { restored: 0 };
  await c.query(`UPDATE perfume.contact_people p SET archived_at = NULL FROM perfume.contact_companies co
                  WHERE co.id = ANY($1::uuid[]) AND p.company_id = co.id AND p.archived_at BETWEEN co.archived_at - interval '5 seconds' AND co.archived_at + interval '5 seconds'`, [cos]);
  await c.query(`UPDATE perfume.vendors v SET archived_at = NULL, updated_at = now() FROM perfume.contact_companies co
                  WHERE co.id = ANY($1::uuid[]) AND v.company_id = co.id AND v.archived_at BETWEEN co.archived_at - interval '5 seconds' AND co.archived_at + interval '5 seconds'`, [cos]);
  await c.query(`UPDATE perfume.contact_companies SET archived_at = NULL, updated_at = now() WHERE id = ANY($1::uuid[])`, [cos]);
  await c.query(`INSERT INTO perfume.lead_events (entity, entity_id, company_id, action, detail, created_by) SELECT 'company', x, x, 'restored', '{}'::jsonb, $2::uuid FROM unnest($1::uuid[]) AS x`, [cos, uid]);
  return { restored: cos.length };
}
