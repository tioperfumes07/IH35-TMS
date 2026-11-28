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

type Candidate = { id: string; name: string; role: string | null; city: string | null; state: string | null; country: string | null; people: number; exact: boolean;
  /** "email": a person of this company has the address the list came from; "domain": same company domain. */ by_email?: "email" | "domain" };
const FREE_MAIL = ["gmail.com", "yahoo.com", "hotmail.com", "outlook.com", "aol.com", "icloud.com", "live.com", "msn.com"];
/** Every email the list came from: the vendor's contact and the addresses in its price-list file names ("… mail x@y.com"). */
async function vendorEmails(c: pg.PoolClient, vendorId: string): Promise<string[]> {
  const r = (await c.query<{ t: string }>(
    `SELECT coalesce(v.contact, '') || ' ' || coalesce((SELECT string_agg(pl.file_name, ' ') FROM perfume.price_lists pl WHERE pl.vendor_id = v.id), '') AS t
       FROM perfume.vendors v WHERE v.id = $1`, [vendorId])).rows[0]?.t ?? "";
  return [...new Set((r.match(/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g) ?? []).map((e) => e.toLowerCase()))];
}
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
    // The email the list came from (live preview 11-27: JIZAN's lists come from ardalan@jizanperfumes.com, a person of
    // "Jizanperfumes"; QFG's from @parlux.com): the strongest proof of which company it is.
    const emails = await vendorEmails(c, v.id);
    if (emails.length) {
      const domains = [...new Set(emails.map((e) => e.split("@")[1]!).filter((d) => !FREE_MAIL.includes(d)))];
      const hits = (await c.query<{ id: string; name: string; role: string | null; city: string | null; state: string | null; country: string | null; people: number; how: "email" | "domain" }>(
        `SELECT cc.id, cc.name, cc.role, cc.city, cc.state, cc.country,
                (SELECT count(*)::int FROM perfume.contact_people x WHERE x.company_id = cc.id AND x.archived_at IS NULL) AS people,
                CASE WHEN bool_or(lower(p.email) = ANY($1::text[])) THEN 'email' ELSE 'domain' END AS how
           FROM perfume.contact_people p JOIN perfume.contact_companies cc ON cc.id = p.company_id AND cc.archived_at IS NULL AND cc.merged_into_id IS NULL
          WHERE p.archived_at IS NULL AND (lower(p.email) = ANY($1::text[]) OR split_part(lower(p.email), '@', 2) = ANY($2::text[]))
          GROUP BY cc.id`, [emails, domains])).rows;
      for (const h of hits) {
        const at = candidates.find((x) => x.id === h.id);
        if (at) at.by_email = h.how;
        else { candidates.push({ id: h.id, name: h.name, role: h.role, city: h.city, state: h.state, country: h.country, people: Number(h.people), exact: exactIds.has(h.id), by_email: h.how }); seen.add(h.id); }
      }
    }
    // Rank (owner 2026-11-27 17:44 CT review of the live preview: "La Esperanza" must not land on a person named Esperanza,
    // "Premier" on Premier Fragrance LLC, not Premier Beauty Brands): the owner's own note in Contacts ("your vendor",
    // "also your direct vendor") first, then a name that starts with the list's company name, then same name, then people.
    const base = matchKey(company_name);
    const score = (x: Candidate) => (x.by_email === "email" ? 8 : x.by_email === "domain" ? 6 : 0) + (/your (direct )?vendor/i.test(x.name) ? 4 : 0)
      + (base.length >= 5 && matchKey(x.name).startsWith(base) ? 2 : 0) + (x.exact ? 2 : 0);
    candidates.sort((a, b) => score(b) - score(a) || b.people - a.people || a.name.localeCompare(b.name));
    const exact = candidates.filter((x) => x.exact);
    const byMail = candidates.filter((x) => x.by_email);
    const action: LinkProposal["action"] = candidates.length === 0 ? "create"
      : (byMail.length === 1 || (byMail.length === 0 && (exact.length === 1 || candidates.length === 1))) ? "link" : "choose";
    // "choose": the proposal is the best-ranked candidate; the owner confirms or changes it (or finds another company).
    const company_id = action === "create" ? null : candidates[0]!.id;
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

/* ------------------------------------------------------------------ the company's real name (owner 2026-11-27 18:32 CT) */

export const companyNameSchema = z.object({ name: z.string().trim().min(1).max(300) });

/** Rename a company in Contacts — one history row (from → to). The owner's words: "get this fixed now … for those
 *  unassigned company name i will assign, they stay in the screen so i can assign". */
export async function renameCompany(c: pg.PoolClient, uid: string, companyId: string, name: string) {
  const co = (await c.query<{ name: string }>(`SELECT name FROM perfume.contact_companies WHERE id = $1 AND archived_at IS NULL FOR UPDATE`, [companyId])).rows[0];
  if (!co) throw new ProfileNotFound();
  const to = name.trim();
  if (to === co.name) return { changed: false, name: to };
  await c.query(`UPDATE perfume.contact_companies SET name = $2, updated_at = now() WHERE id = $1`, [companyId, to]);
  await c.query(`INSERT INTO perfume.lead_events (entity, entity_id, company_id, action, detail, created_by) VALUES ('company', $1, $1, 'renamed', $2::jsonb, $3)`,
    [companyId, JSON.stringify({ from: co.name, to, why: "company name check (price-list vendor)" }), uid]);
  return { changed: true, name: to };
}

/** Linked lists whose company carries another name than the list (a name made from an email domain — "Bsfragrances" —
 *  or a person's name holding the supplier's email). They stay on the screen until the owner saves a name. A name the owner
 *  saved is never asked again: a 'renamed' or 'name_checked' history row marks it. */
export async function companyNameCheck(c: pg.PoolClient) {
  const rows = (await c.query<{ vendor_id: string; vendor: string; company_id: string; company: string }>(
    `SELECT v.id AS vendor_id, v.name AS vendor, cc.id AS company_id, cc.name AS company
       FROM perfume.vendors v JOIN perfume.contact_companies cc ON cc.id = v.company_id AND cc.archived_at IS NULL
      WHERE v.archived_at IS NULL AND v.kind IN ('buy', 'sell')
        AND NOT EXISTS (SELECT 1 FROM perfume.lead_events e WHERE e.company_id = cc.id AND e.action IN ('renamed', 'name_checked'))
      ORDER BY v.name`)).rows;
  return {
    rows: rows.filter((r) => {
      const a = matchKey(companyNameOf(r.vendor)), b = matchKey(r.company);
      return !(a === b || (a.length >= 4 && b.startsWith(a) && /\s/.test(r.company.trim())));
    }).map((r) => ({ ...r, proposed: companyNameOf(r.vendor) })),
  };
}

/** "This name is right" — keeps the company's name and takes it off the check (one history row). */
export async function confirmCompanyName(c: pg.PoolClient, uid: string, companyId: string) {
  const co = (await c.query<{ name: string }>(`SELECT name FROM perfume.contact_companies WHERE id = $1 AND archived_at IS NULL`, [companyId])).rows[0];
  if (!co) throw new ProfileNotFound();
  await c.query(`INSERT INTO perfume.lead_events (entity, entity_id, company_id, action, detail, created_by) VALUES ('company', $1, $1, 'name_checked', $2::jsonb, $3)`,
    [companyId, JSON.stringify({ name: co.name }), uid]);
  return { ok: true };
}
