/**
 * PERFUME company details editor — owner 2026-11-27 18:21 CT: "the correct pop up and profile creator" and 16:54 CT "separate all the types
 * and categories … not mix". The company profile had no way to edit its own fields (only the Excel round trip). One PATCH changes the
 * contact fields and the three contact lists — Relationship (main_category), Industry (categories[]), Review tags (review_tags[]) and the
 * Business type (segment) — each list value checked against its live catalog, with one history row (perfume.lead_events, action
 * 'details_edited', from → to of every changed field) in the same transaction. Name, role and vendor / customer type keep their own
 * endpoints (profiles.routes.ts: /companies/:id/name, /companies/:id/role).
 */
import type pg from "pg";
import { z } from "zod";
import { logEvent } from "./leads.events.js";

// Omitted stays omitted (undefined = not touched); "" or null clears.
const txt = (max: number) => z.string().trim().max(max).nullable().optional().transform((v) => (v === undefined ? undefined : v == null || v === "" ? null : v));
export const companyDetailsSchema = z.object({
  phone: txt(60), website: txt(300), domain: txt(200), address: txt(300), city: txt(120), state: txt(120), zip: txt(20), country: txt(60),
  notes: txt(5000), segment: txt(200), main_category: txt(200),
  categories: z.array(z.string().trim().min(1).max(200)).max(50).optional(),
  review_tags: z.array(z.string().trim().min(1).max(200)).max(50).optional(),
  // Owner 2026-11-28 14:58 CT (migration 202617330100): Relationship and Business type take several values; the first is the primary
  // (main_category / segment, kept in step by trigger).
  relationships: z.array(z.string().trim().min(1).max(200)).max(20).optional(),
  business_types: z.array(z.string().trim().min(1).max(200)).max(20).optional(),
}).strict();
export type CompanyDetails = z.infer<typeof companyDetailsSchema>;

export class CompanyDetailsError extends Error {
  constructor(public readonly code: string, message: string) { super(message); }
}

const LIST_KIND: Record<string, string> = { segment: "segment", main_category: "category", categories: "industry", review_tags: "review_tag", relationships: "category", business_types: "segment" };

export async function updateCompanyDetails(c: pg.PoolClient, uid: string, id: string, x: CompanyDetails) {
  const cur = (await c.query<Record<string, unknown>>(
    `SELECT phone, website, domain, address, city, state, zip, country, notes, segment, main_category, categories, review_tags, relationships, business_types
       FROM perfume.contact_companies WHERE id = $1::uuid AND archived_at IS NULL FOR UPDATE`, [id])).rows[0];
  if (!cur) throw new CompanyDetailsError("not_found", "Company not found.");
  // Every list value must be a live value of its own list (no free text sneaking a new category in).
  for (const [k, kind] of Object.entries(LIST_KIND)) {
    const v = (x as Record<string, unknown>)[k];
    if (v === undefined || v === null) continue;
    const vals = Array.isArray(v) ? [...new Set(v as string[])] : [v as string];
    if (!vals.length) continue;
    const ok = (await c.query<{ value: string }>(
      `SELECT value FROM perfume.catalog_values WHERE kind = $1 AND archived_at IS NULL AND value = ANY($2::text[])`, [kind, vals])).rows.map((r) => r.value);
    const bad = vals.filter((s) => !ok.includes(s));
    if (bad.length) throw new CompanyDetailsError("not_in_list", `"${bad[0]}" is not in the ${kind === "category" ? "Relationship" : kind === "industry" ? "Industry" : kind === "review_tag" ? "Review tags" : "Business types"} list — add it on Catalogs first.`);
  }
  const changes: Record<string, { from: unknown; to: unknown }> = {};
  const sets: string[] = []; const args: unknown[] = [id];
  for (const [k, v] of Object.entries(x)) {
    if (v === undefined) continue;
    const next = Array.isArray(v) ? [...new Set(v)] : v;
    const before = cur[k];
    if (JSON.stringify(before ?? null) === JSON.stringify(next ?? null)) continue;
    changes[k] = { from: before ?? null, to: next ?? null };
    args.push(next); sets.push(`${k} = $${args.length}${Array.isArray(next) ? "::text[]" : ""}`);
  }
  if (!sets.length) return { changed: 0 };
  await c.query(`UPDATE perfume.contact_companies SET ${sets.join(", ")}, updated_at = now() WHERE id = $1::uuid`, args);
  await logEvent(c, uid, { entity: "company", entity_id: id, company_id: id, action: "details_edited", detail: changes });
  return { changed: Object.keys(changes).length };
}
