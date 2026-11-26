/**
 * PERFUME-TRADE-SHOWS — the trade show planner (owner 2026-11-26 15:56 CT: "i am still missing all the other views that you
 * or he other agent deisnged"; designed in the 11-25 contacts handoff #4): the shows with dates, city, type and "I go", and
 * the contacts who attend each one, with the meeting asked / booked / held. Owner-only perfume schema, never deleted.
 */
import type pg from "pg";
import { z } from "zod";

export const SHOW_CONTACT_STATUSES = ["attends", "meeting_asked", "meeting_booked", "met"] as const;
const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "YYYY-MM-DD");
const text = (n: number) => z.string().trim().max(n).nullable().optional().transform((v) => (v ? v : null));

export const showSchema = z.object({
  id: z.string().uuid().optional(),
  name: z.string().trim().min(1).max(300),
  starts_on: date.nullable().optional(),
  ends_on: date.nullable().optional(),
  city: text(200), country: text(80), kind: text(200), dates_status: text(80), venue: text(300), website: text(500),
  notes: text(2000), source: text(200),
  // Owner 2026-11-26 17:08 CT: the organizer, the page to register on, the organizer's email and phone.
  organizer: text(300), register_url: text(500), contact_email: text(200), contact_phone: text(80),
  i_go: z.boolean().optional(),
});
export type ShowIn = z.infer<typeof showSchema>;

export const showContactSchema = z.object({
  company_id: z.string().uuid(),
  person_id: z.string().uuid().nullable().optional(),
  status: z.enum(SHOW_CONTACT_STATUSES).optional(),
  meeting_at: z.string().datetime({ offset: true }).nullable().optional(),
  booth: text(120),
  note: text(2000),
});
export const showContactPatchSchema = z.object({
  status: z.enum(SHOW_CONTACT_STATUSES).optional(),
  meeting_at: z.string().datetime({ offset: true }).nullable().optional(),
  booth: text(120),
  note: text(2000),
  archived: z.boolean().optional(),
});

export async function listShows(c: pg.PoolClient) {
  return (await c.query(
    `SELECT s.id, s.name, s.starts_on::text, s.ends_on::text, s.city, s.country, s.kind, s.dates_status, s.i_go, s.venue, s.website,
            s.notes, s.source, s.organizer, s.register_url, s.contact_email, s.contact_phone,
            (SELECT count(*)::int FROM perfume.trade_show_contacts x WHERE x.show_id = s.id AND x.archived_at IS NULL) AS contacts,
            (SELECT count(*)::int FROM perfume.trade_show_contacts x WHERE x.show_id = s.id AND x.archived_at IS NULL
                AND x.status IN ('meeting_booked', 'met')) AS meetings
       FROM perfume.trade_shows s WHERE s.archived_at IS NULL
      ORDER BY s.starts_on NULLS LAST, s.name`)).rows;
}

/** Create, or edit by id; the same name + start date is the same show (an import run twice never doubles). */
export async function saveShow(c: pg.PoolClient, uid: string, s: ShowIn): Promise<{ id: string; created: boolean }> {
  if (s.id) {
    const r = await c.query<{ id: string }>(
      `UPDATE perfume.trade_shows SET name = $2, starts_on = $3, ends_on = $4, city = $5, country = $6, kind = $7, dates_status = $8,
              venue = $9, website = $10, notes = $11, source = $12, i_go = coalesce($13, i_go),
              organizer = $14, register_url = $15, contact_email = $16, contact_phone = $17, updated_at = now()
        WHERE id = $1 AND archived_at IS NULL RETURNING id`,
      [s.id, s.name, s.starts_on ?? null, s.ends_on ?? null, s.city, s.country, s.kind, s.dates_status, s.venue, s.website, s.notes, s.source, s.i_go ?? null,
       s.organizer, s.register_url, s.contact_email, s.contact_phone]);
    if (!r.rows[0]) throw new ShowNotFound();
    return { id: r.rows[0].id, created: false };
  }
  const found = await c.query<{ id: string }>(
    `SELECT id FROM perfume.trade_shows WHERE lower(name) = lower($1) AND coalesce(starts_on, '1900-01-01'::date) = coalesce($2::date, '1900-01-01'::date)
      AND archived_at IS NULL LIMIT 1`, [s.name, s.starts_on ?? null]);
  if (found.rows[0]) {
    // An import fills blanks only — a value the owner typed is never overwritten; "I go" is his and is kept.
    await c.query(
      `UPDATE perfume.trade_shows SET ends_on = coalesce(ends_on, $2), city = coalesce(city, $3), country = coalesce(country, $4), kind = coalesce(kind, $5),
              dates_status = coalesce(dates_status, $6), venue = coalesce(venue, $7), website = coalesce(website, $8), notes = coalesce(notes, $9),
              source = coalesce(source, $10), i_go = i_go OR coalesce($11, false),
              organizer = coalesce(organizer, $12), register_url = coalesce(register_url, $13), contact_email = coalesce(contact_email, $14),
              contact_phone = coalesce(contact_phone, $15), updated_at = now() WHERE id = $1`,
      [found.rows[0].id, s.ends_on ?? null, s.city, s.country, s.kind, s.dates_status, s.venue, s.website, s.notes, s.source, s.i_go ?? null,
       s.organizer, s.register_url, s.contact_email, s.contact_phone]);
    return { id: found.rows[0].id, created: false };
  }
  const r = await c.query<{ id: string }>(
    `INSERT INTO perfume.trade_shows (name, starts_on, ends_on, city, country, kind, dates_status, venue, website, notes, source, i_go, created_by,
       organizer, register_url, contact_email, contact_phone)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17) RETURNING id`,
    [s.name, s.starts_on ?? null, s.ends_on ?? null, s.city, s.country, s.kind, s.dates_status, s.venue, s.website, s.notes, s.source, s.i_go ?? false, uid,
     s.organizer, s.register_url, s.contact_email, s.contact_phone]);
  return { id: r.rows[0]!.id, created: true };
}

export async function setIGo(c: pg.PoolClient, id: string, iGo: boolean) {
  const r = await c.query(`UPDATE perfume.trade_shows SET i_go = $2, updated_at = now() WHERE id = $1 AND archived_at IS NULL`, [id, iGo]);
  if (!r.rowCount) throw new ShowNotFound();
}

export async function archiveShow(c: pg.PoolClient, id: string) {
  const r = await c.query(`UPDATE perfume.trade_shows SET archived_at = now(), updated_at = now() WHERE id = $1 AND archived_at IS NULL`, [id]);
  if (!r.rowCount) throw new ShowNotFound();
}

export async function listShowContacts(c: pg.PoolClient, showId: string) {
  return (await c.query(
    `SELECT x.id, x.company_id, co.name AS company, co.role, co.city, co.country, x.person_id, p.name AS person, p.email,
            co.phone, x.status, x.meeting_at, x.booth, x.note, x.created_at
       FROM perfume.trade_show_contacts x
       JOIN perfume.contact_companies co ON co.id = x.company_id
       LEFT JOIN perfume.contact_people p ON p.id = x.person_id
      WHERE x.show_id = $1 AND x.archived_at IS NULL
      ORDER BY (x.meeting_at IS NULL), x.meeting_at, co.name`, [showId])).rows;
}

/** The shows a company is linked to — shown on the contact's profile. */
export async function showsOfCompany(c: pg.PoolClient, companyId: string) {
  return (await c.query(
    `SELECT s.id, s.name, s.starts_on::text, s.city, s.i_go, x.status, x.meeting_at
       FROM perfume.trade_show_contacts x JOIN perfume.trade_shows s ON s.id = x.show_id
      WHERE x.company_id = $1 AND x.archived_at IS NULL AND s.archived_at IS NULL ORDER BY s.starts_on NULLS LAST`, [companyId])).rows;
}

export async function addShowContact(c: pg.PoolClient, uid: string, showId: string, x: z.infer<typeof showContactSchema>) {
  const show = await c.query(`SELECT 1 FROM perfume.trade_shows WHERE id = $1 AND archived_at IS NULL`, [showId]);
  if (!show.rowCount) throw new ShowNotFound();
  if (x.person_id) {
    const p = await c.query(`SELECT 1 FROM perfume.contact_people WHERE id = $1 AND company_id = $2`, [x.person_id, x.company_id]);
    if (!p.rowCount) throw new ShowContactInvalid("That person is not on this company.");
  }
  const r = await c.query<{ id: string }>(
    `INSERT INTO perfume.trade_show_contacts (show_id, company_id, person_id, status, meeting_at, booth, note, created_by)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
     ON CONFLICT (show_id, company_id, coalesce(person_id, '00000000-0000-0000-0000-000000000000'::uuid)) WHERE archived_at IS NULL
     DO UPDATE SET status = EXCLUDED.status, meeting_at = coalesce(EXCLUDED.meeting_at, perfume.trade_show_contacts.meeting_at),
                   booth = coalesce(EXCLUDED.booth, perfume.trade_show_contacts.booth), note = coalesce(EXCLUDED.note, perfume.trade_show_contacts.note),
                   updated_at = now()
     RETURNING id`,
    [showId, x.company_id, x.person_id ?? null, x.status ?? "attends", x.meeting_at ?? null, x.booth, x.note, uid]);
  return { id: r.rows[0]!.id };
}

export async function updateShowContact(c: pg.PoolClient, id: string, x: z.infer<typeof showContactPatchSchema>) {
  const sets: string[] = [];
  const args: unknown[] = [id];
  const set = (col: string, v: unknown) => { args.push(v); sets.push(`${col} = $${args.length}`); };
  if (x.status) set("status", x.status);
  if (x.meeting_at !== undefined) set("meeting_at", x.meeting_at);
  if (x.booth !== undefined) set("booth", x.booth);
  if (x.note !== undefined) set("note", x.note);
  if (x.archived) sets.push("archived_at = now()");
  if (!sets.length) return;
  const r = await c.query(`UPDATE perfume.trade_show_contacts SET ${sets.join(", ")}, updated_at = now() WHERE id = $1 AND archived_at IS NULL`, args);
  if (!r.rowCount) throw new ShowNotFound();
}

export class ShowNotFound extends Error { constructor() { super("show_not_found"); } }
export class ShowContactInvalid extends Error {}
