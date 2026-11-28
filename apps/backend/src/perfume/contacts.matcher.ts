/**
 * PERFUME-CONTACTS — the dedupe keys of every contact company and person, read ONCE per import batch or Google run.
 *
 * Why: the contacts tables are FORCE RLS (perfume.is_owner()). Under RLS the planner may not use an index for a
 * non-leakproof predicate (right(regexp_replace(phone…)), phone_keys @> …), so each "same phone?" question was a full
 * scan that ran is_owner() and a regular expression on every row. Measured on prod 2026-11-26: a 500-record import
 * batch went from 8 s at 0 companies to 277 s at ~3,800, then 502; locally the same query was killed for memory.
 * Here the owner's own rows are read once (one scan, under the same RLS), and every question is a map lookup.
 * The matching rules are the SAME as the SQL they replace — key order, the archived filter, and "two ids from the same
 * directory never merge" — and the maps are kept current as rows are inserted or filled in the same transaction.
 */
import type pg from "pg";

type Co = { id: string; extSource: string | null; extId: string | null; archived: boolean };
type Row = {
  id: string; external_source: string | null; external_directory_id: string | null; google_place_id: string | null; phone: string | null;
  domain: string | null; name_key: string | null; city_l: string | null; archived: boolean;
};

/** Last 10 digits — the same rule as right(regexp_replace(x, '\D', '', 'g'), 10) and perfume.phone_keys() (10+ digits only). */
export const phone10 = (s: unknown): string | null => { const d = String(s ?? "").replace(/\D/g, ""); return d.length >= 10 ? d.slice(-10) : null; };

const push = (m: Map<string, string[]>, k: string | null | undefined, id: string) => {
  if (!k) return;
  const a = m.get(k);
  if (!a) m.set(k, [id]); else if (!a.includes(id)) a.push(id);
};

export type MatchQuery = {
  externalSource?: string | null; externalId?: string | null; placeId?: string | null;
  phones: string[]; emails: string[]; domain?: string | null; nameKey?: string | null; city?: string | null;
};

export class ContactMatcher {
  private cos = new Map<string, Co>();
  private byExternal = new Map<string, string>();
  private byPlace = new Map<string, string>();
  private byCoPhone = new Map<string, string[]>();
  private byPersonPhone = new Map<string, string[]>();
  private byEmail = new Map<string, string[]>();
  private byDomain = new Map<string, string[]>();
  private byNameCity = new Map<string, string[]>();

  /** One read of the owner's companies and people (oldest first, so "first match" = the SQL's ORDER BY created_at). */
  static async load(c: pg.PoolClient): Promise<ContactMatcher> {
    const m = new ContactMatcher();
    const cos = await c.query<Row>(
      `SELECT id, external_source, external_directory_id, google_place_id, phone, domain, name_key, lower(city) AS city_l, archived_at IS NOT NULL AS archived
         FROM perfume.contact_companies ORDER BY created_at, id`);
    for (const r of cos.rows) m.addCompanyRow(r);
    const people = await c.query<{ company_id: string; email: string | null; phone_keys: string[] | null }>(
      `SELECT company_id, email, phone_keys FROM perfume.contact_people WHERE archived_at IS NULL ORDER BY created_at, id`);
    for (const p of people.rows) m.addPerson(p.company_id, p.email, p.phone_keys ?? []);
    return m;
  }

  get size(): number { return this.cos.size; }

  addCompanyRow(r: Row): void {
    const co: Co = { id: r.id, extSource: r.external_source, extId: r.external_directory_id, archived: r.archived };
    this.cos.set(r.id, co);
    if (r.external_directory_id) this.byExternal.set(`${r.external_source ?? ""}\u0000${r.external_directory_id}`, r.id);
    if (r.google_place_id && !this.byPlace.has(r.google_place_id)) this.byPlace.set(r.google_place_id, r.id);
    const digits = String(r.phone ?? "").replace(/\D/g, "");
    if (digits) push(this.byCoPhone, digits.slice(-10), r.id);
    if (r.domain) push(this.byDomain, r.domain, r.id);
    if (r.name_key && r.city_l) push(this.byNameCity, `${r.name_key}\u0000${r.city_l}`, r.id);
  }

  /** Re-read one company's keys after an insert or a fill-blanks update in this transaction. */
  async refreshCompany(c: pg.PoolClient, id: string): Promise<void> {
    const r = (await c.query<Row>(
      `SELECT id, external_source, external_directory_id, google_place_id, phone, domain, name_key, lower(city) AS city_l, archived_at IS NOT NULL AS archived
         FROM perfume.contact_companies WHERE id = $1`, [id])).rows[0];
    if (r) this.addCompanyRow(r);
  }

  addPerson(companyId: string, email: string | null, phoneKeys: string[]): void {
    if (email) push(this.byEmail, email.toLowerCase(), companyId);
    for (const k of phoneKeys) push(this.byPersonPhone, k, companyId);
  }

  /**
   * Same order as the SQL it replaces: outside key → Google place_id → phone (company, then person) → email → web domain
   * → name_key + city. With `notSameDirectory`, a company holding another id of the SAME directory is never a match.
   */
  find(q: MatchQuery, opts: { notSameDirectory?: string | null; freeMail?: Set<string> } = {}): [string | null, string | null] {
    const src = opts.notSameDirectory ?? null;
    const okDir = (id: string) => { const co = this.cos.get(id); return !!co && (!src || co.extSource !== src || co.extId == null); };
    const live = (id: string) => { const co = this.cos.get(id); return !!co && !co.archived && okDir(id); };
    if (q.externalId) { const id = this.byExternal.get(`${q.externalSource ?? ""}\u0000${q.externalId}`); if (id) return [id, "outside key"]; }
    if (q.placeId) { const id = this.byPlace.get(q.placeId); if (id) return [id, "place_id"]; }
    // A person's email names ONE person at ONE company; a phone can be a shared main line, a relative's cell or a forwarding number
    // (owner 2026-11-28: 96 signature records landed on another company that shares a phone). Email first, then phone.
    for (const e of q.emails) { const id = (this.byEmail.get(e.toLowerCase()) ?? []).find(okDir); if (id) return [id, "email"]; }
    for (const p of q.phones) {
      const id = (this.byCoPhone.get(p) ?? []).find(live) ?? (this.byPersonPhone.get(p) ?? []).find(okDir);
      if (id) return [id, "phone"];
    }
    if (q.domain && !opts.freeMail?.has(q.domain)) { const id = (this.byDomain.get(q.domain) ?? []).find(live); if (id) return [id, "domain"]; }
    if (q.nameKey && q.city) { const id = (this.byNameCity.get(`${q.nameKey}\u0000${q.city.toLowerCase()}`) ?? []).find(live); if (id) return [id, "name + city"]; }
    return [null, null];
  }
}

/** perfume.name_key() for many names in one round trip — the ONE SQL definition stays the only one. */
export async function nameKeys(c: pg.PoolClient, names: string[]): Promise<string[]> {
  if (!names.length) return [];
  const r = await c.query<{ k: string | null }>(`SELECT perfume.name_key(n) AS k FROM unnest($1::text[]) WITH ORDINALITY AS t(n, i) ORDER BY i`, [names]);
  return r.rows.map((x) => x.k ?? "");
}
