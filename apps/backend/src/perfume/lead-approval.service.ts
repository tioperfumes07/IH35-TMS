/**
 * PERFUME — lead approval (owner 2026-11-28 14:30 CT: "a lead cannot appear as a vendor or customer unless approved. this way the data
 * is only in one place and then transferred"). Migration 202617320100.
 *   · approveCompanies — the selected leads become customers / vendors / both: role set, approved_at / approved_by stamped, one
 *     perfume.lead_events 'approved' row each. The same company row moves list; nothing is copied.
 *   · unapproveCompanies — "Send back to leads": approved_at cleared, one 'unapproved' row each. A company with business on file
 *     (quotes, orders, POs, price lists, a ScentsX link, an account) is kept approved, with the reason — the way a QuickBooks customer
 *     with transactions cannot be made inactive away.
 */
import type pg from "pg";
import { z } from "zod";
import { logEvents } from "./leads.events.js";

type Q = pg.PoolClient;
export const approveSchema = z.object({ ids: z.array(z.string().uuid()).min(1).max(500), role: z.enum(["customer", "vendor", "both"]) });
export const unapproveSchema = z.object({ ids: z.array(z.string().uuid()).min(1).max(500) });

export async function approveCompanies(c: Q, uid: string, ids: string[], role: "customer" | "vendor" | "both") {
  const r = await c.query<{ id: string; before_role: string | null; was_approved: boolean }>(
    `WITH prev AS (SELECT id, role, approved_at FROM perfume.contact_companies WHERE id = ANY($1::uuid[]) AND archived_at IS NULL FOR UPDATE)
     UPDATE perfume.contact_companies co SET role = $2, approved_at = coalesce(co.approved_at, now()), approved_by = coalesce(co.approved_by, $3::uuid), updated_at = now()
       FROM prev WHERE co.id = prev.id
     RETURNING co.id::text, prev.role AS before_role, (prev.approved_at IS NOT NULL) AS was_approved`, [[...new Set(ids)], role, uid]);
  await logEvents(c, uid, r.rows.map((x) => ({ entity: "company" as const, entity_id: x.id, company_id: x.id, action: "approved",
    detail: { role, from_role: x.before_role, already_approved: x.was_approved } })));
  return { approved: r.rows.length, not_found: new Set(ids).size - r.rows.length };
}

const ON_FILE = `array_remove(ARRAY[
  CASE WHEN EXISTS (SELECT 1 FROM perfume.quotes q WHERE q.company_id = co.id) THEN 'quotes' END,
  CASE WHEN EXISTS (SELECT 1 FROM perfume.sales_orders o WHERE o.company_id = co.id) THEN 'sales orders' END,
  CASE WHEN EXISTS (SELECT 1 FROM perfume.vendors v JOIN perfume.purchase_orders p ON p.vendor_id = v.id WHERE v.company_id = co.id) THEN 'purchase orders' END,
  CASE WHEN EXISTS (SELECT 1 FROM perfume.vendors v JOIN perfume.price_lists pl ON pl.vendor_id = v.id WHERE v.company_id = co.id) THEN 'price lists' END,
  CASE WHEN EXISTS (SELECT 1 FROM scentsx.customer_links l WHERE l.contact_company_id = co.id AND l.voided_at IS NULL) THEN 'ScentsX customer' END,
  CASE WHEN EXISTS (SELECT 1 FROM perfume.vendors v JOIN scentsx.vendor_links l ON l.perfume_vendor_id = v.id WHERE v.company_id = co.id AND l.voided_at IS NULL) THEN 'ScentsX vendor' END,
  CASE WHEN EXISTS (SELECT 1 FROM perfume.customer_accounts a WHERE a.company_id = co.id) THEN 'customer account' END
], NULL)`;

export async function unapproveCompanies(c: Q, uid: string, ids: string[]) {
  const rows = (await c.query<{ id: string; name: string; on_file: string[] }>(
    `SELECT co.id::text, co.name, ${ON_FILE} AS on_file FROM perfume.contact_companies co
      WHERE co.id = ANY($1::uuid[]) AND co.archived_at IS NULL AND co.approved_at IS NOT NULL`, [[...new Set(ids)]])).rows;
  const kept = rows.filter((r) => r.on_file.length).map((r) => ({ id: r.id, name: r.name, reason: `has ${r.on_file.join(", ")}` }));
  const back = rows.filter((r) => !r.on_file.length).map((r) => r.id);
  if (back.length) {
    await c.query(`UPDATE perfume.contact_companies SET approved_at = NULL, approved_by = NULL, updated_at = now() WHERE id = ANY($1::uuid[])`, [back]);
    await logEvents(c, uid, back.map((id) => ({ entity: "company" as const, entity_id: id, company_id: id, action: "unapproved", detail: { how: "sent back to leads" } })));
  }
  return { sent_back: back.length, kept };
}
