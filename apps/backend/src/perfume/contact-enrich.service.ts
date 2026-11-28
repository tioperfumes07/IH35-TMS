/**
 * PERFUME — find the contact info a lead is missing (owner 2026-11-28 14:24–14:26 CT: "i click on a and a beauty supply, you have
 * it as a lead, but there is no company email or phone … research in google linkedin etc you will find there … the contacts for
 * all those leads").
 * For each company with no phone and no email: one Google Places text search on its own name + address (or city / state / country).
 * Only a result that IS this company is used — same name key (perfume.name_key: no accents, punctuation or Inc. / LLC tail) and,
 * when we know the city, the same city. Its phone, website, Maps link and address fill BLANKS on this company only (never
 * overwrite, never create a new company). When Google gives a website, the home page and its /contact page are read for an
 * email address on the company's own domain (or a plain info@ / sales@ style address); that email becomes a person on the
 * company, found_in 'website'. Each company that got anything gets a contact_origins row saying where it came from.
 * LinkedIn has no lookup we may call, so it is not searched; a company still missing everything after this stays listed with
 * "No email or phone" for the owner.
 */
import type pg from "pg";
import { z } from "zod";
import { searchText, type ProspectRow } from "./google-prospects.js";

type Q = Pick<pg.PoolClient, "query">;

export const findContactInfoSchema = z.object({
  /** The companies to look up; empty = the next `limit` companies with no email or phone that were not looked up in the last 30 days. */
  ids: z.array(z.string().uuid()).max(50).optional(),
  limit: z.number().int().min(1).max(25).default(10),
  /** Look up again every company not looked up since this moment (a run passes its own start, so a fixed matcher can re-check). */
  since: z.string().datetime({ offset: true }).optional(),
});

export type EnrichOutcome = { id: string; name: string; result: "phone" | "website" | "email" | "nothing" | "no_match" | "error";
  phone?: string | null; website?: string | null; email?: string | null; note?: string };

const NO_REACH = `coalesce(co.phone, '') = '' AND coalesce(co.phone_intl, '') = ''
  AND NOT EXISTS (SELECT 1 FROM perfume.contact_people p WHERE p.company_id = co.id AND p.archived_at IS NULL
                   AND (p.email IS NOT NULL OR cardinality(coalesce(p.phones, '{}'::text[])) > 0))`;

/** How many companies still have no email or phone, and how many of them were already looked up. */
export async function unreachableCounts(c: Q) {
  const r = (await c.query<{ total: number; looked_up: number }>(
    `SELECT count(*)::int AS total,
            count(*) FILTER (WHERE EXISTS (SELECT 1 FROM perfume.contact_origins o WHERE o.company_id = co.id AND o.how = 'Contact info lookup'))::int AS looked_up
       FROM perfume.contact_companies co WHERE co.archived_at IS NULL AND co.merged_into_id IS NULL AND ${NO_REACH}`)).rows[0]!;
  return r;
}

const EMAIL_RE = /[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}/gi;
const GENERIC = /^(info|sales|ventas|contact|contacto|hello|hola|office|orders|pedidos|admin|support|customerservice|service|wholesale|mayoreo)@/;
const BAD = /\.(png|jpe?g|gif|webp|svg)$|@(example|sentry|wixpress|domain|email)\.|^(noreply|no-reply|donotreply)@/;

/** The site's host without www. — only a public http(s) name (never an IP or localhost). */
export function siteHost(url: string | null): string | null {
  if (!url) return null;
  try {
    const u = new URL(url);
    if (!/^https?:$/.test(u.protocol)) return null;
    const h = u.hostname.toLowerCase();
    if (h === "localhost" || /^[\d.]+$/.test(h) || h.includes(":") || !h.includes(".")) return null;
    return h.replace(/^www\./, "");
  } catch { return null; }
}

/** The best email on a page: one on the company's own domain first (a generic box before a person's), else a generic box elsewhere. */
export function pickEmail(html: string, host: string): string | null {
  const found = [...new Set((html.match(EMAIL_RE) ?? []).map((e) => e.toLowerCase().replace(/^mailto:/, "")))].filter((e) => !BAD.test(e));
  const root = host.split(".").slice(-2).join(".");
  const own = found.filter((e) => e.split("@")[1]!.endsWith(root));
  return own.find((e) => GENERIC.test(e)) ?? own[0] ?? found.find((e) => GENERIC.test(e)) ?? null;
}

async function readEmail(website: string, fetchImpl: typeof fetch): Promise<string | null> {
  const host = siteHost(website);
  if (!host) return null;
  const origin = new URL(website).origin;
  for (const path of ["", "/contact", "/contact-us", "/pages/contact", "/contacto"]) {
    try {
      const res = await fetchImpl(origin + path, { redirect: "follow", signal: AbortSignal.timeout(8000), headers: { "user-agent": "Mozilla/5.0 (TIO Perfumes contact lookup)" } });
      if (!res.ok || !(res.headers.get("content-type") ?? "").includes("html")) continue;
      const e = pickEmail((await res.text()).slice(0, 600_000), host);
      if (e) return e;
    } catch { /* site down or slow — try the next page */ }
  }
  return null;
}

/** "United States" / "USA" / "US" → US; "México" / "Mexico" / "MX" → MX; anything else as written. */
export function countryCode(country: string | null): string | null {
  const x = (country ?? "").trim().toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  if (!x) return null;
  if (["us", "usa", "united states", "united states of america", "estados unidos"].includes(x)) return "US";
  if (["mx", "mexico"].includes(x)) return "MX";
  return country;
}

/**
 * Is this Google result the same company? The name key must be the same, or one must be the other plus words (perfume.name_key
 * already drops Inc. / LLC / punctuation). Then the place must agree, because one name can be a different store in another city:
 *  - our street number + street word is in Google's address, or
 *  - our city is in Google's address / Google's city is in ours, or
 *  - (exact name only) the city we have is not a real city — research files wrote "US", "Newark port", "New York (Hauppauge) /
 *    Newark port" — or there is none, and the country does not disagree.
 */
export function sameCompany(co: { name_key: string | null; city: string | null; country: string | null; address?: string | null }, r: ProspectRow, key: string | null): boolean {
  if (!key || !co.name_key || key.length < 3) return false;
  const ours = countryCode(co.country), theirs = countryCode(r.country);
  if (ours && theirs && ours !== theirs) return false;
  const exact = key === co.name_key;
  if (!exact && !(key.startsWith(co.name_key + " ") || co.name_key.startsWith(key + " "))) return false;
  const gAddr = `${r.address ?? ""} ${r.city ?? ""}`.toLowerCase();
  const street = (co.address ?? "").toLowerCase().match(/^\s*(\d+[a-z]?)\s+([a-z0-9]+)/);
  if (street && gAddr.includes(street[1]!) && gAddr.includes(street[2]!)) return true;
  const city = (co.city ?? "").trim().toLowerCase();
  if (city && r.city && (city.includes(r.city.toLowerCase()) || gAddr.includes(city))) return true;
  const realCity = city.length >= 3 && !/[/()]|\bport\b|\barea\b|^(us|usa|united states|mx|mexico|méxico)$/.test(city);
  return exact && !realCity && !street;
}

type Co = { id: string; name: string; address: string | null; city: string | null; state: string | null; country: string | null; name_key: string | null };

/** Looks up the given companies (or the next batch with no email or phone) and fills what Google and their own website give. */
/** `db` runs one short database step — Google and the websites are read BETWEEN steps, never while a transaction is open. */
export type Db = <T>(fn: (c: Q) => Promise<T>) => Promise<T>;

export async function findContactInfo(db: Db, uid: string, input: z.infer<typeof findContactInfoSchema>,
  deps: { search?: typeof searchText; fetchImpl?: typeof fetch } = {}) {
  const search = deps.search ?? searchText;
  const fetchImpl = deps.fetchImpl ?? fetch;
  const cos = await db(async (c) => (await c.query<Co>(input.ids?.length
    ? `SELECT co.id::text, co.name, co.address, co.city, co.state, co.country, co.name_key FROM perfume.contact_companies co
        WHERE co.id = ANY($1::uuid[]) AND co.archived_at IS NULL AND co.merged_into_id IS NULL`
    : `SELECT co.id::text, co.name, co.address, co.city, co.state, co.country, co.name_key FROM perfume.contact_companies co
        WHERE co.archived_at IS NULL AND co.merged_into_id IS NULL AND ${NO_REACH}
          AND NOT EXISTS (SELECT 1 FROM perfume.contact_origins o WHERE o.company_id = co.id AND o.how = 'Contact info lookup'
                           AND o.created_at > coalesce($2::timestamptz, now() - interval '30 days'))
        ORDER BY co.created_at, co.id LIMIT $1`, input.ids?.length ? [input.ids] : [input.limit, input.since ?? null])).rows);
  const out: EnrichOutcome[] = [];
  for (const co of cos) {
    try { out.push(await lookupOne(db, uid, co, search, fetchImpl)); }
    catch (e) { out.push({ id: co.id, name: co.name, result: "error", note: String((e as Error).message).slice(0, 200) }); }
  }
  const tally = { looked_up: out.length, phone: 0, website: 0, email: 0, no_match: 0, nothing: 0, error: 0 };
  for (const o of out) {
    if (o.phone) tally.phone++; if (o.website) tally.website++; if (o.email) tally.email++;
    if (o.result === "no_match") tally.no_match++; if (o.result === "nothing") tally.nothing++; if (o.result === "error") tally.error++;
  }
  return { ...tally, remaining: await db((c) => unreachableCounts(c)), rows: out };
}

async function lookupOne(db: Db, uid: string, co: Co, search: typeof searchText, fetchImpl: typeof fetch): Promise<EnrichOutcome> {
  const cc = countryCode(co.country);
  const where = co.address ?? [co.city, co.state, cc === "MX" ? "México" : cc === "US" ? "USA" : co.country].filter(Boolean).join(", ");
  const query = where ? `${co.name} ${where}` : co.name;
  const page = await search(query, { maxResults: 5, regionCode: cc === "MX" ? "mx" : cc === "US" ? "us" : undefined });
  // Only this company: the same name key, and the same city when we have one (Google's first hit for a common name can be another store).
  const keys = page.rows.length
    ? await db(async (c) => (await c.query<{ k: string }>(`SELECT perfume.name_key(x) AS k FROM unnest($1::text[]) WITH ORDINALITY AS t(x, n) ORDER BY n`,
        [page.rows.map((r) => r.name)])).rows.map((r) => r.k))
    : [];
  const hit = page.rows.find((r, i) => r.business_status !== "CLOSED_PERMANENTLY" && sameCompany(co, r, keys[i] ?? null));
  const log = (c: Q, detail: string, url: string | null) => c.query(
    `INSERT INTO perfume.contact_origins (company_id, occurred_on, how, source, source_url, detail, created_by)
     VALUES ($1::uuid, (now() AT TIME ZONE 'America/Chicago')::date, 'Contact info lookup', 'Google Places', $2, $3, $4::uuid)`, [co.id, url, detail, uid]);
  if (!hit) {
    await db((c) => log(c, `Google search "${query}": ${page.rows.length} results, none is this company`, null));
    return { id: co.id, name: co.name, result: "no_match", note: page.rows[0]?.name ? `closest: ${page.rows[0].name}` : "no results" };
  }
  const found = hit.website ? await readEmail(hit.website, fetchImpl) : null;
  return db(async (c) => {
    // The place may already belong to another company in the list (a duplicate) — then fill the contact info but leave place_id.
    const owned = ((await c.query(`SELECT 1 FROM perfume.contact_companies WHERE google_place_id = $1 AND id <> $2::uuid`, [hit.place_id, co.id])).rowCount ?? 0) > 0;
    await c.query(
      `UPDATE perfume.contact_companies SET
          google_place_id = CASE WHEN $13 THEN google_place_id ELSE coalesce(google_place_id, $2) END,
          address = coalesce(address, $3), city = coalesce(city, $4), state = coalesce(state, $5), zip = coalesce(zip, $6),
          country = coalesce(country, $7), phone = coalesce(nullif(phone, ''), $8), phone_intl = coalesce(nullif(phone_intl, ''), $9),
          website = coalesce(nullif(website, ''), $10), maps_uri = coalesce(maps_uri, $11), google_business_status = $12,
          google_fetched_at = now(), updated_at = now()
        WHERE id = $1::uuid`,
      [co.id, hit.place_id, hit.address, hit.city, hit.state, hit.zip, hit.country, hit.phone, hit.phone_intl, hit.website, hit.maps_uri,
        hit.business_status, owned]);
    let email = found;
    let emailNote = "";
    if (email) {
      const taken = (await c.query<{ name: string }>(
        `SELECT co.name FROM perfume.contact_people p JOIN perfume.contact_companies co ON co.id = p.company_id
          WHERE p.email = $1 AND p.archived_at IS NULL LIMIT 1`, [email])).rows[0];
      if (taken) { emailNote = ` · ${email} already on ${taken.name} (same company twice?)`; email = null; }
      else await c.query(
        `INSERT INTO perfume.contact_people (company_id, email, found_in, how_started, created_by) VALUES ($1::uuid, $2, 'website', 'Contact info lookup', $3::uuid)`,
        [co.id, email, uid]);
    }
    const got = [hit.phone && `phone ${hit.phone}`, hit.website && `website ${hit.website}`, email && `email ${email}`].filter(Boolean).join(" · ");
    await log(c, `Google "${hit.name}" ${hit.address ?? ""}: ${got || "found, but no phone, website or email listed"}${owned ? " · same Google place as another company in the list" : ""}${emailNote}`, hit.maps_uri);
    return { id: co.id, name: co.name, result: email ? "email" : hit.phone ? "phone" : hit.website ? "website" : "nothing",
      phone: hit.phone, website: hit.website, email, note: emailNote || undefined } as EnrichOutcome;
  });
}
