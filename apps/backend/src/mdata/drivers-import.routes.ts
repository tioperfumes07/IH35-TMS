import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";
import { withCurrentUser } from "../auth/db.js";
import { resolveOperatingCompanyId } from "../auth/operating-company-scope.js";
import { requireAuth } from "../auth/session-middleware.js";
import { appendCrudAudit } from "../audit/crud-audit.js";

// ── Driver master-list CSV importer (rehire database) ────────────────────────────────────────────────
// Bulk-creates ex/active driver CONTACT profiles from the owner's "Driver Master Contacts List" export so
// every former driver is reachable for rehire outreach. Two modes:
//   mode=preview → parse + map + dedup, return counts + samples, WRITE NOTHING (the safety gate).
//   mode=commit  → insert only the will_create rows, scoped to the active entity, audited.
// Ex-drivers (termination_date present) import as status='Terminated' so they stay out of active rosters.
// Pure helpers below are exported for unit tests (no DB needed).

export type ImportRowClass = "will_create" | "dup_existing" | "dup_in_file" | "invalid";

export type MappedDriverRow = {
  rowNumber: number;
  first_name: string;
  last_name: string;
  phone: string;
  phoneMissing: boolean;
  hire_date: string | null;
  termination_date: string | null;
  cdl_number: string | null;
  status: "Active" | "Terminated";
  klass: ImportRowClass;
  reason?: string;
};

const PHONE_PLACEHOLDER = "0000000000";

/** Minimal RFC-4180-ish CSV parser: handles quotes, escaped quotes, CRLF, embedded commas/newlines. */
export function parseCsvText(text: string): string[][] {
  const rows: string[][] = [];
  let field = "";
  let row: string[] = [];
  let inQuotes = false;
  for (let i = 0; i < text.length; i += 1) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') { field += '"'; i += 1; } else inQuotes = false;
      } else field += c;
      continue;
    }
    if (c === '"') { inQuotes = true; continue; }
    if (c === ",") { row.push(field); field = ""; continue; }
    if (c === "\n") { row.push(field); rows.push(row); row = []; field = ""; continue; }
    if (c === "\r") continue;
    field += c;
  }
  if (field.length > 0 || row.length > 0) { row.push(field); rows.push(row); }
  return rows.filter((r) => r.some((cell) => cell.trim().length > 0));
}

/** Accent/space-insensitive key for dedup + a header matcher. */
export function normalizeKey(value: string | null | undefined): string {
  return String(value ?? "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9 ]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** First token = first name, remainder = last name (best-effort for 2-part LatAm surnames). */
export function splitName(full: string): { first_name: string; last_name: string } | null {
  const cleaned = full.replace(/\s+/g, " ").trim();
  if (!cleaned) return null;
  const parts = cleaned.split(" ");
  if (parts.length === 1) return { first_name: parts[0], last_name: parts[0] };
  return { first_name: parts[0], last_name: parts.slice(1).join(" ") };
}

/** Rows that are obviously not a person (headers/section labels/spreadsheet errors). */
export function isJunkName(full: string): boolean {
  const k = normalizeKey(full);
  if (!k || k.length < 3) return true;
  if (k.includes("value")) return true; // #VALUE!
  return /^(terminated drive|active drive|driver dummy|safety|test driver|seed|na|n a|none|unknown)/.test(k);
}

/** Format only if (year,month,day) is a REAL calendar date — rejects 2021-02-30, 31/04, 29/02 non-leap, etc.
 * (Postgres would 22008 on ::date; returning null instead keeps the driver importable with no hire date.) */
function realIsoDate(year: number, month: number, day: number): string | null {
  if (!Number.isFinite(year) || month < 1 || month > 12 || day < 1 || day > 31) return null;
  const dt = new Date(Date.UTC(year, month - 1, day));
  if (dt.getUTCFullYear() !== year || dt.getUTCMonth() + 1 !== month || dt.getUTCDate() !== day) return null;
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

/** Normalize a master-list date to ISO YYYY-MM-DD. Handles ISO, "YYYY-MM-DD 00:00", and DD/MM/YYYY (file locale). */
export function normalizeImportDate(raw: string | null | undefined): string | null {
  const s = String(raw ?? "").trim();
  if (!s || /^none$/i.test(s)) return null;
  const iso = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (iso) return realIsoDate(Number(iso[1]), Number(iso[2]), Number(iso[3]));
  const slash = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})/);
  if (slash) {
    const [, a, b, y] = slash;
    // file locale is DD/MM/YYYY; if the first field can't be a day-of-month it's ambiguous → tolerate MM/DD
    let day = Number(a), month = Number(b);
    if (month > 12 && day <= 12) { const t = day; day = month; month = t; }
    const year = y.length === 2 ? 2000 + Number(y) : Number(y);
    return realIsoDate(year, month, day);
  }
  return null;
}

/** Keep digits; return null if no usable number. */
export function normalizePhone(...candidates: Array<string | null | undefined>): string | null {
  for (const c of candidates) {
    const digits = String(c ?? "").replace(/\D/g, "");
    if (digits.length >= 7 && !/^0+$/.test(digits)) return digits;
  }
  return null;
}

type RawRecord = Record<string, string>;

/** Map the parsed CSV (header + rows) into normalized records keyed by canonical column. */
export function mapCsvToRecords(grid: string[][]): { header: string[]; records: RawRecord[] } {
  if (grid.length === 0) return { header: [], records: [] };
  // header = the first row that contains a "name" column (skips spreadsheet preambles)
  let headerIdx = 0;
  for (let i = 0; i < Math.min(grid.length, 8); i += 1) {
    if (grid[i].some((c) => normalizeKey(c) === "name" || normalizeKey(c) === "driver")) { headerIdx = i; break; }
  }
  const header = grid[headerIdx].map((h) => normalizeKey(h));
  const records: RawRecord[] = [];
  for (let i = headerIdx + 1; i < grid.length; i += 1) {
    const rec: RawRecord = {};
    header.forEach((h, col) => { if (h) rec[h] = (grid[i][col] ?? "").trim(); });
    rec.__row = String(i + 1);
    records.push(rec);
  }
  return { header, records };
}

function pick(rec: RawRecord, ...keys: string[]): string {
  for (const k of keys) if (rec[k]) return rec[k];
  return "";
}

/**
 * Classify every record against the existing roster + each other.
 * existingKeys = normalized "first last" names already in mdata.drivers for the entity.
 */
export function classifyImportRows(records: RawRecord[], existingKeys: Set<string>): MappedDriverRow[] {
  const seenInFile = new Set<string>();
  const out: MappedDriverRow[] = [];
  for (const rec of records) {
    const rowNumber = Number(rec.__row ?? 0);
    const nameRaw = pick(rec, "name", "driver");
    if (!nameRaw || isJunkName(nameRaw)) {
      out.push({ rowNumber, first_name: "", last_name: "", phone: "", phoneMissing: true, hire_date: null, termination_date: null, cdl_number: null, status: "Active", klass: "invalid", reason: "no usable name" });
      continue;
    }
    const split = splitName(nameRaw);
    if (!split) { out.push({ rowNumber, first_name: "", last_name: "", phone: "", phoneMissing: true, hire_date: null, termination_date: null, cdl_number: null, status: "Active", klass: "invalid", reason: "name parse" }); continue; }
    const nameKey = normalizeKey(`${split.first_name} ${split.last_name}`);
    const hire = normalizeImportDate(pick(rec, "hire date", "hired"));
    const term = normalizeImportDate(pick(rec, "termination date"));
    const phone = normalizePhone(pick(rec, "cell phone", "cellphone"), pick(rec, "telephone", "phone"));
    const cdl = pick(rec, "license", "cdl", "cdl number") || null;
    const status: "Active" | "Terminated" = term ? "Terminated" : "Active";

    let klass: ImportRowClass;
    let reason: string | undefined;
    if (existingKeys.has(nameKey)) { klass = "dup_existing"; reason = "already in roster"; }
    else if (seenInFile.has(nameKey)) { klass = "dup_in_file"; reason = "duplicate row in file"; }
    else { klass = "will_create"; seenInFile.add(nameKey); }

    out.push({
      rowNumber,
      first_name: split.first_name,
      last_name: split.last_name,
      phone: phone ?? PHONE_PLACEHOLDER,
      phoneMissing: phone == null,
      hire_date: hire,
      termination_date: term,
      cdl_number: cdl,
      status,
      klass,
      reason,
    });
  }
  return out;
}

export function summarize(rows: MappedDriverRow[]) {
  const by = (k: ImportRowClass) => rows.filter((r) => r.klass === k).length;
  return {
    total: rows.length,
    will_create: by("will_create"),
    dup_existing: by("dup_existing"),
    dup_in_file: by("dup_in_file"),
    invalid: by("invalid"),
    will_create_no_phone: rows.filter((r) => r.klass === "will_create" && r.phoneMissing).length,
  };
}

function authed(req: FastifyRequest, reply: FastifyReply) {
  if (!requireAuth(req, reply)) return null;
  return req.user as { uuid: string; role: string };
}

const IMPORT_CAP = 1000;

export async function registerDriversImportRoutes(app: FastifyInstance) {
  app.post("/api/v1/mdata/drivers/import", async (req, reply) => {
    const user = authed(req, reply);
    if (!user) return;
    if (!["Owner", "Administrator"].includes(user.role)) return reply.code(403).send({ error: "forbidden" });

    const file = await req.file();
    if (!file) return reply.code(400).send({ error: "csv_file_required" });
    const fields = Object.fromEntries(
      Object.entries(file.fields).map(([k, v]) => {
        const fv = Array.isArray(v) ? (v[0] as { value?: unknown } | undefined)?.value : (v as { value?: unknown } | undefined)?.value;
        return [k, String(fv ?? "")];
      })
    );
    const parsed = z.object({
      operating_company_id: z.string().uuid().optional(),
      mode: z.enum(["preview", "commit"]).default("preview"),
    }).safeParse(fields);
    if (!parsed.success) return reply.code(400).send({ error: "validation_error", details: parsed.error.flatten() });

    const text = (await file.toBuffer()).toString("utf-8");
    const { records } = mapCsvToRecords(parseCsvText(text));
    if (records.length === 0) return reply.code(400).send({ error: "csv_no_rows" });

    const result = await withCurrentUser(user.uuid, async (client) => {
      const operatingCompanyId = await resolveOperatingCompanyId(client, user.uuid, parsed.data.operating_company_id);
      if (!operatingCompanyId) return { error: "operating_company_id_unresolved" as const };
      await client.query(`SELECT set_config('app.operating_company_id', $1::text, true)`, [operatingCompanyId]);

      const existing = await client.query(
        `SELECT first_name, last_name FROM mdata.drivers WHERE operating_company_id = $1::uuid`,
        [operatingCompanyId]
      );
      const existingKeys = new Set(
        (existing.rows as Array<{ first_name: string; last_name: string }>).map((r) => normalizeKey(`${r.first_name} ${r.last_name}`))
      );

      const rows = classifyImportRows(records, existingKeys);
      const summary = summarize(rows);
      const toCreate = rows.filter((r) => r.klass === "will_create");

      if (parsed.data.mode === "preview") {
        return {
          mode: "preview" as const,
          operating_company_id: operatingCompanyId,
          summary,
          sample: rows.slice(0, 50),
        };
      }

      if (toCreate.length > IMPORT_CAP) {
        return { error: "import_cap_exceeded" as const, cap: IMPORT_CAP, attempted: toCreate.length };
      }

      let created = 0;
      // Per-row SAVEPOINT isolation: a single bad row (e.g. an out-of-range date that slipped past
      // validation, or a constraint hit) rolls back ONLY that row, never the whole batch.
      let rowErrors = 0;
      for (const r of toCreate) {
        const note = r.phoneMissing ? "Imported from Driver Master Contacts List (phone missing in source)" : "Imported from Driver Master Contacts List";
        await client.query("SAVEPOINT drv_import_row");
        try {
          const ins = await client.query(
            `INSERT INTO mdata.drivers
               (first_name, last_name, phone, cdl_number, hire_date, termination_date, status, notes, operating_company_id, created_by_user_id, updated_by_user_id)
             VALUES ($1,$2,$3,$4,$5::date,$6::date,$7::mdata.driver_status,$8,$9::uuid,$10,$10)
             RETURNING id`,
            [r.first_name, r.last_name, r.phone, r.cdl_number, r.hire_date, r.termination_date, r.status, note, operatingCompanyId, user.uuid]
          );
          await client.query("RELEASE SAVEPOINT drv_import_row");
          if ((ins.rows as unknown[]).length > 0) created += 1;
        } catch {
          await client.query("ROLLBACK TO SAVEPOINT drv_import_row");
          rowErrors += 1;
        }
      }

      await appendCrudAudit(client, user.uuid, "mdata.drivers.bulk_imported", {
        operating_company_id: operatingCompanyId,
        created,
        row_errors: rowErrors,
        summary,
        source: "driver_master_contacts_csv",
      });

      return { mode: "commit" as const, operating_company_id: operatingCompanyId, summary, created, row_errors: rowErrors };
    });

    if (result && "error" in result) {
      const status = result.error === "import_cap_exceeded" ? 422 : 400;
      return reply.code(status).send(result);
    }
    return result;
  });
}
