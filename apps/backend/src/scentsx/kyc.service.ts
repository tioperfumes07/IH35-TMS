/**
 * SCENTSX B12 — party KYC profile, IRS tax forms, pagarés (migration 202616960100).
 *
 * Owner 2026-11-26 23:17 CT: "COMPLIANCE MODULE, FORM 8300, FINCEN, WBEN8, VISA PASSPORT RFC CURP FOR MEXICAN CUSTOMERS, AND ANY
 * OTHER REQURIED DATA, ALSO PAGARES, AND FOR US OR AMERICAN CUSTOMERS THE FED TAX ID, SALES TAX ID, ETC, CONTACT INFORMATION, AND
 * SHOULD BE LINKED AND WIRED TO CUSTOMERS, VENDORS ETC AND ACCOUNTING, AND CHART OF ACCOUNTS AND AR AND AP".
 *
 * What each party needs (requirements(), the single rule list the desk, the customer card and the credit block all read):
 *   every party        legal name, phone or email, street, city, country
 *   Mexico customer    individual: RFC, CURP, passport (number, expiry, copy), US visa / border crossing card (number, expiry,
 *                      copy), W-8BEN · business: RFC, Constancia de Situación Fiscal, W-8BEN-E
 *   US customer        business: EIN, sales and use tax permit (state, number, copy) · individual: contact only
 *   other customer     passport (number, expiry, copy)
 *   US vendor          W-9, and EIN (business) or SSN / ITIN last 4 (individual) — the 1099 data
 *   foreign vendor     W-8BEN (individual) / W-8BEN-E (business); Mexico also RFC
 * An expired passport / visa / W-8 counts as missing; one expiring within 60 days is a warning.
 * A W-8 stays valid until Dec 31 of the third calendar year after the year it was signed (IRS Instructions for Form W-8BEN,
 * "Expiration of Form W-8BEN"); a W-9 does not expire.
 *
 * Pagarés are security for a credit account, not journal entries: the debt is already A/R (1100). Nothing here posts or
 * moves money. SSN / ITIN are never stored beyond the last 4 (the copy is the file).
 */
import type pg from "pg";
import { scopeToScentsx, ScentsxLinkInvalid, ScentsxLinkNotFound } from "./links.service.js";

type Q = Pick<pg.PoolClient, "query">;

export type KycParty = { kind: "customer"; contact_company_id: string } | { kind: "vendor"; perfume_vendor_id: string };

export type KycInput = {
  residency: "us" | "mexico" | "other"; entity_kind: "individual" | "business"; legal_name: string; dba_name?: string | null;
  ein?: string | null; ssn_itin_last4?: string | null; sales_tax_permit_state?: string | null; sales_tax_permit_number?: string | null;
  sales_tax_permit_file_id?: string | null; rfc?: string | null; curp?: string | null; regimen_fiscal?: string | null;
  constancia_fiscal_file_id?: string | null; ine_file_id?: string | null; passport_number?: string | null; passport_country?: string | null;
  passport_expires_on?: string | null; passport_file_id?: string | null; visa_kind?: "b1_b2" | "border_crossing_card" | "other" | null;
  visa_number?: string | null; visa_expires_on?: string | null; visa_file_id?: string | null; contact_person?: string | null;
  phone?: string | null; email?: string | null; address_line?: string | null; city?: string | null; state_region?: string | null;
  postal_code?: string | null; country?: string | null; proof_of_address_file_id?: string | null; notes?: string | null;
};

export type KycProfile = KycInput & { id: string; contact_company_id: string | null; perfume_vendor_id: string | null; reviewed_at: string | null; updated_at: string };
export type TaxForm = { id: string; form_kind: "W-9" | "W-8BEN" | "W-8BEN-E" | "W-8ECI"; signed_on: string; expires_on: string | null; file_id: string; voided_at: string | null };
export type KycStatus = { status: "none" | "incomplete" | "complete"; missing: string[]; warnings: string[] };

const FIELDS: Array<keyof KycInput> = [
  "residency", "entity_kind", "legal_name", "dba_name", "ein", "ssn_itin_last4", "sales_tax_permit_state", "sales_tax_permit_number",
  "sales_tax_permit_file_id", "rfc", "curp", "regimen_fiscal", "constancia_fiscal_file_id", "ine_file_id", "passport_number", "passport_country",
  "passport_expires_on", "passport_file_id", "visa_kind", "visa_number", "visa_expires_on", "visa_file_id", "contact_person", "phone", "email",
  "address_line", "city", "state_region", "postal_code", "country", "proof_of_address_file_id", "notes",
];
const DATE_FIELDS = new Set<keyof KycInput>(["passport_expires_on", "visa_expires_on"]);
const FILE_FIELDS = new Set<keyof KycInput>(["sales_tax_permit_file_id", "constancia_fiscal_file_id", "ine_file_id", "passport_file_id", "visa_file_id", "proof_of_address_file_id"]);

const blank = (v: unknown) => v == null || String(v).trim() === "";
const iso = (d: Date) => d.toISOString().slice(0, 10);

/** Uppercase the codes, format the EIN as NN-NNNNNNN, trim text; refuse what no valid ID can look like. */
export function normalizeKyc(p: Partial<KycInput>): Partial<KycInput> {
  const out: Partial<KycInput> = {};
  for (const k of FIELDS) {
    if (!(k in p)) continue;
    const v = p[k];
    (out as Record<string, unknown>)[k] = typeof v === "string" ? (v.trim() === "" ? null : v.trim()) : v ?? null;
  }
  for (const k of ["rfc", "curp", "country", "passport_country", "sales_tax_permit_state", "passport_number", "visa_number"] as const) {
    if (typeof out[k] === "string") (out as Record<string, unknown>)[k] = (out[k] as string).toUpperCase().replace(/\s+/g, "");
  }
  if (typeof out.ein === "string") {
    const d = out.ein.replace(/\D/g, "");
    if (d.length !== 9) throw new ScentsxLinkInvalid("EIN must be 9 digits (NN-NNNNNNN)");
    out.ein = `${d.slice(0, 2)}-${d.slice(2)}`;
  }
  if (typeof out.sales_tax_permit_number === "string") out.sales_tax_permit_number = out.sales_tax_permit_number.replace(/[\s-]/g, "");
  if (typeof out.rfc === "string" && !/^[A-ZÑ&]{3,4}[0-9]{6}[A-Z0-9]{3}$/.test(out.rfc)) throw new ScentsxLinkInvalid("RFC must be 12 (business) or 13 (individual) characters, e.g. XAXX010101000");
  if (typeof out.curp === "string" && !/^[A-Z]{4}[0-9]{6}[HMX][A-Z]{5}[A-Z0-9][0-9]$/.test(out.curp)) throw new ScentsxLinkInvalid("CURP must be 18 characters");
  if (out.sales_tax_permit_state === "TX" && typeof out.sales_tax_permit_number === "string" && !/^[0-9]{11}$/.test(out.sales_tax_permit_number)) {
    throw new ScentsxLinkInvalid("A Texas sales and use tax permit number is the 11-digit taxpayer number");
  }
  if (typeof out.ssn_itin_last4 === "string" && !/^[0-9]{4}$/.test(out.ssn_itin_last4)) throw new ScentsxLinkInvalid("Only the last 4 digits of an SSN / ITIN are kept");
  return out;
}

/** Default W-8 expiry: Dec 31 of the third calendar year after the signing year. */
export function w8ExpiresOn(signedOn: string): string {
  return `${Number(signedOn.slice(0, 4)) + 3}-12-31`;
}

/** The one rule list. Pure: profile + live tax forms + today → what is missing and what is about to expire. */
export function requirements(kind: KycParty["kind"], p: KycProfile | null, forms: TaxForm[], today: string): KycStatus {
  if (!p) return { status: "none", missing: ["kyc_profile"], warnings: [] };
  const missing: string[] = [];
  const warnings: string[] = [];
  const soon = iso(new Date(Date.parse(`${today}T00:00:00Z`) + 60 * 86_400_000));
  const need = (field: string, ok: boolean) => { if (!ok) missing.push(field); };
  const dated = (label: string, num: unknown, exp: string | null | undefined, file: unknown) => {
    need(`${label}_number`, !blank(num));
    need(`${label}_expires_on`, !blank(exp));
    need(`${label}_copy`, !blank(file));
    if (exp && exp < today) missing.push(`${label}_expired`);
    else if (exp && exp <= soon) warnings.push(`${label}_expires_${exp}`);
  };
  const live = forms.filter((f) => !f.voided_at);
  const form = (k: TaxForm["form_kind"]) => {
    const f = live.filter((x) => x.form_kind === k).sort((a, b) => b.signed_on.localeCompare(a.signed_on))[0];
    if (!f) { missing.push(k); return; }
    if (f.expires_on && f.expires_on < today) missing.push(`${k}_expired`);
    else if (f.expires_on && f.expires_on <= soon) warnings.push(`${k}_expires_${f.expires_on}`);
  };

  need("legal_name", !blank(p.legal_name));
  need("phone_or_email", !blank(p.phone) || !blank(p.email));
  need("address_line", !blank(p.address_line));
  need("city", !blank(p.city));
  need("country", !blank(p.country));

  if (kind === "customer") {
    if (p.residency === "mexico") {
      need("rfc", !blank(p.rfc));
      if (p.entity_kind === "individual") {
        need("curp", !blank(p.curp));
        dated("passport", p.passport_number, p.passport_expires_on, p.passport_file_id);
        dated("visa", p.visa_number, p.visa_expires_on, p.visa_file_id);
        form("W-8BEN");
      } else {
        need("constancia_situacion_fiscal", !blank(p.constancia_fiscal_file_id));
        form("W-8BEN-E");
      }
    } else if (p.residency === "us") {
      if (p.entity_kind === "business") {
        need("ein", !blank(p.ein));
        need("sales_tax_permit_number", !blank(p.sales_tax_permit_number));
        need("sales_tax_permit_copy", !blank(p.sales_tax_permit_file_id));
      }
    } else {
      dated("passport", p.passport_number, p.passport_expires_on, p.passport_file_id);
    }
  } else {
    if (p.residency === "us") {
      form("W-9");
      if (p.entity_kind === "business") need("ein", !blank(p.ein));
      else need("ssn_itin_last4", !blank(p.ssn_itin_last4));
    } else {
      form(p.entity_kind === "business" ? "W-8BEN-E" : "W-8BEN");
      if (p.residency === "mexico") need("rfc", !blank(p.rfc));
    }
  }
  return { status: missing.length ? "incomplete" : "complete", missing, warnings };
}

const PARTY_COL = { customer: "contact_company_id", vendor: "perfume_vendor_id" } as const;
const partyId = (p: KycParty) => (p.kind === "customer" ? p.contact_company_id : p.perfume_vendor_id);

async function today(c: Q): Promise<string> {
  return (await c.query<{ d: string }>(`SELECT ((now() AT TIME ZONE 'America/Chicago')::date)::text AS d`)).rows[0]!.d;
}

function rowToProfile(r: Record<string, unknown>): KycProfile {
  const out: Record<string, unknown> = { ...r };
  for (const k of DATE_FIELDS) if (out[k] != null) out[k] = String(out[k]).slice(0, 10);
  return out as KycProfile;
}

const PROFILE_SQL = `SELECT id::text, contact_company_id::text, perfume_vendor_id::text, ${FIELDS.map((f) =>
  DATE_FIELDS.has(f) ? `${f}::text AS ${f}` : FILE_FIELDS.has(f) ? `${f}::text AS ${f}` : f).join(", ")}, reviewed_at, updated_at FROM scentsx.party_kyc`;

async function loadProfile(c: Q, party: KycParty): Promise<KycProfile | null> {
  const r = await c.query(`${PROFILE_SQL} WHERE ${PARTY_COL[party.kind]} = $1::uuid AND voided_at IS NULL`, [partyId(party)]);
  return r.rows[0] ? rowToProfile(r.rows[0]) : null;
}

async function loadForms(c: Q, kycId: string): Promise<TaxForm[]> {
  const r = await c.query<TaxForm>(
    `SELECT id::text, form_kind, signed_on::text, expires_on::text, file_id::text, voided_at FROM scentsx.tax_forms WHERE party_kyc_id = $1::uuid ORDER BY signed_on DESC`, [kycId]
  );
  return r.rows;
}

export type Pagare = {
  id: string; pagare_no: string; amount_cents: number; currency: "USD" | "MXN"; issued_on: string; due_on: string | null; status: string;
  suscriptor_name: string; aval_name: string | null; place_of_payment: string; signed_file_id: string;
};

async function loadPagares(c: Q, contactCompanyId: string): Promise<Pagare[]> {
  const r = await c.query<Pagare & { amount_cents: string }>(
    `SELECT id::text, pagare_no, amount_cents::text, currency, issued_on::text, due_on::text, status, suscriptor_name, aval_name, place_of_payment, signed_file_id::text
       FROM scentsx.pagares WHERE contact_company_id = $1::uuid ORDER BY issued_on DESC, created_at DESC`, [contactCompanyId]
  );
  return r.rows.map((x) => ({ ...x, amount_cents: Number(x.amount_cents) }));
}

/** Held pagarés of a customer, per currency (never added across currencies). */
export async function pagareCover(c: Q, contactCompanyId: string): Promise<{ usd_cents: number; mxn_cents: number; held: number }> {
  const r = await c.query<{ usd: string; mxn: string; n: number }>(
    `SELECT coalesce(sum(amount_cents) FILTER (WHERE currency = 'USD'), 0)::text usd, coalesce(sum(amount_cents) FILTER (WHERE currency = 'MXN'), 0)::text mxn, count(*)::int n
       FROM scentsx.pagares WHERE contact_company_id = $1::uuid AND status = 'held'`, [contactCompanyId]
  );
  return { usd_cents: Number(r.rows[0]!.usd), mxn_cents: Number(r.rows[0]!.mxn), held: r.rows[0]!.n };
}

/** Everything the customer / vendor card shows: profile, forms, pagarés (customers), the rule result, and the engine links. */
export async function partyKyc(c: Q, party: KycParty) {
  await scopeToScentsx(c);
  const profile = await loadProfile(c, party);
  const forms = profile ? await loadForms(c, profile.id) : [];
  const pagares = party.kind === "customer" ? await loadPagares(c, party.contact_company_id) : [];
  const link = party.kind === "customer"
    ? await c.query<{ id: string }>(`SELECT customer_id::text AS id FROM scentsx.customer_links WHERE contact_company_id = $1::uuid AND voided_at IS NULL LIMIT 1`, [party.contact_company_id])
    : await c.query<{ id: string }>(`SELECT vendor_id::text AS id FROM scentsx.vendor_links WHERE perfume_vendor_id = $1::uuid AND voided_at IS NULL LIMIT 1`, [party.perfume_vendor_id]);
  return {
    party, profile, tax_forms: forms, pagares, ...requirements(party.kind, profile, forms, await today(c)),
    engine_id: link.rows[0]?.id ?? null,
  };
}

/** Create the party's live profile, or update it. Returns the rule result after the write. */
export async function saveKyc(c: Q, uid: string, party: KycParty, input: Partial<KycInput>) {
  const co = await scopeToScentsx(c);
  const n = normalizeKyc(input);
  const cur = await c.query<{ id: string }>(`SELECT id::text FROM scentsx.party_kyc WHERE ${PARTY_COL[party.kind]} = $1::uuid AND voided_at IS NULL FOR UPDATE`, [partyId(party)]);
  const keys = FIELDS.filter((k) => k in n);
  const cast = (k: keyof KycInput) => (DATE_FIELDS.has(k) ? "::date" : FILE_FIELDS.has(k) ? "::uuid" : "");
  if (!cur.rows[0]) {
    if (blank(n.residency) || blank(n.entity_kind) || blank(n.legal_name)) throw new ScentsxLinkInvalid("residency, entity_kind and legal_name are required");
    const cols = ["operating_company_id", PARTY_COL[party.kind], ...keys, "created_by", "updated_by"];
    const vals = [co, partyId(party), ...keys.map((k) => n[k] ?? null), uid, uid];
    const ph = cols.map((col, i) => `$${i + 1}${col === "operating_company_id" || col === PARTY_COL[party.kind] || col === "created_by" || col === "updated_by" ? "::uuid" : cast(col as keyof KycInput)}`);
    await c.query(`INSERT INTO scentsx.party_kyc (${cols.join(", ")}) VALUES (${ph.join(", ")})`, vals);
  } else if (keys.length) {
    const sets = keys.map((k, i) => `${k} = $${i + 2}${cast(k)}`);
    await c.query(
      `UPDATE scentsx.party_kyc SET ${sets.join(", ")}, updated_by = $${keys.length + 2}::uuid, updated_at = now() WHERE id = $1::uuid`,
      [cur.rows[0].id, ...keys.map((k) => n[k] ?? null), uid]
    );
  }
  return partyKyc(c, party);
}

/** The owner marks the profile reviewed (documents looked at). Refused while anything required is missing. */
export async function markKycReviewed(c: Q, uid: string, party: KycParty) {
  const k = await partyKyc(c, party);
  if (!k.profile) throw new ScentsxLinkNotFound();
  if (k.status !== "complete") throw new ScentsxLinkInvalid(`Cannot mark reviewed — still missing: ${k.missing.join(", ")}`);
  await c.query(`UPDATE scentsx.party_kyc SET reviewed_by = $2::uuid, reviewed_at = now(), updated_by = $2::uuid, updated_at = now() WHERE id = $1::uuid`, [k.profile.id, uid]);
  return partyKyc(c, party);
}

export async function addTaxForm(c: Q, uid: string, party: KycParty, f: {
  form_kind: TaxForm["form_kind"]; signed_on: string; expires_on?: string | null; file_id: string; foreign_tin?: string | null;
  treaty_country?: string | null; chapter3_status?: string | null; notes?: string | null;
}) {
  const co = await scopeToScentsx(c);
  const profile = await loadProfile(c, party);
  if (!profile) throw new ScentsxLinkInvalid("Save the party's KYC profile first");
  const today_ = await today(c);
  if (f.signed_on > today_) throw new ScentsxLinkInvalid("signed_on cannot be in the future");
  const maxExp = f.form_kind === "W-9" ? null : w8ExpiresOn(f.signed_on);
  const expires = f.form_kind === "W-9" ? null : f.expires_on ?? maxExp;
  if (expires && maxExp && expires > maxExp) throw new ScentsxLinkInvalid(`A ${f.form_kind} signed ${f.signed_on} is valid until ${maxExp} at the latest`);
  await c.query(
    `INSERT INTO scentsx.tax_forms (operating_company_id, party_kyc_id, form_kind, signed_on, expires_on, file_id, foreign_tin, treaty_country, chapter3_status, notes, created_by)
     VALUES ($1::uuid, $2::uuid, $3, $4::date, $5::date, $6::uuid, $7, $8, $9, $10, $11::uuid)`,
    [co, profile.id, f.form_kind, f.signed_on, expires, f.file_id, f.foreign_tin ?? null, f.treaty_country?.toUpperCase() ?? null, f.chapter3_status ?? null, f.notes ?? null, uid]
  );
  return partyKyc(c, party);
}

export async function voidTaxForm(c: Q, uid: string, formId: string, reason: string) {
  await scopeToScentsx(c);
  if (reason.trim().length < 10) throw new ScentsxLinkInvalid("A void reason of at least 10 characters is required");
  const r = await c.query(`UPDATE scentsx.tax_forms SET voided_at = now(), voided_by = $2::uuid, void_reason = $3 WHERE id = $1::uuid AND voided_at IS NULL`, [formId, uid, reason.trim()]);
  if (!r.rowCount) throw new ScentsxLinkNotFound();
  return { id: formId, voided: true };
}

export async function addPagare(c: Q, uid: string, p: {
  contact_company_id: string; pagare_no?: string | null; amount_cents: number; currency: "USD" | "MXN"; issued_on: string; due_on?: string | null;
  place_of_payment: string; suscriptor_name: string; aval_name?: string | null; moratorio_rate_pct?: number | null; signed_file_id: string; notes?: string | null;
}) {
  const co = await scopeToScentsx(c);
  const profile = await loadProfile(c, { kind: "customer", contact_company_id: p.contact_company_id });
  let no = p.pagare_no?.trim() || null;
  if (!no) {
    const y = p.issued_on.slice(0, 4);
    const n = await c.query<{ n: number }>(`SELECT count(*)::int + 1 AS n FROM scentsx.pagares WHERE operating_company_id = $1::uuid AND pagare_no LIKE $2`, [co, `PAG-${y}-%`]);
    no = `PAG-${y}-${String(n.rows[0]!.n).padStart(4, "0")}`;
  }
  const r = await c.query<{ id: string }>(
    `INSERT INTO scentsx.pagares (operating_company_id, pagare_no, contact_company_id, party_kyc_id, amount_cents, currency, issued_on, due_on, place_of_payment,
        suscriptor_name, aval_name, moratorio_rate_pct, signed_file_id, notes, created_by)
     VALUES ($1::uuid, $2, $3::uuid, $4::uuid, $5, $6, $7::date, $8::date, $9, $10, $11, $12, $13::uuid, $14, $15::uuid) RETURNING id::text`,
    [co, no, p.contact_company_id, profile?.id ?? null, p.amount_cents, p.currency, p.issued_on, p.due_on ?? null, p.place_of_payment.trim(),
     p.suscriptor_name.trim(), p.aval_name?.trim() || null, p.moratorio_rate_pct ?? null, p.signed_file_id, p.notes ?? null, uid]
  );
  return { id: r.rows[0]!.id, pagare_no: no };
}

/** Returned to the customer (credit closed / paid) or voided (entered in error). Both keep the row. */
export async function closePagare(c: Q, uid: string, id: string, action: "returned" | "void", note: string) {
  await scopeToScentsx(c);
  if (note.trim().length < 10) throw new ScentsxLinkInvalid("A note of at least 10 characters is required");
  const r = action === "returned"
    ? await c.query(`UPDATE scentsx.pagares SET status = 'returned', returned_at = now(), returned_by = $2::uuid, return_note = $3 WHERE id = $1::uuid AND status = 'held'`, [id, uid, note.trim()])
    : await c.query(`UPDATE scentsx.pagares SET status = 'void', voided_at = now(), voided_by = $2::uuid, void_reason = $3 WHERE id = $1::uuid AND status = 'held'`, [id, uid, note.trim()]);
  if (!r.rowCount) throw new ScentsxLinkNotFound();
  return { id, status: action };
}

/** The desk: every linked customer and vendor with its KYC result, expiring documents, and every held pagaré. */
export async function kycDesk(c: Q) {
  await scopeToScentsx(c);
  const d = await today(c);
  const parties = await c.query<{ kind: "customer" | "vendor"; party_id: string; name: string; engine_id: string }>(
    `SELECT 'customer' AS kind, l.contact_company_id::text AS party_id, cc.name AS name, l.customer_id::text AS engine_id
       FROM scentsx.customer_links l JOIN perfume.contact_companies cc ON cc.id = l.contact_company_id WHERE l.voided_at IS NULL
     UNION ALL
     SELECT 'vendor', l.perfume_vendor_id::text, v.name, l.vendor_id::text
       FROM scentsx.vendor_links l JOIN perfume.vendors v ON v.id = l.perfume_vendor_id WHERE l.voided_at IS NULL
     ORDER BY 1, 3`
  );
  const rows = [];
  for (const p of parties.rows) {
    const party: KycParty = p.kind === "customer" ? { kind: "customer", contact_company_id: p.party_id } : { kind: "vendor", perfume_vendor_id: p.party_id };
    const profile = await loadProfile(c, party);
    const forms = profile ? await loadForms(c, profile.id) : [];
    rows.push({ ...p, reviewed_at: profile?.reviewed_at ?? null, ...requirements(p.kind, profile, forms, d) });
  }
  const pagares = await c.query(
    `SELECT p.id::text, p.pagare_no, p.contact_company_id::text, cc.name AS customer_name, p.amount_cents::text, p.currency, p.issued_on::text, p.due_on::text, p.status
       FROM scentsx.pagares p JOIN perfume.contact_companies cc ON cc.id = p.contact_company_id WHERE p.status = 'held' ORDER BY p.due_on NULLS LAST, p.issued_on`
  );
  return {
    parties: rows,
    counts: {
      complete: rows.filter((r) => r.status === "complete").length,
      incomplete: rows.filter((r) => r.status === "incomplete").length,
      none: rows.filter((r) => r.status === "none").length,
      expiring: rows.filter((r) => r.warnings.length > 0).length,
    },
    pagares_held: pagares.rows.map((x) => ({ ...x, amount_cents: Number(x.amount_cents) })),
  };
}
