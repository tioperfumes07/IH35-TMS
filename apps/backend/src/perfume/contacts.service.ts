/**
 * PERFUME-CONTACTS service — the TIO Perfumes contacts database (owner 2026-11-25 22:04 / 22:11 CT) and the Google business
 * search that feeds it (22:09 CT). Reads and writes perfume.* only; every call runs as the desk owner (RLS perfume.is_owner()).
 */
import type pg from "pg";
import { withCurrentUser } from "../auth/db.js";
import { ContactMatcher, nameKeys } from "./contacts.matcher.js";
import {
  buildPlan, cityLabel, phone10, planCounts, searchText,
  type PlannedSearch, type ProspectKeyword, type ProspectRow,
} from "./google-prospects.js";

export type ContactRole = "vendor" | "customer" | "both";

/* ------------------------------------------------------------------ list / profile */

export type ContactListQuery = { role?: ContactRole | "none" | "all"; q?: string; source?: string; country?: string; limit?: number; offset?: number;
  /** Owner 2026-11-26 15:56 CT: "the boxes are not drop down filter combobox so i can typ city etc." — each one any of several values. */
  countries?: string[]; states?: string[]; cities?: string[]; categories?: string[]; sources?: string[]; hows?: string[];
  /** Owner 2026-11-26 16:59 CT "get this all completely done" — the rest of the designed boxes: region, customer type (Duty
   *  free is one), vendor type, business type, status, trade show, and how to reach them (email / phone only / neither). */
  regions?: string[]; ctypes?: string[]; vtypes?: string[]; segments?: string[]; statuses?: string[]; shows?: string[]; reach?: string[];
  /** Owner 2026-11-26 17:38 CT: leads "categorized … from research or the source" — any of the lead source kinds (email, leaked email, phone, research …). */
  kinds?: string[];
  /** Owner 2026-11-27 16:54 CT "not mix" (migration 202617200100): relationship (main_category), industry (categories[]), review tags. */
  relationships?: string[]; industries?: string[]; tags?: string[] };

/** "How to reach" — the company has a person with an email, only a phone, or neither. */
export const REACH_SQL = `CASE WHEN EXISTS (SELECT 1 FROM perfume.contact_people p WHERE p.company_id = co.id AND p.archived_at IS NULL AND p.email IS NOT NULL) THEN 'Has email'
  WHEN coalesce(co.phone, '') <> '' OR EXISTS (SELECT 1 FROM perfume.contact_people p WHERE p.company_id = co.id AND p.archived_at IS NULL AND cardinality(coalesce(p.phones, '{}'::text[])) > 0) THEN 'Phone only'
  ELSE 'No email or phone' END`;

/** The values the filter boxes offer, each with how many companies carry it (role + search applied, the boxes themselves not). */
export const CONTACT_FACETS = ["country", "state", "city", "category", "relationship", "industry", "tag", "source", "how", "region", "ctype", "vtype", "segment", "status", "show", "reach", "kind"] as const;
export type ContactFacet = typeof CONTACT_FACETS[number];

export async function contactCounts(c: pg.PoolClient) {
  const r = await c.query(
    `SELECT count(*)::int AS companies,
            count(*) FILTER (WHERE role = 'vendor')::int AS vendors,
            count(*) FILTER (WHERE role = 'customer')::int AS customers,
            count(*) FILTER (WHERE role = 'both')::int AS both,
            count(*) FILTER (WHERE role IS NULL)::int AS unclassified,
            count(*) FILTER (WHERE source = 'Google')::int AS from_google,
            count(*) FILTER (WHERE NOT EXISTS (SELECT 1 FROM perfume.contact_people p WHERE p.company_id = co.id AND p.email IS NOT NULL AND p.archived_at IS NULL))::int AS needs_email
       FROM perfume.contact_companies co WHERE co.archived_at IS NULL`);
  const p = await c.query(
    `SELECT count(*)::int AS people, count(*) FILTER (WHERE email IS NOT NULL)::int AS with_email,
            count(*) FILTER (WHERE email IS NULL)::int AS phone_only
       FROM perfume.contact_people WHERE archived_at IS NULL`);
  return { ...r.rows[0], ...p.rows[0] };
}

export function contactWhere(q: ContactListQuery): { where: string[]; args: unknown[] } {
  const where: string[] = ["co.archived_at IS NULL"];
  const args: unknown[] = [];
  const add = (sql: string, v: unknown) => { args.push(v); where.push(sql.replace("?", `$${args.length}`)); };
  if (q.role && q.role !== "all") {
    if (q.role === "none") where.push("co.role IS NULL"); else add("co.role = ?", q.role);
  }
  if (q.source) add("co.source = ?", q.source);
  if (q.country) add("co.country = ?", q.country);
  if (q.countries?.length) add("co.country = ANY(?::text[])", q.countries);
  if (q.states?.length) add("co.state = ANY(?::text[])", q.states);
  if (q.cities?.length) add("co.city = ANY(?::text[])", q.cities);
  if (q.sources?.length) add("co.source = ANY(?::text[])", q.sources);
  if (q.categories?.length) { args.push(q.categories); where.push(`(co.main_category = ANY($${args.length}::text[]) OR co.categories && $${args.length}::text[])`); }
  if (q.relationships?.length) add("co.main_category = ANY(?::text[])", q.relationships);
  if (q.industries?.length) add("co.categories && ?::text[]", q.industries);
  if (q.tags?.length) add("co.review_tags && ?::text[]", q.tags);
  if (q.hows?.length) add("EXISTS (SELECT 1 FROM perfume.contact_origins o WHERE o.company_id = co.id AND o.how = ANY(?::text[]))", q.hows);
  if (q.regions?.length) add("co.region = ANY(?::text[])", q.regions);
  if (q.ctypes?.length) add("co.customer_type = ANY(?::text[])", q.ctypes);
  if (q.vtypes?.length) add("co.vendor_type = ANY(?::text[])", q.vtypes);
  if (q.segments?.length) add("co.segment = ANY(?::text[])", q.segments);
  if (q.statuses?.length) add("co.status = ANY(?::text[])", q.statuses);
  if (q.shows?.length) add(`EXISTS (SELECT 1 FROM perfume.trade_show_contacts x JOIN perfume.trade_shows s ON s.id = x.show_id
      WHERE x.company_id = co.id AND x.archived_at IS NULL AND s.archived_at IS NULL AND s.name = ANY(?::text[]))`, q.shows);
  if (q.reach?.length) add(`(${REACH_SQL}) = ANY(?::text[])`, q.reach);
  if (q.kinds?.length) add(`(co.source_kind = ANY(?::text[]) OR EXISTS (SELECT 1 FROM perfume.contact_origins o WHERE o.company_id = co.id AND o.source_kind = ANY($${args.length + 1}::text[])))`, q.kinds);
  if (q.q && q.q.trim()) {
    args.push(`%${q.q.trim().toLowerCase()}%`);
    const i = args.length;
    where.push(`(lower(co.name) LIKE $${i} OR lower(coalesce(co.domain,'')) LIKE $${i} OR lower(coalesce(co.city,'')) LIKE $${i}
      OR coalesce(co.phone,'') LIKE $${i} OR EXISTS (SELECT 1 FROM perfume.contact_people p WHERE p.company_id = co.id
      AND (lower(coalesce(p.name,'')) LIKE $${i} OR coalesce(p.email,'') LIKE $${i})))`);
  }
  return { where, args };
}

export async function listContacts(c: pg.PoolClient, q: ContactListQuery) {
  const { where, args } = contactWhere(q);
  const limit = Math.min(Math.max(q.limit ?? 100, 1), 500);
  const offset = Math.max(q.offset ?? 0, 0);
  const total = (await c.query<{ n: number }>(`SELECT count(*)::int AS n FROM perfume.contact_companies co WHERE ${where.join(" AND ")}`, args)).rows[0]?.n ?? 0;
  const rows = (await c.query(
    `SELECT co.id, co.name, co.domain, co.role, co.vendor_type, co.customer_type, co.main_category, co.categories, co.city, co.state, co.country,
            co.phone, co.website, co.maps_uri, co.google_rating, co.google_rating_count, co.status, co.source,
            co.first_contact_on, co.last_email_on,
            (SELECT count(*)::int FROM perfume.contact_people p WHERE p.company_id = co.id AND p.archived_at IS NULL) AS people,
            (SELECT count(*)::int FROM perfume.contact_people p WHERE p.company_id = co.id AND p.archived_at IS NULL AND p.email IS NOT NULL) AS with_email,
            (SELECT o.how FROM perfume.contact_origins o WHERE o.company_id = co.id ORDER BY o.occurred_on NULLS LAST, o.created_at LIMIT 1) AS how_started,
            -- Owner 2026-11-28 14:05 CT: the list shows WHICH contact — the main person (most emails exchanged, then a name), their
            -- email and phone — one row per company, never one row per person.
            mp.name AS main_contact, mp.email AS main_email, coalesce(mp.phones[1], co.phone) AS main_phone
       FROM perfume.contact_companies co
       LEFT JOIN LATERAL (SELECT p.name, p.email, p.phones FROM perfume.contact_people p WHERE p.company_id = co.id AND p.archived_at IS NULL
                           ORDER BY (p.email IS NULL), p.email_count DESC NULLS LAST, (p.name IS NULL), p.created_at LIMIT 1) mp ON true
      WHERE ${where.join(" AND ")}
      ORDER BY co.last_email_on DESC NULLS LAST, co.name
      LIMIT ${limit} OFFSET ${offset}`, args)).rows;
  return { total, limit, offset, rows };
}

/** Each filter box's values with counts — role and search applied, every box's own pick left out of its own list. */
export async function contactFacets(c: pg.PoolClient, q: ContactListQuery): Promise<Record<ContactFacet, Array<{ value: string; count: number }>>> {
  const out = {} as Record<ContactFacet, Array<{ value: string; count: number }>>;
  const expr: Record<ContactFacet, string> = {
    country: "co.country", state: "co.state", city: "co.city", source: "co.source",
    category: "unnest(array_remove(array_cat(ARRAY[co.main_category], coalesce(co.categories, '{}'::text[])), NULL))",
    relationship: "co.main_category", industry: "unnest(co.categories)", tag: "unnest(co.review_tags)",
    how: "(SELECT o.how FROM perfume.contact_origins o WHERE o.company_id = co.id ORDER BY o.occurred_on NULLS LAST, o.created_at LIMIT 1)",
    region: "co.region", ctype: "co.customer_type", vtype: "co.vendor_type", segment: "co.segment", status: "co.status",
    show: `unnest(ARRAY(SELECT s.name FROM perfume.trade_show_contacts x JOIN perfume.trade_shows s ON s.id = x.show_id
             WHERE x.company_id = co.id AND x.archived_at IS NULL AND s.archived_at IS NULL))`,
    reach: REACH_SQL,
    kind: `unnest(ARRAY(SELECT DISTINCT k FROM (SELECT o.source_kind AS k FROM perfume.contact_origins o WHERE o.company_id = co.id UNION SELECT co.source_kind) z WHERE k IS NOT NULL))`,
  };
  const own: Record<ContactFacet, keyof ContactListQuery> = { country: "countries", state: "states", city: "cities", source: "sources", category: "categories", relationship: "relationships", industry: "industries", tag: "tags", how: "hows",
    region: "regions", ctype: "ctypes", vtype: "vtypes", segment: "segments", status: "statuses", show: "shows", reach: "reach", kind: "kinds" };
  for (const f of CONTACT_FACETS) {
    const { where, args } = contactWhere({ ...q, [own[f]]: undefined });
    const rows = (await c.query<{ value: string; count: number }>(
      `SELECT v AS value, count(*)::int AS count FROM (SELECT ${expr[f]} AS v FROM perfume.contact_companies co WHERE ${where.join(" AND ")}) x
        WHERE v IS NOT NULL AND v <> '' GROUP BY v ORDER BY count(*) DESC, v LIMIT 2000`, args)).rows;
    out[f] = rows;
  }
  return out;
}

export async function getContact(c: pg.PoolClient, id: string) {
  const co = (await c.query(`SELECT * FROM perfume.contact_companies WHERE id = $1`, [id])).rows[0];
  if (!co) return null;
  const people = (await c.query(
    `SELECT id, name, title, email, other_emails, phones, role, how_started, found_in, first_contact_on, last_email_on, email_count, sent_lists,
            opted_out_at, bounced_at FROM perfume.contact_people WHERE company_id = $1 AND archived_at IS NULL
      ORDER BY email_count DESC NULLS LAST, name`, [id])).rows;
  const origins = (await c.query(
    `SELECT o.id, o.occurred_on, o.how, o.source, o.source_url, o.detail, p.name AS person_name, o.created_at
       FROM perfume.contact_origins o LEFT JOIN perfume.contact_people p ON p.id = o.person_id
      WHERE o.company_id = $1 ORDER BY o.occurred_on NULLS LAST, o.created_at`, [id])).rows;
  return { company: co, people, origins };
}

/* ------------------------------------------------------------------ Google results → companies */

export type SaveOutcome = "inserted" | "matched" | "skipped_closed";

/** Dedupe: Google place_id, OR phone last-10 digits (company phone or any person's phone), OR normalized name + city. */
export async function findExisting(c: pg.PoolClient, r: ProspectRow, m?: ContactMatcher): Promise<string | null> {
  if (m) {
    // One read of the keys per run (contacts.matcher.ts): under RLS each SQL key question below is a full scan per result.
    const p10 = phone10(r.phone) ?? phone10(r.phone_intl);
    const [nk] = r.city ? await nameKeys(c, [r.name]) : [null];
    return m.find({ placeId: r.place_id, phones: p10 ? [p10] : [], emails: [], nameKey: nk || null, city: r.city ?? null })[0];
  }
  const byPlace = await c.query<{ id: string }>(`SELECT id FROM perfume.contact_companies WHERE google_place_id = $1 LIMIT 1`, [r.place_id]);
  if (byPlace.rows[0]) return byPlace.rows[0].id;
  const p10 = phone10(r.phone) ?? phone10(r.phone_intl);
  if (p10) {
    const byPhone = await c.query<{ id: string }>(
      `SELECT id FROM perfume.contact_companies
        WHERE archived_at IS NULL AND right(regexp_replace(coalesce(phone, ''), '\\D', '', 'g'), 10) = $1
       UNION ALL
       SELECT p.company_id FROM perfume.contact_people p
        WHERE p.archived_at IS NULL AND p.phone_keys @> ARRAY[$1::text]
       LIMIT 1`, [p10]);
    if (byPhone.rows[0]) return byPhone.rows[0].id;
  }
  if (r.city) {
    // perfume.name_key() — one SQL definition (no accents, punctuation or LLC / S.A. de C.V. tail) shared with the imports.
    const hit = await c.query<{ id: string }>(
      `SELECT id FROM perfume.contact_companies WHERE archived_at IS NULL AND name_key = perfume.name_key($1) AND lower(city) = lower($2) LIMIT 1`, [r.name, r.city]);
    if (hit.rows[0]) return hit.rows[0].id;
  }
  return null;
}

export async function saveProspect(c: pg.PoolClient, r: ProspectRow, kw: ProspectKeyword | null, query: string, uid: string, m?: ContactMatcher): Promise<SaveOutcome> {
  if (r.business_status === "CLOSED_PERMANENTLY") return "skipped_closed";
  const existing = await findExisting(c, r, m);
  const detail = `Google search "${query}"`;
  if (existing) {
    // Fill blanks only — a value the owner (or his mail) already gave is never overwritten by Google.
    await c.query(
      `UPDATE perfume.contact_companies SET
          google_place_id = coalesce(google_place_id, $2), address = coalesce(address, $3), city = coalesce(city, $4),
          state = coalesce(state, $5), zip = coalesce(zip, $6), country = coalesce(country, $7), phone = coalesce(phone, $8),
          phone_intl = coalesce(phone_intl, $9), website = coalesce(website, $10), maps_uri = $11, google_business_status = $12,
          google_primary_type = $13, google_types = $14, google_rating = $15, google_rating_count = $16, google_hours = $17,
          google_fetched_at = now(), categories = (SELECT array(SELECT DISTINCT unnest(categories || $18::text[]))), updated_at = now()
        WHERE id = $1`,
      [existing, r.place_id, r.address, r.city, r.state, r.zip, r.country, r.phone, r.phone_intl, r.website, r.maps_uri, r.business_status,
        r.primary_type, r.types, r.rating, r.rating_count, r.hours, kw ? [kw.category] : []]);
    await m?.refreshCompany(c, existing);
    const seen = await c.query(`SELECT 1 FROM perfume.contact_origins WHERE company_id = $1 AND how = 'Google business search' LIMIT 1`, [existing]);
    if (!seen.rowCount) {
      await c.query(
        `INSERT INTO perfume.contact_origins (company_id, occurred_on, how, source, source_url, detail, created_by)
         VALUES ($1, (now() AT TIME ZONE 'America/Chicago')::date, 'Google business search', 'Google Places', $2, $3, $4)`,
        [existing, r.maps_uri, detail, uid]);
    }
    return "matched";
  }
  const ins = await c.query<{ id: string }>(
    `INSERT INTO perfume.contact_companies (name, role, customer_type, main_category, categories, address, city, state, zip, country,
        website, phone, phone_intl, maps_uri, google_place_id, google_business_status, google_primary_type, google_types, google_rating,
        google_rating_count, google_hours, google_fetched_at, status, source, created_by)
     VALUES ($1, 'customer', $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, now(), 'prospect', 'Google', $21)
     ON CONFLICT (google_place_id) WHERE google_place_id IS NOT NULL DO NOTHING
     RETURNING id`,
    [r.name, kw?.customerType ?? null, kw ? "Potential customer" : null, kw ? [kw.category] : [], r.address, r.city, r.state, r.zip, r.country,
      r.website, r.phone, r.phone_intl, r.maps_uri, r.place_id, r.business_status, r.primary_type, r.types, r.rating, r.rating_count, r.hours, uid]);
  const id = ins.rows[0]?.id;
  if (!id) return "matched";
  await m?.refreshCompany(c, id);
  await c.query(
    `INSERT INTO perfume.contact_origins (company_id, occurred_on, how, source, source_url, detail, created_by)
     VALUES ($1, (now() AT TIME ZONE 'America/Chicago')::date, 'Google business search', 'Google Places', $2, $3, $4)`,
    [id, r.maps_uri, detail, uid]);
  return "inserted";
}

/* ------------------------------------------------------------------ single search */

export async function singleSearch(uid: string, input: { query: string; city?: string; state?: string; country?: string; max?: number }) {
  const where = [input.city, input.state, input.country === "MX" ? "México" : input.country === "US" ? null : input.country].filter(Boolean).join(", ");
  const textQuery = where ? `${input.query} ${/[áéíóúñ]|perfumer|tabaquer|licores|cerveza|mayoreo|puros/i.test(input.query) ? "en" : "in"} ${where}` : input.query;
  const runId = await withCurrentUser(uid, async (c) => (await c.query<{ id: string }>(
    `INSERT INTO perfume.google_search_runs (kind, planned_searches, query, started_by) VALUES ('single', 1, $1, $2) RETURNING id`,
    [{ ...input, textQuery }, uid])).rows[0]!.id);
  try {
    const page = await searchText(textQuery, { maxResults: input.max ?? 60, regionCode: input.country === "MX" ? "mx" : input.country === "US" ? "us" : undefined });
    const kw = null;
    const tally = { inserted: 0, matched: 0, skipped_closed: 0 };
    const results: Array<ProspectRow & { outcome: SaveOutcome }> = [];
    await withCurrentUser(uid, async (c) => {
      const m = await ContactMatcher.load(c);
      for (const r of page.rows) { const o = await saveProspect(c, r, kw, textQuery, uid, m); tally[o] += 1; results.push({ ...r, outcome: o }); }
      await c.query(
        `UPDATE perfume.google_search_runs SET status = 'done', searches_done = 1, requests_made = $2, results = $3, inserted = $4, matched = $5,
            skipped_closed = $6, finished_at = now(), heartbeat_at = now() WHERE id = $1`,
        [runId, page.requests, page.rows.length, tally.inserted, tally.matched, tally.skipped_closed]);
    });
    return { run_id: runId, text_query: textQuery, requests: page.requests, ...tally, results, places: page.raw };
  } catch (e) {
    await withCurrentUser(uid, (c) => c.query(
      `UPDATE perfume.google_search_runs SET status = 'failed', error = $2, finished_at = now() WHERE id = $1`, [runId, String((e as Error).message).slice(0, 500)]));
    throw e;
  }
}

/* ------------------------------------------------------------------ batch run (one at a time, in-process, stoppable) */

let activeRun: { id: string; stop: boolean } | null = null;
export const batchRunning = () => activeRun?.id ?? null;

/** Research session ROUND P1.4 #5: the first run is ONE city (Nuevo Laredo); the full matrix only after the owner sees it. */
export const FIRST_RUN_CITY = "Nuevo Laredo, Tamaulipas, México";

export function planFor(city?: string | null): PlannedSearch[] {
  const all = buildPlan();
  return city && city !== "all" ? all.filter((s) => cityLabel(s.city) === city) : all;
}

export function batchPlan() {
  const all = buildPlan();
  const byCity = new Map<string, number>();
  for (const s of all) byCity.set(cityLabel(s.city), (byCity.get(cityLabel(s.city)) ?? 0) + 1);
  const first = planFor(FIRST_RUN_CITY);
  return {
    all: planCounts(all),
    first_city: { city: FIRST_RUN_CITY, ...planCounts(first) },
    cities: [...byCity.entries()].map(([city, searches]) => ({ city, searches, max_requests: searches * 3 })),
  };
}

/** Starts the batch in the background; returns the run id at once. Throws if one is already running. */
export async function startBatch(uid: string, opts: { pauseMs?: number; plan?: PlannedSearch[]; city?: string | null } = {}): Promise<string> {
  if (activeRun) throw new Error("google_batch_already_running");
  const plan = opts.plan ?? planFor(opts.city);
  if (!plan.length) throw new Error("google_batch_unknown_city");
  const counts = planCounts(plan);
  const runId = await withCurrentUser(uid, async (c) => (await c.query<{ id: string }>(
    `INSERT INTO perfume.google_search_runs (kind, planned_searches, query, started_by) VALUES ('batch', $1, $2, $3) RETURNING id`,
    [counts.searches, { city: opts.city ?? "all", cities: counts.cities, max_requests: counts.maxRequests }, uid])).rows[0]!.id);
  activeRun = { id: runId, stop: false };
  const me = activeRun;
  void (async () => {
    const byCity: Record<string, { searches: number; results: number; inserted: number; matched: number; skipped_closed: number }> = {};
    let done = 0, requests = 0, results = 0, inserted = 0, matched = 0, skipped = 0;
    let finalStatus: "done" | "stopped" | "failed" = "done";
    let error: string | null = null;
    try {
      // The keys are read once for the whole run and kept current as each search saves (each search commits on its own).
      const m = await withCurrentUser(uid, (c) => ContactMatcher.load(c));
      for (const s of plan) {
        if (me.stop) { finalStatus = "stopped"; break; }
        const label = cityLabel(s.city);
        const bucket = (byCity[label] ??= { searches: 0, results: 0, inserted: 0, matched: 0, skipped_closed: 0 });
        const page = await searchText(s.textQuery, { maxResults: 60, regionCode: s.city.country === "MX" ? "mx" : "us", languageCode: s.lang });
        requests += page.requests; results += page.rows.length; bucket.searches += 1; bucket.results += page.rows.length; done += 1;
        await withCurrentUser(uid, async (c) => {
          for (const r of page.rows) {
            const o = await saveProspect(c, r, s.keyword, s.textQuery, uid, m);
            if (o === "inserted") { inserted += 1; bucket.inserted += 1; } else if (o === "matched") { matched += 1; bucket.matched += 1; } else { skipped += 1; bucket.skipped_closed += 1; }
          }
          await c.query(
            `UPDATE perfume.google_search_runs SET searches_done = $2, requests_made = $3, results = $4, inserted = $5, matched = $6, skipped_closed = $7,
                by_city = $8, heartbeat_at = now() WHERE id = $1`,
            [runId, done, requests, results, inserted, matched, skipped, byCity]);
        });
        if (opts.pauseMs !== 0) await new Promise((r) => setTimeout(r, opts.pauseMs ?? 150));
      }
    } catch (e) {
      finalStatus = "failed";
      error = String((e as Error).message).slice(0, 500);
    } finally {
      try {
        await withCurrentUser(uid, (c) => c.query(
          `UPDATE perfume.google_search_runs SET status = $2, error = $3, searches_done = $4, requests_made = $5, results = $6, inserted = $7,
              matched = $8, skipped_closed = $9, by_city = $10, finished_at = now(), heartbeat_at = now() WHERE id = $1`,
          [runId, finalStatus, error, done, requests, results, inserted, matched, skipped, byCity]));
      } finally {
        if (activeRun === me) activeRun = null;
      }
    }
  })();
  return runId;
}

export function stopBatch(runId: string): boolean {
  if (!activeRun || activeRun.id !== runId) return false;
  activeRun.stop = true;
  return true;
}

/** Last runs. A run still marked running on a server that is not running it (restart) reads "interrupted". */
export async function listRuns(c: pg.PoolClient) {
  const rows = (await c.query(
    `SELECT id, kind, status, planned_searches, searches_done, requests_made, results, inserted, matched, skipped_closed, by_city, query, error,
            started_at, heartbeat_at, finished_at
       FROM perfume.google_search_runs ORDER BY started_at DESC LIMIT 20`)).rows as Array<Record<string, unknown>>;
  const live = batchRunning();
  return rows.map((r) => (r["status"] === "running" && r["kind"] === "batch" && r["id"] !== live && Date.now() - new Date(String(r["heartbeat_at"])).getTime() > 120_000
    ? { ...r, status: "interrupted" } : r));
}
