// Compliance & Filings aggregator — read-only cross-module "view all pending" rollup.
//
// OWNER DECISION (2026-07-05, memory `compliance-taxes-permits-module-org`): each regulatory program
// (IFTA, Form 2290/HVUT, state permits, IRP, driver compliance, business-property tax) STAYS in its own
// module — this file never mutates anything and never becomes the source of record. It only reads the
// real tables each program already owns and normalizes them into one list with a drill-through link back
// to that program's home page. Where a program genuinely has no filing/tracking built yet (business
// property tax rendition), we surface an honest "not_yet_tracked" placeholder row rather than inventing
// a due date — see `ih35-fmcsa-compliance` skill's "never invent a cadence/due-date from memory" rule.
import { getCurrentQuarterInfo } from "../reports/shared.js";
import { buildComplianceCredentials } from "./compliance-aggregate.service.js";
import { upcomingForm2290Deadline } from "./form-2290-generator.js";
import { upcomingPropertyTaxRenditionDeadline } from "./property-tax/property-tax.service.js";
import { companyBusinessDate } from "../lib/company-business-date.js";

type DbClient = {
  query: <T = Record<string, unknown>>(sql: string, values?: unknown[]) => Promise<{ rows: T[] }>;
};

export type FilingStatus = "upcoming" | "due" | "overdue" | "not_yet_tracked";

export type FilingItem = {
  id: string;
  program: string;
  category: string;
  entity_code: string;
  detail: string;
  due_date: string | null;
  status: FilingStatus;
  drill_through: string | null;
  source: "real" | "placeholder";
};

export type FilingsDashboard = {
  items: FilingItem[];
  counts: Record<FilingStatus, number>;
  generated_at: string;
};

/** A return/renewal is "due" inside this many days; earlier than that it's just "upcoming". */
const DUE_SOON_DAYS = 14;
/** Fleet/driver credential rows are only pending-relevant within this window (mirrors the compliance
 * dashboard's own severity horizon of 30 days, widened slightly so "due" items don't fall off a cliff). */
const NEAR_TERM_WINDOW_DAYS = 60;

export function daysUntil(dateStr: string | null | undefined): number | null {
  if (!dateStr) return null;
  const d = new Date(`${String(dateStr).slice(0, 10)}T12:00:00Z`);
  if (Number.isNaN(d.getTime())) return null;
  return Math.ceil((d.getTime() - Date.now()) / 86_400_000);
}

export function statusFor(dateStr: string | null | undefined): FilingStatus {
  const days = daysUntil(dateStr);
  if (days === null) return "not_yet_tracked";
  if (days < 0) return "overdue";
  if (days <= DUE_SOON_DAYS) return "due";
  return "upcoming";
}

async function loadIftaItem(client: DbClient, operatingCompanyId: string, entityCode: string): Promise<FilingItem | null> {
  // Reuses the already-fixed (RPT-1) "next return actually due" calculator — never re-derives the IFTA
  // quarter calendar in this file (see ih35-fmcsa-compliance skill §3).
  const info = getCurrentQuarterInfo();
  const dueYear = Number(info.dueAt.slice(0, 4));
  // Q1's return is due Jan 31 of the FOLLOWING year relative to the filing quarter's own year.
  const filingYear = info.quarter === "Q1" && Number(info.dueAt.slice(5, 7)) === 1 ? dueYear - 1 : dueYear;
  const candidateQuarterStrings = [
    `${info.quarter}-${filingYear}`,
    `${filingYear}-${info.quarter}`,
    `${info.quarter} ${filingYear}`,
    `${filingYear}${info.quarter}`,
  ];

  const res = await client.query<{ status: string }>(
    `
      SELECT status
      FROM reports.ifta_filings
      WHERE operating_company_id = $1::uuid
        AND quarter = ANY($2::text[])
      ORDER BY created_at DESC
      LIMIT 1
    `,
    [operatingCompanyId, candidateQuarterStrings]
  );
  if (res.rows[0]?.status === "filed") return null;

  return {
    id: `ifta:${filingYear}-${info.quarter}`,
    program: "IFTA Quarterly Fuel Tax Return",
    category: "ifta",
    entity_code: entityCode,
    detail: `${info.quarter} ${filingYear} return`,
    due_date: info.dueAt,
    status: statusFor(info.dueAt),
    drill_through: "/reports/ifta",
    source: "real",
  };
}

async function loadForm2290Item(client: DbClient, operatingCompanyId: string, entityCode: string): Promise<FilingItem | null> {
  const res = await client.query<{ filing_status: string; tax_period_end: string }>(
    `
      SELECT filing_status, tax_period_end::text
      FROM compliance.form_2290_filings
      WHERE operating_company_id = $1::uuid
      ORDER BY tax_period_end DESC
      LIMIT 1
    `,
    [operatingCompanyId]
  );
  const latest = res.rows[0];
  const currentPeriodFiled =
    latest &&
    latest.tax_period_end >= companyBusinessDate() &&
    ["submitted", "accepted"].includes(latest.filing_status);
  if (currentPeriodFiled) return null;

  const { deadline } = upcomingForm2290Deadline();
  return {
    id: `form_2290:${deadline}`,
    program: "Form 2290 / HVUT",
    category: "form_2290",
    entity_code: entityCode,
    detail: "Annual Heavy Vehicle Use Tax filing",
    due_date: deadline,
    status: statusFor(deadline),
    drill_through: "/compliance/form-2290",
    source: "real",
  };
}

async function loadPermitItems(client: DbClient, operatingCompanyId: string, entityCode: string): Promise<FilingItem[]> {
  const res = await client.query<{ id: string; permit_type: string; permit_number: string | null; issuing_state: string | null; expiry_date: string }>(
    `
      SELECT id::text, permit_type, permit_number, issuing_state, expiry_date::text
      FROM safety.permits
      WHERE operating_company_id = $1::uuid
        AND archived_at IS NULL
        AND expiry_date IS NOT NULL
        AND expiry_date <= CURRENT_DATE + INTERVAL '180 days'
      ORDER BY expiry_date ASC
      LIMIT 50
    `,
    [operatingCompanyId]
  );
  return res.rows.map((r) => ({
    id: `permit:${r.id}`,
    program: "State Permit",
    category: "permit",
    entity_code: entityCode,
    detail: `${r.permit_type}${r.permit_number ? ` #${r.permit_number}` : ""}${r.issuing_state ? ` (${r.issuing_state})` : ""}`,
    due_date: r.expiry_date,
    status: statusFor(r.expiry_date),
    drill_through: "/safety/permits",
    source: "real" as const,
  }));
}

async function loadCredentialItems(
  client: DbClient,
  operatingCompanyId: string,
  entityCode: string,
  types: string[],
  programLabel: Record<string, string>
): Promise<FilingItem[]> {
  const rows = await buildComplianceCredentials(client, operatingCompanyId);
  return rows
    .filter((r) => types.includes(r.type) && r.days_until_expiration !== null && r.days_until_expiration <= NEAR_TERM_WINDOW_DAYS)
    .map((r) => ({
      id: `${r.type}:${r.credential_id}`,
      program: programLabel[r.type] ?? r.label,
      category: r.type,
      entity_code: entityCode,
      detail: `${r.owner_name} — ${r.label}`,
      due_date: r.expiration_date,
      status: statusFor(r.expiration_date),
      drill_through: r.action_link,
      source: "real" as const,
    }));
}

async function loadClearinghouseItems(client: DbClient, operatingCompanyId: string, entityCode: string): Promise<FilingItem[]> {
  const res = await client.query<{ driver_id: string; name: string; expires_at: string | null }>(
    `
      SELECT d.id::text AS driver_id,
             TRIM(CONCAT(COALESCE(d.first_name, ''), ' ', COALESCE(d.last_name, ''))) AS name,
             cq.expires_at::text AS expires_at
      FROM mdata.drivers d
      LEFT JOIN LATERAL (
        SELECT expires_at
        FROM safety.clearinghouse_query
        WHERE driver_id = d.id AND operating_company_id = $1::uuid
          AND voided_at IS NULL AND query_status = 'clear'
        ORDER BY queried_at DESC
        LIMIT 1
      ) cq ON true
      WHERE (
          d.operating_company_id = $1::uuid
          OR EXISTS (
            SELECT 1
            FROM mdata.driver_company_authorizations filings_clearinghouse_dca
            WHERE filings_clearinghouse_dca.driver_id = d.id
              AND filings_clearinghouse_dca.company_id = $1::uuid
              AND filings_clearinghouse_dca.is_authorized = true
              AND filings_clearinghouse_dca.deactivated_at IS NULL
          )
        )
        AND d.deactivated_at IS NULL
        AND (cq.expires_at IS NULL OR cq.expires_at <= CURRENT_DATE + INTERVAL '60 days')
      ORDER BY cq.expires_at ASC NULLS FIRST
      LIMIT 50
    `,
    [operatingCompanyId]
  );
  return res.rows.map((r) => ({
    id: `driver_clearinghouse:${r.driver_id}`,
    program: "Drug & Alcohol Clearinghouse Query",
    category: "driver_clearinghouse",
    entity_code: entityCode,
    detail: `${r.name || "Driver"} — annual query (49 CFR §382.701)`,
    due_date: r.expires_at,
    status: r.expires_at ? statusFor(r.expires_at) : "overdue",
    drill_through: `/drivers/${r.driver_id}/profile`,
    source: "real" as const,
  }));
}

async function loadMvrItems(client: DbClient, operatingCompanyId: string, entityCode: string): Promise<FilingItem[]> {
  const res = await client.query<{ driver_id: string; name: string; expiry_date: string | null }>(
    `
      SELECT d.id::text AS driver_id,
             TRIM(CONCAT(COALESCE(d.first_name, ''), ' ', COALESCE(d.last_name, ''))) AS name,
             mvr.expiry_date::text AS expiry_date
      FROM mdata.drivers d
      LEFT JOIN LATERAL (
        SELECT expiry_date
        FROM safety.driver_documents
        WHERE driver_id = d.id AND operating_company_id = $1::uuid
          AND doc_type = 'mvr' AND voided_at IS NULL
        ORDER BY created_at DESC
        LIMIT 1
      ) mvr ON true
      WHERE (
          d.operating_company_id = $1::uuid
          OR EXISTS (
            SELECT 1
            FROM mdata.driver_company_authorizations filings_mvr_dca
            WHERE filings_mvr_dca.driver_id = d.id
              AND filings_mvr_dca.company_id = $1::uuid
              AND filings_mvr_dca.is_authorized = true
              AND filings_mvr_dca.deactivated_at IS NULL
          )
        )
        AND d.deactivated_at IS NULL
        AND (mvr.expiry_date IS NULL OR mvr.expiry_date <= CURRENT_DATE + INTERVAL '60 days')
      ORDER BY mvr.expiry_date ASC NULLS FIRST
      LIMIT 50
    `,
    [operatingCompanyId]
  );
  return res.rows.map((r) => ({
    id: `driver_mvr:${r.driver_id}`,
    program: "Annual MVR Review",
    category: "driver_mvr",
    entity_code: entityCode,
    detail: `${r.name || "Driver"} — annual motor vehicle record review (49 CFR §391.25)`,
    due_date: r.expiry_date,
    status: r.expiry_date ? statusFor(r.expiry_date) : "overdue",
    drill_through: `/drivers/${r.driver_id}/profile`,
    source: "real" as const,
  }));
}

// Business-Property Allocation — TX business personal-property tax rendition (NOW BUILT, migration
// 202607080300). Surfaces every not-yet-filed rendition for the entity plus, if the current tax year has
// no rendition row yet, a statutory-deadline reminder anchored to April 15 (Tax Code §22.23 — a REAL
// regulatory calendar, not an invented date). Drill-through → the rendition screen (/compliance/property-tax).
export async function loadPropertyTaxItems(client: DbClient, operatingCompanyId: string, entityCode: string): Promise<FilingItem[]> {
  const items: FilingItem[] = [];
  const res = await client.query<{
    id: string;
    tax_year: number;
    status: string;
    effective_due_date: string;
    cad_name: string;
  }>(
    `
      SELECT r.id::text, r.tax_year, r.status,
             COALESCE(r.extended_due_date, r.due_date)::text AS effective_due_date,
             d.cad_name
      FROM compliance.property_tax_renditions r
      JOIN compliance.appraisal_districts d ON d.id = r.appraisal_district_id
      WHERE r.operating_company_id = $1::uuid
        AND r.is_active
        AND r.status IN ('draft','appealed')       -- 'filed'/'settled' are no longer pending
      ORDER BY effective_due_date ASC
      LIMIT 50
    `,
    [operatingCompanyId]
  );

  const yearsWithRow = new Set<number>();
  for (const r of res.rows) {
    yearsWithRow.add(r.tax_year);
    items.push({
      id: `property_tax:${r.id}`,
      program: "Texas Business Personal Property Tax Rendition",
      category: "business_property_tax",
      entity_code: entityCode,
      detail: `${r.cad_name} — ${r.tax_year} rendition (${r.status})`,
      due_date: r.effective_due_date,
      status: statusFor(r.effective_due_date),
      drill_through: `/compliance/property-tax/${r.id}`,
      source: "real",
    });
  }

  // If the current statutory tax year has no rendition started yet, prompt one against the April 15 deadline.
  const { deadline, taxYear } = upcomingPropertyTaxRenditionDeadline();
  if (!yearsWithRow.has(taxYear)) {
    items.push({
      id: `property_tax:${taxYear}:unstarted`,
      program: "Texas Business Personal Property Tax Rendition",
      category: "business_property_tax",
      entity_code: entityCode,
      detail: `${taxYear} rendition not yet started (Tax Code §22.23, due Apr 15)`,
      due_date: deadline,
      status: statusFor(deadline),
      drill_through: "/compliance/property-tax",
      source: "real",
    });
  }
  return items;
}

export async function buildFilingsDashboard(client: DbClient, operatingCompanyId: string): Promise<FilingsDashboard> {
  const companyRes = await client.query<{ code: string }>(
    `SELECT code FROM org.companies WHERE id = $1::uuid LIMIT 1`,
    [operatingCompanyId]
  );
  const entityCode = companyRes.rows[0]?.code ?? "";

  const [iftaItem, form2290Item, permitItems, irpItems, driverCredItems, clearinghouseItems, mvrItems, propertyTaxItems] =
    await Promise.all([
      loadIftaItem(client, operatingCompanyId, entityCode),
      loadForm2290Item(client, operatingCompanyId, entityCode),
      loadPermitItems(client, operatingCompanyId, entityCode),
      loadCredentialItems(client, operatingCompanyId, entityCode, ["irp", "irp_account"], {
        irp: "IRP Apportioned Registration",
        irp_account: "IRP Account Renewal",
      }),
      loadCredentialItems(client, operatingCompanyId, entityCode, ["cdl", "medical_card", "drug_test_cycle"], {
        cdl: "Driver CDL Renewal",
        medical_card: "Driver DOT Medical Certificate",
        drug_test_cycle: "Driver Drug Test Cycle",
      }),
      loadClearinghouseItems(client, operatingCompanyId, entityCode),
      loadMvrItems(client, operatingCompanyId, entityCode),
      loadPropertyTaxItems(client, operatingCompanyId, entityCode),
    ]);

  const items: FilingItem[] = [
    ...(iftaItem ? [iftaItem] : []),
    ...(form2290Item ? [form2290Item] : []),
    ...permitItems,
    ...irpItems,
    ...driverCredItems,
    ...clearinghouseItems,
    ...mvrItems,
    ...propertyTaxItems,
  ];

  items.sort((a, b) => {
    const da = a.due_date ? new Date(a.due_date).getTime() : Number.POSITIVE_INFINITY;
    const db = b.due_date ? new Date(b.due_date).getTime() : Number.POSITIVE_INFINITY;
    return da - db;
  });

  const counts: Record<FilingStatus, number> = { upcoming: 0, due: 0, overdue: 0, not_yet_tracked: 0 };
  for (const item of items) counts[item.status] += 1;

  return { items, counts, generated_at: new Date().toISOString() };
}
