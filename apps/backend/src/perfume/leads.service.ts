/**
 * PERFUME-LEADS — catalogs and the contacts Excel round trip (owner 2026-11-26 17:38 CT: "we need to update the customers and
 * vendors, the contacts … i need to be able to filter and categorize in an excel and then upload, and then see what is not
 * necessary … where is the lists or catalogs for types").
 *
 *  - Catalogs: the editable type lists (perfume.catalog_values) — vendor / customer types, categories, business types, lead
 *    source kinds, perfume product types, genders. The Excel download offers them as drop-downs.
 *  - Download: every contact as one Excel row per person (a company with nobody on file is one row), with its Company ID and
 *    Person ID, an Action column (Keep / Remove company / Remove person) and the type columns.
 *  - Upload → preview: nothing is written except the upload itself. Rows with an ID are compared field by field with what is
 *    on file; rows without an ID are new leads (the research / leaked-list / phone files the owner keeps in Excel), grouped by
 *    the file's Group ID and matched against the contacts with the same matcher the import uses. The preview lists every
 *    change, every removal, every new lead and every type the catalogs don't have yet.
 *  - Apply (owner's click): one transaction — field changes, removals archived (never deleted), new leads imported with their
 *    origin (a leaked row keeps the address the leak came from and the list number), unknown types added to the catalogs.
 */
import type pg from "pg";
import ExcelJS from "exceljs";
import { z } from "zod";
import { withCurrentUser } from "../auth/db.js";
import { emptyTally, findCompany, FREE_MAIL, importRecords, importRecordSchema, type ImportRecord } from "./contacts.import.js";
import { ContactMatcher, nameKeys, phone10 } from "./contacts.matcher.js";
import { contactWhere, type ContactListQuery } from "./contacts.service.js";
import { logEvent, logEvents, type LeadEvent } from "./leads.events.js";

/* ------------------------------------------------------------------ catalogs */

export const CATALOG_KINDS = ["vendor_type", "customer_type", "category", "segment", "source_kind", "product_type", "gender", "item_category", "olfactory_family"] as const;
/** Lists whose values are carried by ITEMS (perfume.items), not contacts — counted and renamed on items (owner 2026-11-27 07:51 CT). */
export const ITEM_CATALOG_COLUMN: Partial<Record<string, "product_type" | "category">> = { product_type: "product_type", item_category: "category" };
export type CatalogKind = typeof CATALOG_KINDS[number];
export const CATALOG_LABELS: Record<CatalogKind, string> = {
  vendor_type: "Vendor types", customer_type: "Customer types", category: "Categories", segment: "Business types",
  source_kind: "Lead source kinds", product_type: "Item product types", gender: "Genders", item_category: "Item categories", olfactory_family: "Scent families (olfactory)",
};
export const catalogValueSchema = z.object({ kind: z.enum(CATALOG_KINDS), value: z.string().trim().min(1).max(200), sort: z.number().int().min(0).max(10000).optional() });

export class LeadsError extends Error {
  constructor(public readonly code: string, message: string) { super(message); }
}

/** Every catalog with its values, and how many contacts use each value (companies; origins for source kinds). */
export async function listCatalogs(c: pg.PoolClient) {
  const rows = (await c.query<{ id: string; kind: CatalogKind; value: string; sort: number }>(
    `SELECT id, kind, value, sort FROM perfume.catalog_values WHERE archived_at IS NULL ORDER BY kind, sort, lower(value)`)).rows;
  const used = (await c.query<{ kind: string; value: string; n: number }>(
    `SELECT 'vendor_type' AS kind, vendor_type AS value, count(*)::int AS n FROM perfume.contact_companies WHERE archived_at IS NULL AND vendor_type IS NOT NULL GROUP BY 2
     UNION ALL SELECT 'customer_type', customer_type, count(*)::int FROM perfume.contact_companies WHERE archived_at IS NULL AND customer_type IS NOT NULL GROUP BY 2
     UNION ALL SELECT 'category', v, count(DISTINCT id)::int FROM (SELECT id, unnest(array_remove(array_cat(ARRAY[main_category], categories), NULL)) AS v
                 FROM perfume.contact_companies WHERE archived_at IS NULL) x GROUP BY 2
     UNION ALL SELECT 'segment', segment, count(*)::int FROM perfume.contact_companies WHERE archived_at IS NULL AND segment IS NOT NULL GROUP BY 2
     UNION ALL SELECT 'source_kind', k, count(DISTINCT company_id)::int FROM (
                 SELECT o.company_id, o.source_kind AS k FROM perfume.contact_origins o JOIN perfume.contact_companies co ON co.id = o.company_id AND co.archived_at IS NULL
                 UNION ALL SELECT id, source_kind FROM perfume.contact_companies WHERE archived_at IS NULL) y WHERE k IS NOT NULL GROUP BY 2
     UNION ALL SELECT 'product_type', product_type, count(*)::int FROM perfume.items WHERE merged_into_id IS NULL AND product_type IS NOT NULL GROUP BY 2
     UNION ALL SELECT 'item_category', category, count(*)::int FROM perfume.items WHERE merged_into_id IS NULL AND category IS NOT NULL GROUP BY 2
     UNION ALL SELECT 'olfactory_family', olfactory_family, count(*)::int FROM perfume.item_families WHERE archived_at IS NULL AND olfactory_family IS NOT NULL GROUP BY 2`)).rows;
  const count = new Map(used.map((u) => [`${u.kind}\u0000${u.value.trim().toLowerCase()}`, u.n]));
  const out = Object.fromEntries(CATALOG_KINDS.map((k) => [k, [] as Array<{ id: string; value: string; sort: number; contacts: number }>])) as
    Record<CatalogKind, Array<{ id: string; value: string; sort: number; contacts: number }>>;
  for (const r of rows) out[r.kind].push({ id: r.id, value: r.value, sort: r.sort, contacts: count.get(`${r.kind}\u0000${r.value.trim().toLowerCase()}`) ?? 0 });
  return { kinds: CATALOG_KINDS.map((k) => ({ kind: k, label: CATALOG_LABELS[k], used_by: k === "olfactory_family" ? "families" as const : ITEM_CATALOG_COLUMN[k] ? "items" as const : "contacts" as const, values: out[k] })) };
}

export async function addCatalogValue(c: pg.PoolClient, uid: string, v: z.infer<typeof catalogValueSchema>) {
  const r = await c.query<{ id: string }>(
    `INSERT INTO perfume.catalog_values (kind, value, sort, created_by)
     SELECT $1, $2, coalesce($3, 100), $4
      WHERE NOT EXISTS (SELECT 1 FROM perfume.catalog_values WHERE kind = $1 AND lower(btrim(value)) = lower(btrim($2)) AND archived_at IS NULL)
     RETURNING id`, [v.kind, v.value, v.sort ?? null, uid]);
  if (!r.rowCount) throw new LeadsError("exists", `"${v.value}" is already in ${CATALOG_LABELS[v.kind]}.`);
  await logEvent(c, uid, { entity: "catalog_value", entity_id: r.rows[0]!.id, action: "added", detail: { kind: v.kind, value: v.value } });
  return { id: r.rows[0]!.id };
}

/**
 * Rename a value: the catalog row and every contact carrying the old text move together (a type is a label, so the
 * contacts follow it). Source kinds are computed from where a lead came from, so they can be added or archived, not renamed.
 */
export async function renameCatalogValue(c: pg.PoolClient, id: string, value: string, uid: string | null = null) {
  const cur = (await c.query<{ kind: CatalogKind; value: string }>(`SELECT kind, value FROM perfume.catalog_values WHERE id = $1 AND archived_at IS NULL`, [id])).rows[0];
  if (!cur) throw new LeadsError("not_found", "Catalog value not found.");
  if (cur.kind === "source_kind") throw new LeadsError("source_kind_fixed", "A source kind comes from where the lead was found; add a new one instead.");
  const clash = await c.query(`SELECT 1 FROM perfume.catalog_values WHERE kind = $1 AND lower(btrim(value)) = lower(btrim($2)) AND id <> $3 AND archived_at IS NULL`, [cur.kind, value, id]);
  if (clash.rowCount) throw new LeadsError("exists", `"${value}" is already in ${CATALOG_LABELS[cur.kind]}.`);
  await c.query(`UPDATE perfume.catalog_values SET value = $2, updated_at = now() WHERE id = $1`, [id, value]);
  const col = cur.kind === "vendor_type" ? "vendor_type" : cur.kind === "customer_type" ? "customer_type" : cur.kind === "segment" ? "segment" : null;
  let moved = 0;
  if (col) moved = (await c.query(`UPDATE perfume.contact_companies SET ${col} = $2, updated_at = now() WHERE ${col} = $1`, [cur.value, value])).rowCount ?? 0;
  if (cur.kind === "category") {
    moved = (await c.query(
      `UPDATE perfume.contact_companies SET main_category = CASE WHEN main_category = $1 THEN $2 ELSE main_category END,
          categories = array_replace(categories, $1, $2), updated_at = now()
        WHERE main_category = $1 OR $1 = ANY(categories)`, [cur.value, value])).rowCount ?? 0;
  }
  // Item lists: every item carrying the old value follows the rename, and each item's own history says so.
  const itemCol = ITEM_CATALOG_COLUMN[cur.kind];
  let itemsMoved = 0;
  if (itemCol) {
    const it = await c.query<{ id: string }>(
      `UPDATE perfume.items SET ${itemCol} = $2, updated_at = now() WHERE ${itemCol} = $1 AND merged_into_id IS NULL RETURNING id`, [cur.value, value]);
    itemsMoved = it.rowCount ?? 0;
    for (const r of it.rows) {
      await c.query(`INSERT INTO perfume.item_events (item_id, kind, detail, created_by) VALUES ($1, 'attributes', $2::jsonb, $3)`,
        [r.id, JSON.stringify({ from: { [itemCol]: cur.value }, to: { [itemCol]: value }, via: "catalog_rename" }), uid]);
    }
  }
  // Scent families are carried by item families: they follow the rename, and each family's history says so.
  if (cur.kind === "olfactory_family") {
    const fs = await c.query<{ id: string }>(
      `UPDATE perfume.item_families SET olfactory_family = $2, updated_at = now() WHERE olfactory_family = $1 AND archived_at IS NULL RETURNING id`, [cur.value, value]);
    itemsMoved = fs.rowCount ?? 0;
    for (const r of fs.rows) {
      await c.query(`INSERT INTO perfume.item_family_events (family_id, kind, detail, created_by) VALUES ($1, 'edited', $2::jsonb, $3)`,
        [r.id, JSON.stringify({ from: { olfactory_family: cur.value }, to: { olfactory_family: value }, via: "catalog_rename" }), uid]);
    }
  }
  await logEvent(c, uid, { entity: "catalog_value", entity_id: id, action: "renamed", detail: { kind: cur.kind, from: cur.value, to: value, contacts_moved: moved, items_moved: itemsMoved } });
  return { moved, items_moved: itemsMoved };
}

export async function archiveCatalogValue(c: pg.PoolClient, id: string, uid: string | null = null) {
  const r = await c.query<{ kind: string; value: string }>(`UPDATE perfume.catalog_values SET archived_at = now(), updated_at = now() WHERE id = $1 AND archived_at IS NULL RETURNING kind, value`, [id]);
  if (r.rowCount) await logEvent(c, uid, { entity: "catalog_value", entity_id: id, action: "archived", detail: { kind: r.rows[0]!.kind, value: r.rows[0]!.value } });
}

/* ------------------------------------------------------------------ download */

const ROLE_TEXT: Record<string, string> = { vendor: "Vendor", customer: "Customer", both: "Vendor + customer" };
const STATUS_TEXT: Record<string, string> = { prospect: "Prospect", active: "Active", dormant: "Dormant", do_not_email: "Do not email" };
export const ACTIONS = ["Keep", "Remove company", "Remove person"] as const;

/** The columns of the download, in order. `edit` marks the ones an upload applies; the rest are for reading and filtering. */
export const EXPORT_COLUMNS: Array<{ key: string; header: string; width: number; edit?: boolean; list?: CatalogKind | "role" | "status" | "action" }> = [
  { key: "company_id", header: "Company ID", width: 12 },
  { key: "person_id", header: "Person ID", width: 12 },
  { key: "action", header: "Action", width: 16, edit: true, list: "action" },
  { key: "company", header: "Company", width: 34, edit: true },
  { key: "role", header: "Role", width: 18, edit: true, list: "role" },
  { key: "vendor_type", header: "Vendor type", width: 18, edit: true, list: "vendor_type" },
  { key: "customer_type", header: "Customer type", width: 20, edit: true, list: "customer_type" },
  { key: "category", header: "Category", width: 22, edit: true, list: "category" },
  { key: "other_categories", header: "Other categories", width: 26, edit: true },
  { key: "segment", header: "Business type", width: 22, edit: true, list: "segment" },
  { key: "status", header: "Status", width: 14, edit: true, list: "status" },
  { key: "source_kinds", header: "Source kinds", width: 30 },
  { key: "source", header: "Source", width: 22 },
  { key: "how_started", header: "How it started", width: 22 },
  { key: "leaked_from", header: "Leaked from", width: 34 },
  { key: "person", header: "Person", width: 24, edit: true },
  { key: "title", header: "Title", width: 18, edit: true },
  { key: "email", header: "Email", width: 30, edit: true },
  { key: "phones", header: "Phones", width: 24, edit: true },
  { key: "country", header: "Country", width: 14, edit: true },
  { key: "state", header: "State", width: 14, edit: true },
  { key: "city", header: "City", width: 16, edit: true },
  { key: "region", header: "Region", width: 14, edit: true },
  { key: "address", header: "Address", width: 30, edit: true },
  { key: "website", header: "Website", width: 24, edit: true },
  { key: "first_contact", header: "First contact", width: 12 },
  { key: "last_email", header: "Last email", width: 12 },
  { key: "notes", header: "Notes", width: 30, edit: true },
];

type ExportRow = Record<string, string | null>;

export async function exportRows(c: pg.PoolClient, q: ContactListQuery): Promise<ExportRow[]> {
  const { where, args } = contactWhere(q);
  const r = await c.query(
    `SELECT co.id AS company_id, p.id AS person_id, co.name AS company, co.role, co.vendor_type, co.customer_type, co.main_category AS category,
            array_to_string(array_remove(co.categories, co.main_category), '; ') AS other_categories, co.segment, co.status,
            (SELECT string_agg(k, '; ' ORDER BY k) FROM (SELECT o.source_kind AS k FROM perfume.contact_origins o WHERE o.company_id = co.id
                                   UNION SELECT co.source_kind) z WHERE k IS NOT NULL) AS source_kinds,
            co.source,
            (SELECT o.how FROM perfume.contact_origins o WHERE o.company_id = co.id ORDER BY o.occurred_on NULLS LAST, o.created_at LIMIT 1) AS how_started,
            (SELECT string_agg(x, '; ' ORDER BY x) FROM (SELECT concat_ws(' ', substr(o.source, 11), CASE WHEN o.sender_email IS NOT NULL THEN '<' || o.sender_email || '>' END) AS x
                                    FROM perfume.contact_origins o WHERE o.company_id = co.id AND o.source_kind = 'Leaked email' AND o.source ILIKE 'Copied by %'
                                     AND (p.id IS NULL OR o.person_id IS NULL OR o.person_id = p.id) GROUP BY 1) lk) AS leaked_from,
            p.name AS person, p.title, p.email, array_to_string(p.phones, '; ') AS phones,
            co.country, co.state, co.city, co.region, co.address, coalesce(co.website, co.domain) AS website,
            to_char(coalesce(p.first_contact_on, co.first_contact_on), 'YYYY-MM-DD') AS first_contact,
            to_char(coalesce(p.last_email_on, co.last_email_on), 'YYYY-MM-DD') AS last_email, co.notes
       FROM perfume.contact_companies co
       LEFT JOIN perfume.contact_people p ON p.company_id = co.id AND p.archived_at IS NULL
      WHERE ${where.join(" AND ")}
      ORDER BY lower(co.name), co.id, p.email NULLS LAST, p.name`, args);
  return r.rows.map((x) => ({
    ...x, action: "Keep", role: x.role ? ROLE_TEXT[x.role] ?? x.role : null, status: x.status ? STATUS_TEXT[x.status] ?? x.status : null,
    company_id: x.company_id, person_id: x.person_id ?? null,
  }));
}

export async function exportWorkbook(c: pg.PoolClient, q: ContactListQuery) {
  const rows = await exportRows(c, q);
  const cats = await listCatalogs(c);
  const wb = new ExcelJS.Workbook();
  wb.creator = "TIO Perfumes";
  const ws = wb.addWorksheet("Leads", { views: [{ state: "frozen", xSplit: 4, ySplit: 1 }] });
  ws.columns = EXPORT_COLUMNS.map((col) => ({ header: col.header, key: col.key, width: col.width }));
  for (const r of rows) ws.addRow(r);
  const head = ws.getRow(1);
  head.font = { bold: true, color: { argb: "FFFFFFFF" } };
  head.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF14314F" } };
  head.height = 20;
  // Read-only columns are grey so the owner sees at a glance what an upload changes.
  EXPORT_COLUMNS.forEach((col, i) => {
    if (!col.edit) ws.getColumn(i + 1).font = { color: { argb: "FF6B7280" } };
  });
  head.font = { bold: true, color: { argb: "FFFFFFFF" } };
  ws.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: EXPORT_COLUMNS.length } };

  // The drop-down lists live on their own sheet; every list column of Leads points at its column there.
  const lists = wb.addWorksheet("Lists");
  const listCols: Array<{ name: string; values: string[] }> = [
    { name: "action", values: [...ACTIONS] },
    { name: "role", values: Object.values(ROLE_TEXT) },
    { name: "status", values: Object.values(STATUS_TEXT) },
    ...cats.kinds.filter((k) => k.kind !== "source_kind" && k.kind !== "product_type" && k.kind !== "gender").map((k) => ({ name: k.kind, values: k.values.map((v) => v.value) })),
  ];
  listCols.forEach((l, i) => {
    const col = i + 1;
    lists.getCell(1, col).value = l.name;
    lists.getCell(1, col).font = { bold: true };
    l.values.forEach((v, j) => { lists.getCell(j + 2, col).value = v; });
    lists.getColumn(col).width = 26;
  });
  const last = Math.max(rows.length + 1, 2) + 2000; // room for rows the owner adds
  EXPORT_COLUMNS.forEach((col, i) => {
    if (!col.list) return;
    const li = listCols.findIndex((l) => l.name === col.list);
    if (li < 0) return;
    const letter = lists.getColumn(li + 1).letter;
    const n = Math.max(listCols[li]!.values.length, 1);
    const colLetter = ws.getColumn(i + 1).letter;
    // Lists are offered, not forced: a new type typed by hand is shown in the upload preview and added to the catalog on Apply.
    (ws as unknown as { dataValidations: { add: (range: string, v: unknown) => void } }).dataValidations.add(`${colLetter}2:${colLetter}${last}`, {
      type: "list", allowBlank: true, showErrorMessage: false, formulae: [`Lists!$${letter}$2:$${letter}$${n + 1}`],
    });
  });

  const help = wb.addWorksheet("How to use");
  [
    "1. Filter and sort the Leads sheet as you like. Change any white column; grey columns are for reading.",
    "2. Action: Keep (default), Remove company (the whole company and its people), Remove person (only that person).",
    "3. Role / types / category / status offer drop-downs from the app's Catalogs. A new value you type is shown before it is saved.",
    "4. New leads: add rows at the bottom with no Company ID — or upload a research / leaked-list / phone file as its own sheet.",
    "5. Upload the file on Leads → Excel. The app shows every change, removal and new lead first. Nothing is saved until you press Apply.",
    "Removed contacts are archived, never deleted.",
  ].forEach((t, i) => { help.getCell(i + 1, 1).value = t; });
  help.getColumn(1).width = 120;
  const buf = Buffer.from(await wb.xlsx.writeBuffer());
  const stamp = new Date().toLocaleDateString("en-US", { timeZone: "America/Chicago", month: "2-digit", day: "2-digit", year: "numeric" }).replace(/\//g, "-");
  return { buf, fileName: `${stamp}-TIO-Perfumes-Leads.xlsx`, rows: rows.length };
}

/* ------------------------------------------------------------------ upload → preview */

export const uploadSchema = z.object({
  file_name: z.string().trim().min(1).max(300),
  sheets: z.array(z.object({
    name: z.string().max(200),
    rows: z.array(z.array(z.union([z.string().max(4000), z.number(), z.boolean(), z.null()])).max(120)).max(25000),
  })).min(1).max(20),
});
export type UploadInput = z.infer<typeof uploadSchema>;

const norm = (h: unknown) => String(h ?? "").toLowerCase().replace(/[^a-z0-9]+/g, "");
/** Header names this reads, from the app's own download and from the organized contacts files (Emails / Leaked emails / Phone contacts). */
const ALIASES: Record<string, string[]> = {
  company_id: ["companyid"], person_id: ["personid"], action: ["action"],
  company: ["company", "companyname", "companyyourrecords"],
  role: ["role"], vendor_type: ["vendortype"], customer_type: ["customertype"], category: ["category"], other_categories: ["othercategories"],
  segment: ["businesstype", "segment"], status: ["status"],
  person: ["person", "fullname", "contactname", "nameintheemail", "contactnameyourrecords", "name"], title: ["title"],
  email: ["email", "emails", "exposedemailtocc"], phones: ["phones", "phone", "phoneyourrecords"],
  country: ["country", "countryfromphonecode", "countryfromphone", "countryrecords"], state: ["state"], city: ["city"], region: ["region"], address: ["address"], website: ["website"],
  zip: ["zip", "zipcode", "postalcode"],
  notes: ["notes", "note"], first_contact: ["firstemail", "firstcontact"], last_email: ["lastemail"],
  leak_no: ["leak"], leak_subject: ["leakedlistemailsubject"], leak_sender: ["leakedfromsenderaddress"], leak_sender_company: ["sendercompany"],
  date_sent: ["datesent"], found_on: ["foundon", "listfoundon", "sourceswherefound", "sources"], record_type: ["recordtype"],
  group: ["groupidlinksalltabs", "groupidemailsphonestab", "groupidemailsfull", "groupid"], subjects: ["samplesubjects"],
  // The final contacts file (owner 2026-11-26 18:55 CT): research rows carry their Source / Type; phone rows say whether the number is real.
  research_source: ["source"], research_type: ["type"], valid: ["validnumber"], section: ["section"], why_removed: ["whyremoved"],
};
const HEADER_LOOKUP = new Map<string, string>();
for (const [field, names] of Object.entries(ALIASES)) for (const n of names) if (!HEADER_LOOKUP.has(n)) HEADER_LOOKUP.set(n, field);

export type SheetKind = "export" | "email" | "leaked" | "phone" | "research" | "removed" | "other";
export function sheetKind(name: string, fields: Set<string>): SheetKind {
  const n = name.toLowerCase();
  if (fields.has("company_id")) return "export";
  if (fields.has("why_removed") || /^removed/.test(n)) return "removed";
  if (fields.has("leak_sender") || /leak/.test(n)) return "leaked";
  if (/prospect|research/.test(n) || (fields.has("research_source") && fields.has("research_type"))) return "research";
  if (/contacts?-?full/.test(n)) return "phone";
  if (/phone/.test(n)) return "phone";
  if (/e-?mail/.test(n)) return "email";
  return "other";
}
const SKIP_SHEETS = /^(summary|lists|how to use|readme|catalogs?)$/i;

type Cell = string | number | boolean | null;
export type ParsedRow = { sheet: string; kind: SheetKind; row: number; f: Record<string, string> };

/** The header row is whichever of the first 8 rows names the most known columns (2 at least); a row with no name, email or phone is skipped. */
export function parseSheets(input: UploadInput) {
  const out: ParsedRow[] = [];
  const sheets: Array<{ name: string; kind: SheetKind | "skipped"; header_row: number | null; rows: number; used: number; columns: string[] }> = [];
  for (const sh of input.sheets) {
    if (SKIP_SHEETS.test(sh.name.trim())) { sheets.push({ name: sh.name, kind: "skipped", header_row: null, rows: sh.rows.length, used: 0, columns: [] }); continue; }
    let best = -1; let bestHits = 1;
    sh.rows.slice(0, 8).forEach((r, i) => {
      const hits = new Set(r.map((h) => HEADER_LOOKUP.get(norm(h))).filter(Boolean)).size;
      if (hits > bestHits) { best = i; bestHits = hits; }
    });
    if (best < 0) { sheets.push({ name: sh.name, kind: "skipped", header_row: null, rows: sh.rows.length, used: 0, columns: [] }); continue; }
    const head = sh.rows[best]!.map((h) => HEADER_LOOKUP.get(norm(h)) ?? null);
    // A header named twice ("Country" and "Country (from phone code)") keeps its first column.
    const colOf = new Map<string, number>();
    head.forEach((f, i) => { if (f && !colOf.has(f)) colOf.set(f, i); });
    const fields = new Set(colOf.keys());
    const kind = sheetKind(sh.name, fields);
    let used = 0;
    sh.rows.slice(best + 1).forEach((r: Cell[], j) => {
      const f: Record<string, string> = {};
      for (const [k, i] of colOf) { const v = r[i]; if (v != null && String(v).trim() !== "") f[k] = String(v).trim(); }
      if (!f.company && !f.person && !f.email && !f.phones && !f.company_id) return;
      // Section rows ("USA  -  1702 phone rows") carry only the first column.
      if (kind === "phone" && !f.phones && !f.email) return;
      // A phone the file marks as not a real number (the extra +1 / +52 copy of a number saved without a code) never comes in.
      if (kind === "phone" && f.valid && /^no/i.test(f.valid)) return;
      // Owner 2026-11-26: "no i do not want the inegi data in the app, it is inaccurate" — INEGI rows are never read.
      if (kind === "research" && f.research_source && /inegi/i.test(f.research_source)
        && !f.research_source.split(/\s*\+\s*/).some((x) => !/inegi/i.test(x))) return;
      out.push({ sheet: sh.name, kind, row: best + j + 2, f });
      used += 1;
    });
    sheets.push({ name: sh.name, kind, header_row: best + 1, rows: sh.rows.length - best - 1, used, columns: [...fields] });
  }
  return { rows: out, sheets };
}

const blank = (v: string | null | undefined) => (v == null || v.trim() === "" ? null : v.trim());
const ROLE_IN: Record<string, "vendor" | "customer" | "both"> = { vendor: "vendor", customer: "customer", both: "both", "vendor + customer": "both", "vendor and customer": "both", "vendor/customer": "both" };
const STATUS_IN: Record<string, string> = { prospect: "prospect", active: "active", dormant: "dormant", "do not email": "do_not_email", do_not_email: "do_not_email" };
export function roleIn(v: string | null | undefined): "vendor" | "customer" | "both" | null | undefined {
  const t = blank(v); if (t == null) return null; return ROLE_IN[t.toLowerCase()];
}
export function actionIn(v: string | null | undefined): "keep" | "remove_company" | "remove_person" {
  const t = (blank(v) ?? "keep").toLowerCase();
  if (/person/.test(t) && /(remove|delete|drop|quitar|borrar)/.test(t)) return "remove_person";
  if (/^(remove|delete|drop|quitar|borrar|no|not necessary|no necesario)/.test(t)) return "remove_company";
  return "keep";
}
const splitList = (v: string | null | undefined) => (blank(v) ? v!.split(/[;,\n|]+/).map((x) => x.trim()).filter(Boolean) : []);
const isoDate = (v: string | null | undefined) => { const t = blank(v); const m = t ? /^(\d{4})-(\d{2})-(\d{2})/.exec(t) : null; return m ? `${m[1]}-${m[2]}-${m[3]}` : null; };
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
/** A file category like "1 Perfume vendor - sent offers/lists" → "Perfume vendor - sent offers/lists"; 1 and 2 are vendors. */
export function fileCategory(v: string | null | undefined): { label: string | null; role: "vendor" | "customer" | null } {
  const t = blank(v); if (!t) return { label: null, role: null };
  const label = t.replace(/^[1-9]\s+/, "").trim();
  // The words say it: "Perfume vendor / supplier", "Linked to a perfume vendor" → vendor; "Perfume customer", "Mexico customer", "Buyer …" → customer.
  const role = /\b(vendor|supplier)\b/i.test(label) ? "vendor" : /\b(customer|buyer)\b/i.test(label) ? "customer" : null;
  return { label, role };
}
/** A research row's Source ("BBB + Customs / key importer") → each source on its own, INEGI left out. */
export function researchSources(v: string | null | undefined): string[] {
  return (blank(v) ?? "").split(/\s*\+\s*/).map((x) => x.trim()).filter((x) => x && !/inegi/i.test(x));
}
const COUNTRY_UNKNOWN = /^(not verified|unknown.*|incomplete.*|usa\/canada.*)$/i;

type CompanyRow = { id: string; name: string; role: string | null; vendor_type: string | null; customer_type: string | null; main_category: string | null;
  categories: string[]; segment: string | null; status: string; country: string | null; state: string | null; city: string | null; region: string | null;
  address: string | null; website: string | null; notes: string | null };
type PersonRow = { id: string; company_id: string; name: string | null; title: string | null; email: string | null; phones: string[] };

const COMPANY_EDIT = ["company", "role", "vendor_type", "customer_type", "category", "other_categories", "segment", "status", "country", "state", "city", "region", "address", "website", "notes"] as const;
const PERSON_EDIT = ["person", "title", "email", "phones"] as const;

export type Plan = {
  company_updates: Array<{ id: string; set: Record<string, unknown> }>;
  person_updates: Array<{ id: string; set: Record<string, unknown> }>;
  remove_companies: string[];
  remove_people: string[];
  records: Array<{ rec: ImportRecord; categories: string[]; kind: SheetKind }>;
  unknown: Partial<Record<CatalogKind, string[]>>;
  /** Contacts on file that the upload's Removed-Check sheet lists (by email or phone) — archived on Apply unless left out. */
  removed_check?: { people: string[]; companies: string[] };
};

function currentCompanyValue(co: CompanyRow, k: typeof COMPANY_EDIT[number]): string | null {
  switch (k) {
    case "company": return co.name;
    case "role": return co.role;
    case "category": return co.main_category;
    case "other_categories": return co.categories.filter((x) => x !== co.main_category).join("; ") || null;
    default: return (co as unknown as Record<string, string | null>)[k] ?? null;
  }
}

/** A row's value for a field, in the form it is stored (role/status codes, lists joined), or undefined when it can't be read. */
function incomingCompanyValue(k: typeof COMPANY_EDIT[number], f: Record<string, string>): string | null | undefined {
  if (k === "role") return roleIn(f.role);
  if (k === "status") { const t = blank(f.status); return t == null ? undefined : STATUS_IN[t.toLowerCase()]; }
  if (k === "company") return blank(f.company) ?? undefined; // a company name is never blanked by an empty cell
  if (k === "other_categories") return splitList(f.other_categories).join("; ") || null;
  return blank(f[k]);
}

function personKey(p: { email?: string | null; phones?: string[]; name?: string | null }) {
  return p.email ? `e:${p.email}` : p.phones?.length ? `p:${phone10(p.phones[0]) ?? p.phones[0]}` : `n:${(p.name ?? "").toLowerCase()}`;
}

/** A row without an ID → the record it adds to (grouped by the file's Group ID, else by email, phone, then name). */
function newRecordKey(r: ParsedRow): string {
  const f = r.f;
  if (f.group) return `g:${f.group}`;
  const email = blank(f.email)?.toLowerCase();
  if (email) {
    const dom = email.split("@")[1] ?? "";
    if (!FREE_MAIL.has(dom) && r.kind !== "leaked") return `d:${dom}`;
    return `e:${email}`;
  }
  const ph = phone10(f.phones);
  if (ph) return `p:${ph}`;
  return `n:${(f.company ?? f.person ?? "").toLowerCase()}`;
}

function companyNameFor(r: ParsedRow): string {
  const f = r.f;
  if (blank(f.company)) return f.company!;
  const email = blank(f.email)?.toLowerCase();
  const dom = email?.split("@")[1];
  if (dom && !FREE_MAIL.has(dom)) { const base = dom.split(".")[0] ?? dom; return base.charAt(0).toUpperCase() + base.slice(1); }
  return blank(f.person) ?? email ?? blank(f.phones) ?? "(no name)";
}

const SOURCE_OF: Record<SheetKind, string> = {
  export: "Excel upload", other: "Excel upload", email: "Mailbox (organized contacts file)", leaked: "Leaked vendor lists", phone: "Phone contacts (organized file)",
  research: "Research (final contacts file)", removed: "Removed",
};

export async function previewUpload(c: pg.PoolClient, input: UploadInput) {
  const { rows, sheets } = parseSheets(input);
  const companies = new Map((await c.query<CompanyRow>(
    `SELECT id, name, role, vendor_type, customer_type, main_category, categories, segment, status, country, state, city, region, address,
            coalesce(website, domain) AS website, notes FROM perfume.contact_companies WHERE archived_at IS NULL`)).rows.map((r) => [r.id, r]));
  const people = new Map((await c.query<PersonRow>(
    `SELECT id, company_id, name, title, email, phones FROM perfume.contact_people WHERE archived_at IS NULL`)).rows.map((r) => [r.id, r]));
  const catalog = new Map<string, Set<string>>();
  for (const r of (await c.query<{ kind: string; value: string }>(`SELECT kind, value FROM perfume.catalog_values WHERE archived_at IS NULL`)).rows) {
    if (!catalog.has(r.kind)) catalog.set(r.kind, new Set());
    catalog.get(r.kind)!.add(r.value.trim().toLowerCase());
  }
  const unknown: Partial<Record<CatalogKind, Set<string>>> = {};
  const checkCatalog = (kind: CatalogKind, v: string | null | undefined) => {
    for (const x of kind === "category" ? splitList(v) : [blank(v)]) {
      if (!x || catalog.get(kind)?.has(x.toLowerCase())) continue;
      (unknown[kind] ??= new Set()).add(x);
    }
  };

  const plan: Plan = { company_updates: [], person_updates: [], remove_companies: [], remove_people: [], records: [], unknown: {} };
  const changes: Array<{ company: string; person: string | null; field: string; from: string | null; to: string | null }> = [];
  const conflicts: Array<{ company: string; field: string; values: string[] }> = [];
  const notFound: Array<{ sheet: string; row: number; id: string }> = [];
  let existingRows = 0;
  const coEdits = new Map<string, Map<string, Set<string>>>(); // company id → field → distinct new values ("\u0000" = null)
  const removeCo = new Set<string>(); const removePe = new Set<string>();
  const newRows: ParsedRow[] = [];
  const sheetCols = new Map(sheets.map((x) => [x.name, x.columns]));

  const removedEmails = new Set<string>(); const removedPhones = new Set<string>();
  for (const r of rows) {
    if (r.kind === "removed") {
      for (const e of splitList(r.f.email)) if (/@/.test(e)) removedEmails.add(e.toLowerCase());
      for (const ph of splitList(r.f.phones)) { const k = phone10(ph); if (k) removedPhones.add(k); }
      continue;
    }
    const cid = r.f.company_id && UUID.test(r.f.company_id) ? r.f.company_id.toLowerCase() : null;
    if (!cid) { newRows.push(r); continue; }
    existingRows += 1;
    const co = companies.get(cid);
    if (!co) { notFound.push({ sheet: r.sheet, row: r.row, id: cid }); continue; }
    const act = actionIn(r.f.action);
    const pid = r.f.person_id && UUID.test(r.f.person_id) ? r.f.person_id.toLowerCase() : null;
    if (act === "remove_company" || (act === "remove_person" && !pid)) { removeCo.add(cid); continue; }
    if (act === "remove_person" && pid) { if (people.has(pid)) removePe.add(pid); continue; }
    const cols = sheetCols.get(r.sheet) ?? [];
    for (const k of COMPANY_EDIT) {
      // A column the sheet doesn't have is left alone; an empty cell in a column it has blanks that field.
      if (!cols.includes(k)) continue;
      const nv = incomingCompanyValue(k, r.f);
      if (nv === undefined) continue;
      if ((currentCompanyValue(co, k) ?? null) === (nv ?? null)) continue;
      if (!coEdits.has(cid)) coEdits.set(cid, new Map());
      const m = coEdits.get(cid)!;
      if (!m.has(k)) m.set(k, new Set());
      m.get(k)!.add(nv ?? "\u0000");
    }
    if (r.f.vendor_type) checkCatalog("vendor_type", r.f.vendor_type);
    if (r.f.customer_type) checkCatalog("customer_type", r.f.customer_type);
    if (r.f.category) checkCatalog("category", r.f.category);
    if (r.f.other_categories) checkCatalog("category", r.f.other_categories);
    if (r.f.segment) checkCatalog("segment", r.f.segment);
    if (pid) {
      const pe = people.get(pid);
      if (!pe) { notFound.push({ sheet: r.sheet, row: r.row, id: pid }); continue; }
      const set: Record<string, unknown> = {};
      if (cols.includes("person") && (blank(r.f.person) ?? null) !== (pe.name ?? null)) set.name = blank(r.f.person);
      if (cols.includes("title") && (blank(r.f.title) ?? null) !== (pe.title ?? null)) set.title = blank(r.f.title);
      const em = blank(r.f.email)?.toLowerCase() ?? null;
      if (cols.includes("email") && em !== (pe.email ?? null) && (em == null || /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(em))) set.email = em;
      const ph = splitList(r.f.phones);
      if (cols.includes("phones") && ph.join("; ") !== pe.phones.join("; ")) set.phones = ph;
      if (Object.keys(set).length) {
        plan.person_updates.push({ id: pid, set });
        for (const [k, v] of Object.entries(set)) changes.push({ company: co.name, person: pe.name ?? pe.email, field: k === "name" ? "person" : k,
          from: k === "phones" ? pe.phones.join("; ") || null : (pe as unknown as Record<string, string | null>)[k] ?? null, to: Array.isArray(v) ? v.join("; ") || null : (v as string | null) });
      }
    }
  }

  for (const [cid, fields] of coEdits) {
    if (removeCo.has(cid)) continue;
    const co = companies.get(cid)!;
    const set: Record<string, unknown> = {};
    for (const [k, vals] of fields) {
      if (vals.size > 1) { conflicts.push({ company: co.name, field: k, values: [...vals].map((v) => (v === "\u0000" ? "(blank)" : v)) }); continue; }
      const v = [...vals][0]!; const val = v === "\u0000" ? null : v;
      set[k] = k === "other_categories" ? splitList(val) : val;
      changes.push({ company: co.name, person: null, field: k, from: currentCompanyValue(co, k as typeof COMPANY_EDIT[number]), to: val });
    }
    if (Object.keys(set).length) plan.company_updates.push({ id: cid, set });
  }
  plan.remove_companies = [...removeCo];
  plan.remove_people = [...removePe].filter((pid) => !removeCo.has(people.get(pid)!.company_id));

  // The file's Removed-Check sheet: contacts already on file with one of its emails or phones are proposed for archive too
  // (owner 2026-11-26 18:11 CT: "REMOVING JUNK ONCE MORE … IN CONTACTS OR PHONE CONTACTS"). A company goes only when every
  // live person of it is on that list.
  const rcPeople = new Set<string>();
  if (removedEmails.size || removedPhones.size) {
    for (const p of people.values()) {
      if ((p.email && removedEmails.has(p.email)) || p.phones.some((x) => { const k = phone10(x); return k ? removedPhones.has(k) : false; })) rcPeople.add(p.id);
    }
  }
  const livePeopleOf = new Map<string, string[]>();
  for (const p of people.values()) { if (!livePeopleOf.has(p.company_id)) livePeopleOf.set(p.company_id, []); livePeopleOf.get(p.company_id)!.push(p.id); }
  const rcCompanies = [...livePeopleOf.entries()].filter(([cid, ids]) => !removeCo.has(cid) && ids.length && ids.every((id) => rcPeople.has(id))).map(([cid]) => cid);
  const rcCoSet = new Set(rcCompanies);
  plan.removed_check = { companies: rcCompanies, people: [...rcPeople].filter((id) => !rcCoSet.has(people.get(id)!.company_id) && !removeCo.has(people.get(id)!.company_id)) };

  // New leads: rows without an ID, grouped into one record each.
  const groups = new Map<string, ParsedRow[]>();
  for (const r of newRows) { const k = newRecordKey(r); if (!groups.has(k)) groups.set(k, []); groups.get(k)!.push(r); }
  for (const rs of groups.values()) {
    const first = rs.find((r) => r.kind === "email") ?? rs.find((r) => blank(r.f.company)) ?? rs[0]!;
    const cats = new Set<string>();
    let role: "vendor" | "customer" | "both" | null = null;
    const merge = (a: typeof role, b: typeof role) => (!a ? b : !b || a === b ? a : "both");
    const peopleBy = new Map<string, ImportRecord["people"][number]>();
    const origins: NonNullable<ImportRecord["origins"]> = [];
    const co: Record<string, unknown> = { name: companyNameFor(first), source: SOURCE_OF[first.kind] };
    for (const r of rs) {
      const f = r.f;
      const fc = fileCategory(f.category);
      if (fc.label) cats.add(fc.label);
      // The file's own Role column wins (Vendor / Customer / Both); otherwise the category's words; a leaked-list buyer is a customer.
      const fileRole = roleIn(f.role);
      if (fileRole) role = merge(role, fileRole);
      else if (r.kind !== "export" && r.kind !== "other" && fc.role) role = merge(role, fc.role);
      if (r.kind === "leaked") role = merge(role, "customer");
      if (r.kind === "research") {
        const t = blank(f.research_type) ?? "";
        if (/vendor|supplier|brand|maker|exporter/i.test(t)) role = merge(role, "vendor"); else if (/customer|importer|buyer/i.test(t)) role = merge(role, "customer");
        if (t) cats.add(t);
      }
      for (const k of ["vendor_type", "customer_type", "segment", "state", "city", "zip", "region", "address", "website", "notes"] as const) if (blank(f[k]) && co[k] == null) co[k] = blank(f[k]);
      const country = blank(f.country);
      if (country && !COUNTRY_UNKNOWN.test(country) && co.country == null) co.country = country;
      for (const x of splitList(f.other_categories)) cats.add(x);
      const email = blank(f.email)?.toLowerCase().split(/[;,\s]+/)[0] ?? null;
      const okEmail = email && /^[^@\s]+@[^@\s]+\.[a-z]{2,}$/.test(email) ? email : null;
      const phones = splitList(f.phones);
      // A research row often repeats the company as its "contact": that is not a person.
      const name = blank(f.person) && blank(f.person)!.toLowerCase() !== (blank(f.company) ?? "").toLowerCase() ? blank(f.person) : null;
      let rowPersonKey: string | null = null;
      if (okEmail || phones.length || name) {
        const p = { name, title: blank(f.title), email: okEmail, phones, first_contact_on: isoDate(f.first_contact ?? f.date_sent), last_email_on: isoDate(f.last_email ?? f.date_sent),
          how_started: r.kind === "leaked" ? "Copied on vendor email" : r.kind === "phone" ? "Phone contacts" : r.kind === "email" ? "Email"
            : r.kind === "research" ? researchSources(f.research_source)[0] ?? "Research" : "Excel upload", found_in: blank(f.found_on) };
        // The same person across tabs of one group: same email, or (no email on this row) the same name or one of the same phones.
        let key = personKey(p);
        if (!okEmail && !peopleBy.has(key)) {
          const k10 = new Set(phones.map(phone10).filter(Boolean));
          const hit = [...peopleBy.entries()].find(([, q]) => (name && q.name && q.name.toLowerCase() === name.toLowerCase())
            || (q.phones ?? []).some((x) => k10.has(phone10(x))));
          if (hit) key = hit[0];
        }
        const had = peopleBy.get(key);
        if (had) { had.phones = [...new Set([...(had.phones ?? []), ...phones])]; had.name = had.name ?? name; }
        else if (peopleBy.size < 200) peopleBy.set(key, p);
        rowPersonKey = key;
      }
      const pi = [...peopleBy.keys()].indexOf(rowPersonKey ?? personKey({ email: okEmail, phones, name }));
      if (r.kind === "leaked") {
        const sender = blank(f.leak_sender_company) ?? blank(f.leak_sender) ?? "unknown sender";
        origins.push({ how: "Copied on vendor email", source: `Copied by ${sender}`.slice(0, 300), occurred_on: isoDate(f.date_sent), person_index: pi >= 0 ? pi : null,
          detail: [blank(f.leak_subject), blank(f.found_on) ? `found on ${f.found_on}` : null].filter(Boolean).join(" · ").slice(0, 2000) || null,
          sender_email: blank(f.leak_sender)?.toLowerCase() ?? null, leak_no: f.leak_no && /^\d+$/.test(f.leak_no) ? Number(f.leak_no) : null });
      } else if (r.kind === "phone") {
        origins.push({ how: "Phone contacts", source: `Phone contacts (${blank(f.found_on) ?? blank(f.record_type) ?? "file"})`.slice(0, 300), person_index: pi >= 0 ? pi : null, occurred_on: null });
      } else if (r.kind === "research") {
        // One origin per research source on the row ("BBB + Customs / key importer" → two), so each lead keeps every place it was found.
        for (const src of researchSources(f.research_source)) origins.push({ how: src.slice(0, 200), source: `Research: ${src}`.slice(0, 300), occurred_on: null, person_index: pi >= 0 ? pi : null,
          detail: blank(f.notes)?.slice(0, 2000) ?? null });
      } else if (r.kind === "email") {
        origins.push({ how: "Email", source: `Mailbox (${blank(f.found_on) ?? "file"})`.slice(0, 300), occurred_on: isoDate(f.first_contact), person_index: pi >= 0 ? pi : null,
          detail: blank(f.subjects)?.slice(0, 2000) ?? null });
      } else {
        origins.push({ how: "Excel upload", source: `Excel upload (${input.file_name})`.slice(0, 300), occurred_on: null, person_index: pi >= 0 ? pi : null });
      }
    }
    const dedupOrigins = [...new Map(origins.map((o) => [`${o.how}|${o.source}|${o.person_index}|${o.occurred_on}`, o])).values()].slice(0, 200);
    const cat = [...cats];
    for (const x of cat) checkCatalog("category", x);
    if (co.vendor_type) checkCatalog("vendor_type", co.vendor_type as string);
    if (co.customer_type) checkCatalog("customer_type", co.customer_type as string);
    if (co.segment) checkCatalog("segment", co.segment as string);
    const parsed = importRecordSchema.safeParse({
      company: { ...co, role, main_category: cat[0] ?? null, categories: cat.slice(0, 50) },
      people: [...peopleBy.values()], origins: dedupOrigins,
    });
    if (parsed.success) plan.records.push({ rec: parsed.data, categories: cat, kind: first.kind });
  }

  // Would each new lead join a contact on file, or be new? Same matcher and keys the import uses — read-only here.
  const m = await ContactMatcher.load(c);
  const keys = await nameKeys(c, plan.records.map((r) => r.rec.company.name));
  let wouldMatch = 0;
  const newSamples: Array<{ name: string; kind: SheetKind; category: string | null; email: string | null; phone: string | null; country: string | null; leaked_from: string | null; match: string | null }> = [];
  const byCategory: Record<string, { records: number; match: number }> = {};
  const byKind: Record<string, number> = {};
  plan.records.forEach((r, i) => {
    const [id] = findCompany(m, r.rec, keys[i] || null);
    if (id) wouldMatch += 1;
    const cat = r.categories[0] ?? "(no category)";
    byCategory[cat] ??= { records: 0, match: 0 };
    byCategory[cat].records += 1; if (id) byCategory[cat].match += 1;
    byKind[r.kind] = (byKind[r.kind] ?? 0) + 1;
    if (newSamples.length < 300) newSamples.push({ name: r.rec.company.name, kind: r.kind, category: r.categories[0] ?? null, email: r.rec.people.find((p) => p.email)?.email ?? null,
      phone: r.rec.people.find((p) => p.phones?.length)?.phones?.[0] ?? null, country: (r.rec.company.country as string | null) ?? null,
      leaked_from: r.rec.origins?.find((o) => o.how === "Copied on vendor email")?.source.slice(10) ?? null, match: id ? companies.get(id)?.name ?? "on file" : null });
  });
  plan.unknown = Object.fromEntries(Object.entries(unknown).map(([k, v]) => [k, [...v!].sort()])) as Plan["unknown"];

  const summary = {
    file_name: input.file_name, sheets,
    existing: { rows: existingRows, companies_changed: plan.company_updates.length, people_changed: plan.person_updates.length,
      remove_companies: plan.remove_companies.length, remove_people: plan.remove_people.length, not_found: notFound.length, conflicts: conflicts.length },
    changes: changes.slice(0, 500), changes_total: changes.length, conflicts: conflicts.slice(0, 100), not_found: notFound.slice(0, 100),
    removals: [
      ...plan.remove_companies.slice(0, 300).map((id) => ({ scope: "company" as const, company: companies.get(id)?.name ?? id, person: null })),
      ...plan.remove_people.slice(0, 300).map((id) => { const p = people.get(id)!; return { scope: "person" as const, company: companies.get(p.company_id)?.name ?? "", person: p.name ?? p.email }; }),
    ],
    new: { records: plan.records.length, would_match: wouldMatch, would_insert: plan.records.length - wouldMatch,
      people: plan.records.reduce((t, r) => t + r.rec.people.length, 0), by_kind: byKind, by_category: byCategory, samples: newSamples },
    unknown: plan.unknown,
    removed_check: {
      companies: plan.removed_check?.companies.length ?? 0, people: plan.removed_check?.people.length ?? 0,
      list: [
        ...(plan.removed_check?.companies ?? []).slice(0, 300).map((id) => ({ scope: "company" as const, company: companies.get(id)?.name ?? id, person: null })),
        ...(plan.removed_check?.people ?? []).slice(0, 300).map((id) => { const p = people.get(id)!; return { scope: "person" as const, company: companies.get(p.company_id)?.name ?? "", person: p.name ?? p.email }; }),
      ],
    },
  };
  return { summary, plan };
}

export async function saveUpload(c: pg.PoolClient, uid: string, input: UploadInput) {
  const { summary, plan } = await previewUpload(c, input);
  const r = await c.query<{ id: string }>(
    `INSERT INTO perfume.contact_uploads (file_name, summary, plan, created_by) VALUES ($1, $2, $3, $4) RETURNING id`,
    [input.file_name, JSON.stringify(summary), JSON.stringify(plan), uid]);
  return { id: r.rows[0]!.id, summary };
}

export async function listUploads(c: pg.PoolClient) {
  return (await c.query(
    `SELECT id, file_name, status, created_at, applied_at, error, summary->'existing' AS existing, ((summary->'new') - 'samples') - 'by_category' AS new, result, options
       FROM perfume.contact_uploads ORDER BY created_at DESC LIMIT 50`)).rows;
}

export async function getUpload(c: pg.PoolClient, id: string) {
  const r = (await c.query(`SELECT id, file_name, status, summary, options, result, error, created_at, applied_at FROM perfume.contact_uploads WHERE id = $1`, [id])).rows[0];
  if (!r) throw new LeadsError("not_found", "Upload not found.");
  return r;
}

export async function discardUpload(c: pg.PoolClient, id: string) {
  await c.query(`UPDATE perfume.contact_uploads SET status = 'discarded', plan = '{}'::jsonb, updated_at = now() WHERE id = $1 AND status = 'previewed'`, [id]);
}

/* ------------------------------------------------------------------ apply */

export const applySchema = z.object({
  skip_categories: z.array(z.string().max(300)).max(200).default([]),
  skip_kinds: z.array(z.enum(["export", "email", "leaked", "phone", "research", "removed", "other"])).max(7).default([]),
  add_unknown: z.boolean().default(true),
  /** Archive the contacts on file that the upload's Removed-Check sheet lists. Off unless the owner ticks it: that sheet is a
   *  "check and tell me" list (the final file's own words), and it holds real business — Coppel, Lux America — measured 2026-11-27. */
  apply_removed_check: z.boolean().default(false),
});
export type ApplyOptions = z.infer<typeof applySchema>;

const COMPANY_SET_SQL: Record<string, string> = {
  company: "name", role: "role", vendor_type: "vendor_type", customer_type: "customer_type", segment: "segment", status: "status",
  country: "country", state: "state", city: "city", region: "region", address: "address", website: "website", notes: "notes",
};

/** Applies a previewed upload in one transaction. Removals archive; nothing is deleted. */
export async function applyPlan(c: pg.PoolClient, uid: string, plan: Plan, opt: ApplyOptions, uploadId: string | null = null) {
  const events: LeadEvent[] = [];
  const result = { companies_changed: 0, people_changed: 0, companies_removed: 0, people_removed: 0, records: 0, inserted: 0, matched: 0,
    people_inserted: 0, origins: 0, skipped: 0, catalog_added: 0, errors: [] as string[] };
  for (const u of plan.company_updates) {
    const sets: string[] = []; const args: unknown[] = [u.id];
    for (const [k, v] of Object.entries(u.set)) {
      if (k === "category") { args.push(v); sets.push(`main_category = $${args.length}`); args.push(v); sets.push(`categories = CASE WHEN $${args.length}::text IS NULL OR $${args.length}::text = ANY(categories) THEN categories ELSE array_append(categories, $${args.length}::text) END`); continue; }
      if (k === "other_categories") { args.push(v); sets.push(`categories = array_remove(ARRAY(SELECT DISTINCT unnest(ARRAY[main_category] || $${args.length}::text[])), NULL)`); continue; }
      const col = COMPANY_SET_SQL[k]; if (!col) continue;
      args.push(v); sets.push(`${col} = $${args.length}`);
    }
    if (!sets.length) continue;
    await c.query("SAVEPOINT u");
    try {
      await c.query(`UPDATE perfume.contact_companies SET ${sets.join(", ")}, updated_at = now() WHERE id = $1 AND archived_at IS NULL`, args); await c.query("RELEASE SAVEPOINT u"); result.companies_changed += 1;
      events.push({ entity: "company", entity_id: u.id, company_id: u.id, action: "edited_in_excel", detail: u.set, upload_id: uploadId });
    }
    catch (e) { await c.query("ROLLBACK TO SAVEPOINT u"); result.errors.push(`company ${u.id}: ${(e as Error).message}`); }
  }
  for (const u of plan.person_updates) {
    const sets: string[] = []; const args: unknown[] = [u.id];
    for (const [k, v] of Object.entries(u.set)) { if (!["name", "title", "email", "phones"].includes(k)) continue; args.push(v); sets.push(`${k} = $${args.length}${k === "phones" ? "::text[]" : ""}`); }
    if (!sets.length) continue;
    await c.query("SAVEPOINT p");
    try {
      const pr = await c.query<{ company_id: string }>(`UPDATE perfume.contact_people SET ${sets.join(", ")}, updated_at = now() WHERE id = $1 AND archived_at IS NULL RETURNING company_id`, args);
      await c.query("RELEASE SAVEPOINT p"); result.people_changed += 1;
      if (pr.rowCount) events.push({ entity: "person", entity_id: u.id, company_id: pr.rows[0]!.company_id, action: "edited_in_excel", detail: u.set, upload_id: uploadId });
    }
    catch (e) { await c.query("ROLLBACK TO SAVEPOINT p"); result.errors.push(`person ${u.id}: ${(e as Error).message.includes("contact_people_email_uq") ? "that email already belongs to another contact" : (e as Error).message}`); }
  }
  if (plan.remove_companies.length) {
    const gone = await c.query<{ id: string }>(`UPDATE perfume.contact_companies SET archived_at = now(), updated_at = now() WHERE id = ANY($1::uuid[]) AND archived_at IS NULL RETURNING id`, [plan.remove_companies]);
    result.companies_removed = gone.rowCount ?? 0;
    for (const g of gone.rows) events.push({ entity: "company", entity_id: g.id, company_id: g.id, action: "archived_in_excel", upload_id: uploadId });
    await c.query(`UPDATE perfume.contact_people SET archived_at = now(), updated_at = now() WHERE company_id = ANY($1::uuid[]) AND archived_at IS NULL`, [plan.remove_companies]);
  }
  if (opt.apply_removed_check && plan.removed_check) {
    const rc = plan.removed_check;
    if (rc.companies.length) {
      const gone = await c.query<{ id: string }>(`UPDATE perfume.contact_companies SET archived_at = now(), updated_at = now() WHERE id = ANY($1::uuid[]) AND archived_at IS NULL RETURNING id`, [rc.companies]);
      result.companies_removed += gone.rowCount ?? 0;
      for (const g of gone.rows) events.push({ entity: "company", entity_id: g.id, company_id: g.id, action: "archived_removed_check", upload_id: uploadId });
      await c.query(`UPDATE perfume.contact_people SET archived_at = now(), updated_at = now() WHERE company_id = ANY($1::uuid[]) AND archived_at IS NULL`, [rc.companies]);
    }
    if (rc.people.length) {
      const gone = await c.query<{ id: string; company_id: string }>(`UPDATE perfume.contact_people SET archived_at = now(), updated_at = now() WHERE id = ANY($1::uuid[]) AND archived_at IS NULL RETURNING id, company_id`, [rc.people]);
      result.people_removed += gone.rowCount ?? 0;
      for (const g of gone.rows) events.push({ entity: "person", entity_id: g.id, company_id: g.company_id, action: "archived_removed_check", upload_id: uploadId });
    }
  }
  if (plan.remove_people.length) {
    const gone = await c.query<{ id: string; company_id: string }>(`UPDATE perfume.contact_people SET archived_at = now(), updated_at = now() WHERE id = ANY($1::uuid[]) AND archived_at IS NULL RETURNING id, company_id`, [plan.remove_people]);
    result.people_removed = gone.rowCount ?? 0;
    for (const g of gone.rows) events.push({ entity: "person", entity_id: g.id, company_id: g.company_id, action: "archived_in_excel", upload_id: uploadId });
  }
  const skipCats = new Set(opt.skip_categories);
  const keep = plan.records.filter((r) => !opt.skip_kinds.includes(r.kind) && !(r.categories.length && r.categories.every((x) => skipCats.has(x))) && !(skipCats.has("(no category)") && !r.categories.length));
  result.skipped = plan.records.length - keep.length;
  for (let i = 0; i < keep.length; i += 500) {
    const t = await importRecords(c, keep.slice(i, i + 500).map((r) => r.rec), uid, emptyTally(), (cid, inserted, rec) => {
      events.push({ entity: "company", entity_id: cid, company_id: cid, action: inserted ? "added_from_upload" : "joined_from_upload",
        detail: { source: rec.company.source, people: rec.people.length, origins: (rec.origins ?? []).map((o) => o.how).slice(0, 20) }, upload_id: uploadId });
    });
    result.records += t.records; result.inserted += t.inserted; result.matched += t.matched; result.people_inserted += t.people_inserted; result.origins += t.origins;
  }
  if (opt.add_unknown) {
    // Only the types still used after the skips go to the catalogs.
    const used = new Set(keep.flatMap((r) => [...r.categories.map((x) => `category\u0000${x.toLowerCase()}`),
      ...(["vendor_type", "customer_type", "segment"] as const).map((k) => `${k}\u0000${String(r.rec.company[k] ?? "").toLowerCase()}`)]));
    const fromEdits = new Set(plan.company_updates.flatMap((u) => Object.entries(u.set).flatMap(([k, v]) =>
      k === "other_categories" ? (v as string[]).map((x) => `category\u0000${x.toLowerCase()}`) : [`${k === "category" ? "category" : k}\u0000${String(v ?? "").toLowerCase()}`])));
    for (const [kind, vals] of Object.entries(plan.unknown) as Array<[CatalogKind, string[]]>) {
      for (const v of vals) {
        const key = `${kind}\u0000${v.toLowerCase()}`;
        if (!used.has(key) && !fromEdits.has(key)) continue;
        const r = await c.query(`INSERT INTO perfume.catalog_values (kind, value, sort, created_by) SELECT $1, $2, 500, $3
          WHERE NOT EXISTS (SELECT 1 FROM perfume.catalog_values WHERE kind = $1 AND lower(btrim(value)) = lower(btrim($2)) AND archived_at IS NULL)`, [kind, v, uid]);
        result.catalog_added += r.rowCount ?? 0;
      }
    }
  }
  await logEvents(c, uid, events);
  return result;
}

const applying = new Set<string>();
/** Starts Apply in the background (an upload of thousands of leads takes longer than one request); the screen polls the upload. */
export async function startApply(uid: string, id: string, opt: ApplyOptions) {
  const ok = await withCurrentUser(uid, async (c) => (await c.query(
    `UPDATE perfume.contact_uploads SET status = 'applying', options = $2, updated_at = now() WHERE id = $1 AND status IN ('previewed', 'failed') RETURNING id`,
    [id, JSON.stringify(opt)])).rowCount);
  if (!ok) throw new LeadsError("not_applicable", "This upload was already applied or discarded — upload the file again.");
  applying.add(id);
  void (async () => {
    try {
      const result = await withCurrentUser(uid, async (c) => {
        const plan = (await c.query<{ plan: Plan }>(`SELECT plan FROM perfume.contact_uploads WHERE id = $1`, [id])).rows[0]!.plan;
        const res = await applyPlan(c, uid, plan, opt, id);
        await c.query(`UPDATE perfume.contact_uploads SET status = 'applied', result = $2, applied_at = now(), error = NULL, updated_at = now() WHERE id = $1`, [id, JSON.stringify(res)]);
        return res;
      });
      return result;
    } catch (e) {
      await withCurrentUser(uid, (c) => c.query(`UPDATE perfume.contact_uploads SET status = 'failed', error = $2, updated_at = now() WHERE id = $1`, [id, (e as Error).message.slice(0, 2000)])).catch(() => undefined);
    } finally { applying.delete(id); }
  })();
  return { status: "applying" as const };
}

/** An upload left "applying" by a restart (nothing running for it here) is marked failed, so it can be applied again. */
export async function healStaleApplies(uid: string) {
  await withCurrentUser(uid, (c) => c.query(
    `UPDATE perfume.contact_uploads SET status = 'failed', error = 'Stopped by a restart before it finished — nothing was saved; apply again.', updated_at = now()
      WHERE status = 'applying' AND updated_at < now() - interval '10 minutes' AND NOT (id = ANY($1::uuid[]))`, [[...applying]]));
}
