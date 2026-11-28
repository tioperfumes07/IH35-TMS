/**
 * PERFUME — the people of one company (owner 2026-11-28 14:05 CT: "PEOPLES NAMES SHOULD BE ABLE TO BE ADDED TO A COMPANY PROFILE,
 * I CAN HAVE 10 DIFFERENT CONTACTS IN A COMPANY, AND IT SHOULD NOT LOOK DIRTY").
 * QuickBooks "contacts" on a customer: add a person (name, title, email, other emails, phones, role), change them, remove them.
 * Remove = archive (archived_at), never a delete; every change writes one perfume.lead_events row (entity 'person') so the company's
 * History shows who changed what. An email already used by a live person elsewhere is refused (the table's unique index) with the
 * company that holds it, so the same email never lands on two companies.
 */
import type pg from "pg";
import { z } from "zod";
import { logEvent } from "./leads.events.js";

type Q = pg.PoolClient;

const email = z.string().trim().toLowerCase().email().max(200);
export const personSchema = z.object({
  name: z.string().trim().max(200).optional().nullable(),
  title: z.string().trim().max(120).optional().nullable(),
  email: email.optional().nullable().or(z.literal("").transform(() => null)),
  other_emails: z.array(email).max(20).optional(),
  phones: z.array(z.string().trim().min(3).max(40)).max(10).optional(),
  role: z.enum(["vendor", "customer", "both"]).optional().nullable(),
}).refine((p) => Boolean(p.name?.trim() || p.email || (p.phones?.length ?? 0) > 0), { message: "A person needs a name, an email or a phone." });
export const removePersonSchema = z.object({ reason: z.string().trim().max(300).optional() });

export class CompanyPeopleError extends Error {
  constructor(readonly code: "not_found" | "email_in_use" | "invalid", message: string) { super(message); }
}

const COLS = `id::text, company_id::text, name, title, email, other_emails, phones, role, how_started, first_contact_on::text, last_email_on::text, email_count`;

async function emailHolder(c: Q, emails: string[], exceptPerson: string | null) {
  if (!emails.length) return null;
  return (await c.query<{ email: string; company: string }>(
    `SELECT p.email, co.name AS company FROM perfume.contact_people p JOIN perfume.contact_companies co ON co.id = p.company_id
      WHERE p.archived_at IS NULL AND p.email = ANY($1::text[]) AND ($2::uuid IS NULL OR p.id <> $2::uuid) LIMIT 1`, [emails, exceptPerson])).rows[0] ?? null;
}

export async function addPerson(c: Q, uid: string, companyId: string, input: z.infer<typeof personSchema>) {
  const co = (await c.query<{ id: string }>(`SELECT id::text FROM perfume.contact_companies WHERE id = $1::uuid AND archived_at IS NULL`, [companyId])).rows[0];
  if (!co) throw new CompanyPeopleError("not_found", "Company not found");
  const held = await emailHolder(c, input.email ? [input.email] : [], null);
  if (held) throw new CompanyPeopleError("email_in_use", `${held.email} already belongs to a person at ${held.company}`);
  const other = [...new Set((input.other_emails ?? []).filter((e) => e !== input.email))];
  const r = (await c.query(
    `INSERT INTO perfume.contact_people (company_id, name, title, email, other_emails, phones, role, how_started, found_in, created_by)
     VALUES ($1::uuid, $2, $3, $4, $5::text[], $6::text[], $7, 'Added by hand', 'Company profile', $8::uuid) RETURNING ${COLS}`,
    [companyId, input.name?.trim() || null, input.title?.trim() || null, input.email ?? null, other, input.phones ?? [], input.role ?? null, uid])).rows[0];
  await logEvent(c, uid, { entity: "person", entity_id: r.id, company_id: companyId, action: "person_added", detail: { name: r.name, email: r.email } });
  return { person: r };
}

export async function updatePerson(c: Q, uid: string, personId: string, input: z.infer<typeof personSchema>) {
  const before = (await c.query(`SELECT ${COLS} FROM perfume.contact_people WHERE id = $1::uuid AND archived_at IS NULL`, [personId])).rows[0];
  if (!before) throw new CompanyPeopleError("not_found", "Person not found");
  const held = await emailHolder(c, input.email ? [input.email] : [], personId);
  if (held) throw new CompanyPeopleError("email_in_use", `${held.email} already belongs to a person at ${held.company}`);
  const other = [...new Set((input.other_emails ?? before.other_emails ?? []).filter((e: string) => e !== input.email))];
  const r = (await c.query(
    `UPDATE perfume.contact_people SET name = $2, title = $3, email = $4, other_emails = $5::text[], phones = $6::text[], role = $7, updated_at = now()
      WHERE id = $1::uuid RETURNING ${COLS}`,
    [personId, input.name?.trim() || null, input.title?.trim() || null, input.email ?? null, other, input.phones ?? before.phones ?? [], input.role ?? null])).rows[0];
  const changed: Record<string, { from: unknown; to: unknown }> = {};
  for (const k of ["name", "title", "email", "other_emails", "phones", "role"] as const) {
    if (JSON.stringify(before[k] ?? null) !== JSON.stringify(r[k] ?? null)) changed[k] = { from: before[k] ?? null, to: r[k] ?? null };
  }
  if (Object.keys(changed).length) await logEvent(c, uid, { entity: "person", entity_id: personId, company_id: r.company_id, action: "person_changed", detail: changed });
  return { person: r, changed: Object.keys(changed) };
}

export async function removePerson(c: Q, uid: string, personId: string, reason?: string) {
  const r = (await c.query<{ id: string; company_id: string; name: string | null; email: string | null }>(
    `UPDATE perfume.contact_people SET archived_at = now(), updated_at = now() WHERE id = $1::uuid AND archived_at IS NULL
     RETURNING id::text, company_id::text, name, email`, [personId])).rows[0];
  if (!r) throw new CompanyPeopleError("not_found", "Person not found");
  await logEvent(c, uid, { entity: "person", entity_id: personId, company_id: r.company_id, action: "person_removed", detail: { name: r.name, email: r.email, reason: reason ?? null } });
  return { removed: true };
}
