/**
 * ONE COMPANY RECORD (owner 2026-11-27 17:25 CT: "WE CANNOT HAVE DATA IN MULTIPLE PLACES OR I WILL GET CONFUISED … LETS GO").
 * A price-list vendor (perfume.vendors: a supplier's or a competitor's list) belongs to ONE company in Contacts
 * (perfume.contact_companies: name, address, people, role vendor / customer / both, type). This file links every list to its
 * company: a preview proposes, for each unlinked list, the company to link (or a new company when Contacts has none), the
 * owner changes what he wants and applies. Linking a supplier's list makes the company a vendor (customer → both). Nothing is
 * deleted; every link and every company made here writes one perfume.lead_events row.
 */
import type pg from "pg";
import { z } from "zod";
import { companySuggestions, matchKey, ProfileInvalid, ProfileNotFound } from "./profiles.service.js";

/** The company part of a list's name: what follows " — " and a trailing "( … )" are the list's own label
 *  ("Elegance Distributors — ARABIC list" → "Elegance Distributors", "Miami Trading Zone (MTZ)" → "Miami Trading Zone"). */
export function companyNameOf(listName: string): string {
  const a = listName.split(/\s+[—–]\s+/)[0]!.trim();
  const b = a.replace(/\s*\([^()]*\)\s*$/, "").trim();
  return b || a || listName.trim();
}

type Candidate = { id: string; name: string; role: string | null; city: string | null; state: string | null; country: string | null; people: number; exact: boolean };
export type LinkProposal = {
  vendor_id: string; vendor: string; short_name: string | null; kind: string; company_name: string;
  action: "link" | "choose" | "create"; company_id: string | null; candidates: Candidate[];
};

/** Every unlinked supplier / competitor list with what to do with it. */
export async function vendorLinkPreview(c: pg.PoolClient): Promise<{ proposals: LinkProposal[]; linked: number; unlinked: number }> {
  const vs = (await c.query<{ id: string; name: string; short_name: string | null; kind: string }>(
    `SELECT id, name, short_name, kind FROM perfume.vendors WHERE archived_at IS NULL AND company_id IS NULL AND kind IN ('buy', 'sell') ORDER BY name`)).rows;
  const linked = (await c.query<{ n: number }>(
    `SELECT count(*)::int AS n FROM perfume.vendors WHERE archived_at IS NULL AND company_id IS NOT NULL AND kind IN ('buy', 'sell')`)).rows[0]!.n;
  const proposals: LinkProposal[] = [];
  for (const v of vs) {
    const company_name = companyNameOf(v.name);
    const exactIds = new Set((await c.query<{ id: string }>(
      `SELECT id FROM perfume.contact_companies WHERE archived_at IS NULL AND merged_into_id IS NULL AND name_key = perfume.name_key($1)`, [company_name])).rows.map((r) => r.id));
    const sug = (await companySuggestions(c, company_name, v.short_name)) as Array<Record<string, unknown>>;
    const seen = new Set<string>();
    const candidates: Candidate[] = [];
    for (const s of sug) {
      const id = String(s["id"]); if (seen.has(id)) continue; seen.add(id);
      candidates.push({ id, name: String(s["name"]), role: (s["role"] as string | null) ?? null, city: (s["city"] as string | null) ?? null, state: (s["state"] as string | null) ?? null,
        country: (s["country"] as string | null) ?? null, people: Number(s["people"] ?? 0), exact: exactIds.has(id) });
    }
    for (const id of exactIds) if (!seen.has(id)) {
      const r = (await c.query(`SELECT cc.id, cc.name, cc.role, cc.city, cc.state, cc.country, (SELECT count(*)::int FROM perfume.contact_people p WHERE p.company_id = cc.id AND p.archived_at IS NULL) AS people
                                  FROM perfume.contact_companies cc WHERE cc.id = $1`, [id])).rows[0];
      if (r) candidates.unshift({ ...r, people: Number(r.people), exact: true } as Candidate);
    }
    // Rank (owner 2026-11-27 17:44 CT review of the live preview: "La Esperanza" must not land on a person named Esperanza,
    // "Premier" on Premier Fragrance LLC, not Premier Beauty Brands): the owner's own note in Contacts ("your vendor",
    // "also your direct vendor") first, then a name that starts with the list's company name, then same name, then people.
    const base = matchKey(company_name);
    const score = (x: Candidate) => (/your (direct )?vendor/i.test(x.name) ? 4 : 0) + (base.length >= 5 && matchKey(x.name).startsWith(base) ? 2 : 0) + (x.exact ? 2 : 0);
    candidates.sort((a, b) => score(b) - score(a) || b.people - a.people || a.name.localeCompare(b.name));
    const exact = candidates.filter((x) => x.exact);
    const action: LinkProposal["action"] = candidates.length === 0 ? "create" : (exact.length === 1 || candidates.length === 1) ? "link" : "choose";
    // "choose": the proposal is the best-ranked candidate; the owner confirms or changes it (or finds another company).
    const company_id = action === "create" ? null : (exact.length === 1 && score(exact[0]!) >= score(candidates[0]!) ? exact[0]!.id : candidates[0]!.id);
    proposals.push({ vendor_id: v.id, vendor: v.name, short_name: v.short_name, kind: v.kind, company_name, action, company_id, candidates });
  }
  return { proposals, linked, unlinked: vs.length };
}

/** Link one list to one company: the company becomes a vendor when the list is a supplier's (customer → both). */
export async function linkVendorCompany(c: pg.PoolClient, uid: string, vendorId: string, companyId: string | null) {
  const v = (await c.query<{ id: string; name: string; kind: string; company_id: string | null }>(
    `SELECT id, name, kind, company_id FROM perfume.vendors WHERE id = $1 AND archived_at IS NULL FOR UPDATE`, [vendorId])).rows[0];
  if (!v) throw new ProfileNotFound();
  if (companyId) {
    const co = (await c.query<{ id: string; role: string | null; merged_into_id: string | null }>(
      `SELECT id, role, merged_into_id FROM perfume.contact_companies WHERE id = $1 AND archived_at IS NULL`, [companyId])).rows[0];
    if (!co) throw new ProfileInvalid("That company is not in Contacts.");
    await c.query(`UPDATE perfume.vendors SET company_id = $2, updated_at = now() WHERE id = $1`, [vendorId, companyId]);
    const role = v.kind === "buy" ? (co.role === "customer" || co.role === "both" ? "both" : "vendor") : co.role;
    if (role !== co.role) await c.query(`UPDATE perfume.contact_companies SET role = $2, updated_at = now() WHERE id = $1`, [companyId, role]);
    await c.query(`INSERT INTO perfume.lead_events (entity, entity_id, company_id, action, detail, created_by) VALUES ('company', $1, $1, 'price_list_vendor_linked', $2::jsonb, $3)`,
      [companyId, JSON.stringify({ vendor_id: vendorId, vendor: v.name, kind: v.kind, previous_company_id: v.company_id, role_before: co.role, role_after: role }), uid]);
  } else {
    await c.query(`UPDATE perfume.vendors SET company_id = NULL, updated_at = now() WHERE id = $1`, [vendorId]);
    if (v.company_id) await c.query(`INSERT INTO perfume.lead_events (entity, entity_id, company_id, action, detail, created_by) VALUES ('company', $1, $1, 'price_list_vendor_unlinked', $2::jsonb, $3)`,
      [v.company_id, JSON.stringify({ vendor_id: vendorId, vendor: v.name }), uid]);
  }
}

export const applyLinksSchema = z.object({
  decisions: z.array(z.object({
    vendor_id: z.string().uuid(),
    company_id: z.string().uuid().nullable().optional(),
    create_name: z.string().trim().min(1).max(300).optional(),
  }).refine((d) => Boolean(d.company_id) !== Boolean(d.create_name), "Each list needs a company or a new company name.")).min(1).max(200),
});

/** Apply the owner's decisions in one transaction: link, or make the company in Contacts and link it. */
export async function applyVendorLinks(c: pg.PoolClient, uid: string, x: z.infer<typeof applyLinksSchema>) {
  let linked = 0, created = 0;
  await c.query("SAVEPOINT vendor_links");
  try {
    for (const d of x.decisions) {
      let companyId = d.company_id ?? null;
      if (!companyId) {
        const v = (await c.query<{ name: string; kind: string; contact: string | null }>(`SELECT name, kind, contact FROM perfume.vendors WHERE id = $1 AND archived_at IS NULL`, [d.vendor_id])).rows[0];
        if (!v) throw new ProfileInvalid("A list in the decisions is no longer there. Nothing was saved.");
        const role = v.kind === "buy" ? "vendor" : null;
        companyId = (await c.query<{ id: string }>(
          `INSERT INTO perfume.contact_companies (name, role, status, source, notes, created_by) VALUES ($1, $2, 'active', 'Price list vendor', $3, $4) RETURNING id`,
          [d.create_name, role, v.kind === "sell" ? "Competitor (wholesale competition price list)" : null, uid])).rows[0]!.id;
        await c.query(`INSERT INTO perfume.lead_events (entity, entity_id, company_id, action, detail, created_by) VALUES ('company', $1, $1, 'created_from_price_list', $2::jsonb, $3)`,
          [companyId, JSON.stringify({ vendor_id: d.vendor_id, vendor: v.name, contact: v.contact }), uid]);
        created++;
      }
      await linkVendorCompany(c, uid, d.vendor_id, companyId);
      linked++;
    }
  } catch (e) {
    await c.query("ROLLBACK TO SAVEPOINT vendor_links");
    throw e;
  }
  await c.query("RELEASE SAVEPOINT vendor_links");
  return { linked, created };
}

/* ------------------------------------------------------------------ role + type on the one record */

export const companyRoleSchema = z.object({
  role: z.enum(["vendor", "customer", "both"]).nullable().optional(),
  vendor_type: z.string().trim().max(200).nullable().optional(),
  customer_type: z.string().trim().max(200).nullable().optional(),
}).refine((x) => x.role !== undefined || x.vendor_type !== undefined || x.customer_type !== undefined, "Choose a role or a type.");

/** Leads "Convert to vendor / customer / both" and its types (owner 2026-11-27 17:20 CT: "TRADERS IS A TYPE OF CUSTOMER OR
 *  VENDOR"). A type must be in the catalog (Catalogs → vendor_type / customer_type). One lead_events row with before / after. */
export async function setCompanyRole(c: pg.PoolClient, uid: string, companyId: string, x: z.infer<typeof companyRoleSchema>) {
  const co = (await c.query<{ role: string | null; vendor_type: string | null; customer_type: string | null }>(
    `SELECT role, vendor_type, customer_type FROM perfume.contact_companies WHERE id = $1 AND archived_at IS NULL FOR UPDATE`, [companyId])).rows[0];
  if (!co) throw new ProfileNotFound();
  for (const [kind, v] of [["vendor_type", x.vendor_type], ["customer_type", x.customer_type]] as const) {
    if (v) {
      const ok = (await c.query(`SELECT 1 FROM perfume.catalog_values WHERE kind = $1 AND value = $2 AND archived_at IS NULL`, [kind, v])).rowCount;
      if (!ok) throw new ProfileInvalid(`"${v}" is not a ${kind === "vendor_type" ? "vendor" : "customer"} type in Catalogs.`);
    }
  }
  // A company with lists it sells to us stays a vendor: it can become both, not customer only.
  const sellsToUs = (await c.query(`SELECT 1 FROM perfume.vendors WHERE company_id = $1 AND kind = 'buy' AND archived_at IS NULL LIMIT 1`, [companyId])).rowCount;
  if (sellsToUs && (x.role === "customer" || x.role === null)) throw new ProfileInvalid("This company has price lists it sells to you — it stays a vendor (choose Both).");
  const next = {
    role: x.role !== undefined ? x.role : co.role,
    vendor_type: x.vendor_type !== undefined ? (x.vendor_type || null) : co.vendor_type,
    customer_type: x.customer_type !== undefined ? (x.customer_type || null) : co.customer_type,
  };
  if (next.role === co.role && next.vendor_type === co.vendor_type && next.customer_type === co.customer_type) return { changed: false, ...next };
  await c.query(`UPDATE perfume.contact_companies SET role = $2, vendor_type = $3, customer_type = $4, updated_at = now() WHERE id = $1`,
    [companyId, next.role, next.vendor_type, next.customer_type]);
  await c.query(`INSERT INTO perfume.lead_events (entity, entity_id, company_id, action, detail, created_by) VALUES ('company', $1, $1, 'role_type_set', $2::jsonb, $3)`,
    [companyId, JSON.stringify({ before: co, after: next }), uid]);
  return { changed: true, ...next };
}
