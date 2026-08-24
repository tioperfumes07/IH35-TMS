// Business-Property Allocation — TX business personal-property tax RENDITION service (filing side).
// Source of record for the rendition workflow (draft → filed → appealed → settled). Reads/writes the
// compliance.property_tax_* tables (migration 202607080300). Money-free: the accrual/payment GL posting
// lives in accounting/property-tax-posting/poster.service.ts behind PROPERTY_TAX_GL_POSTING_ENABLED.
//
// CONNECTIVITY: a rendition links entity → appraisal district (county) → taxable assets (mdata.units
// tractors + mdata.equipment trailers) via the basis lines; the assessed tax feeds the accrual poster.

import { appendCrudAudit } from "../../audit/crud-audit.js";

type DbClient = {
  query: <T = Record<string, unknown>>(sql: string, values?: unknown[]) => Promise<{ rows: T[] }>;
};

export type RenditionStatus = "draft" | "filed" | "appealed" | "settled";
export type ValueBasis = "historical_cost" | "market_value" | "depreciated_cost";

export type AppraisalDistrict = {
  id: string;
  state: string;
  county: string;
  cad_name: string;
  is_active: boolean;
};

export type RenditionLine = {
  id: string;
  rendition_id: string;
  unit_id: string | null;
  equipment_id: string | null;
  fixed_asset_id: string | null;
  asset_description: string;
  asset_category: string | null;
  acquisition_date: string | null;
  acquisition_cost_cents: number | null;
  rendered_value_cents: number;
};

export type Rendition = {
  id: string;
  operating_company_id: string;
  tax_year: number;
  appraisal_district_id: string;
  cad_name: string;
  county: string;
  status: RenditionStatus;
  value_basis: ValueBasis;
  due_date: string;
  extension_requested: boolean;
  extended_due_date: string | null;
  effective_due_date: string;
  cad_account_number: string | null;
  total_rendered_value_cents: number;
  assessed_tax_cents: number | null;
  filed_at: string | null;
  notes: string | null;
};

export type CandidateAsset = {
  kind: "unit" | "equipment";
  id: string;
  label: string;
  vin: string | null;
  acquired_date: string | null;
};

/**
 * The next TX business personal-property rendition deadline. Statutory: April 15 of the tax year (Tax Code
 * §22.23), extendable in writing to May 15. On/before April 15 → this year's; after → next year's. This is
 * a REAL regulatory calendar (not invented) — mirrors the IFTA/2290 deadline generators.
 */
export function upcomingPropertyTaxRenditionDeadline(now: Date = new Date()): { deadline: string; taxYear: number } {
  const year = now.getUTCFullYear();
  const april15 = Date.parse(`${year}-04-15T23:59:59.999Z`);
  if (now.getTime() <= april15) return { deadline: `${year}-04-15`, taxYear: year };
  return { deadline: `${year + 1}-04-15`, taxYear: year + 1 };
}

/** The statutory rendition due date for a given tax year (April 15). */
export function renditionDueDate(taxYear: number): string {
  return `${taxYear}-04-15`;
}

export async function listAppraisalDistricts(client: DbClient): Promise<AppraisalDistrict[]> {
  const res = await client.query<AppraisalDistrict>(
    `SELECT id::text, state, county, cad_name, is_active
     FROM compliance.appraisal_districts
     WHERE is_active
     ORDER BY state, county`
  );
  return res.rows;
}

export async function createAppraisalDistrict(
  client: DbClient,
  actorUserId: string,
  input: { state?: string; county: string; cad_name: string }
): Promise<AppraisalDistrict> {
  const res = await client.query<AppraisalDistrict>(
    `INSERT INTO compliance.appraisal_districts (state, county, cad_name)
     VALUES ($1, $2, $3)
     ON CONFLICT (state, county, cad_name) DO UPDATE SET updated_at = now()
     RETURNING id::text, state, county, cad_name, is_active`,
    [input.state ?? "TX", input.county, input.cad_name]
  );
  const district = res.rows[0];
  await appendCrudAudit(client as Parameters<typeof appendCrudAudit>[0], actorUserId, "compliance.property_tax_appraisal_district.created", {
    entityId: district.id,
    state: district.state,
    county: district.county,
    cad_name: district.cad_name,
  });
  return district;
}

const RENDITION_SELECT = `
  SELECT r.id::text, r.operating_company_id::text, r.tax_year, r.appraisal_district_id::text,
         d.cad_name, d.county,
         r.status, r.value_basis, r.due_date::text, r.extension_requested, r.extended_due_date::text,
         COALESCE(r.extended_due_date, r.due_date)::text AS effective_due_date,
         r.cad_account_number, r.total_rendered_value_cents, r.assessed_tax_cents,
         r.filed_at::text, r.notes
  FROM compliance.property_tax_renditions r
  JOIN compliance.appraisal_districts d ON d.id = r.appraisal_district_id
`;

export async function listRenditions(client: DbClient, operatingCompanyId: string, unitId?: string): Promise<Rendition[]> {
  const res = await client.query<Rendition>(
    `${RENDITION_SELECT}
     WHERE r.operating_company_id = $1::uuid AND r.is_active
       AND ($2::uuid IS NULL OR EXISTS (
         SELECT 1
         FROM compliance.property_tax_rendition_lines l
         WHERE l.rendition_id = r.id AND l.operating_company_id = r.operating_company_id
           AND l.unit_id = $2::uuid AND l.is_active
       ))
     ORDER BY r.tax_year DESC, d.county`,
    [operatingCompanyId, unitId ?? null]
  );
  return res.rows.map(normalizeRendition);
}

export async function getRendition(
  client: DbClient,
  operatingCompanyId: string,
  renditionId: string
): Promise<{ rendition: Rendition; lines: RenditionLine[] } | null> {
  const res = await client.query<Rendition>(
    `${RENDITION_SELECT} WHERE r.operating_company_id = $1::uuid AND r.id = $2::uuid AND r.is_active LIMIT 1`,
    [operatingCompanyId, renditionId]
  );
  if (!res.rows[0]) return null;
  const linesRes = await client.query<RenditionLine>(
    `SELECT id::text, rendition_id::text, unit_id::text, equipment_id::text, fixed_asset_id::text,
            asset_description, asset_category, acquisition_date::text, acquisition_cost_cents, rendered_value_cents
     FROM compliance.property_tax_rendition_lines
     WHERE rendition_id = $1::uuid AND is_active
     ORDER BY created_at`,
    [renditionId]
  );
  return {
    rendition: normalizeRendition(res.rows[0]),
    lines: linesRes.rows.map((l) => ({
      ...l,
      acquisition_cost_cents: l.acquisition_cost_cents == null ? null : Number(l.acquisition_cost_cents),
      rendered_value_cents: Number(l.rendered_value_cents),
    })),
  };
}

function normalizeRendition(r: Rendition): Rendition {
  return {
    ...r,
    total_rendered_value_cents: Number(r.total_rendered_value_cents),
    assessed_tax_cents: r.assessed_tax_cents == null ? null : Number(r.assessed_tax_cents),
  };
}

export async function createRendition(
  client: DbClient,
  operatingCompanyId: string,
  actorUserId: string,
  input: { tax_year: number; appraisal_district_id: string; value_basis?: ValueBasis; cad_account_number?: string | null; notes?: string | null }
): Promise<Rendition> {
  const res = await client.query<{ id: string }>(
    `INSERT INTO compliance.property_tax_renditions (
       operating_company_id, tax_year, appraisal_district_id, value_basis, due_date,
       cad_account_number, notes, created_by_user_id, updated_by_user_id
     )
     VALUES ($1::uuid, $2, $3::uuid, $4, $5::date, $6, $7, $8::uuid, $8::uuid)
     RETURNING id::text`,
    [
      operatingCompanyId,
      input.tax_year,
      input.appraisal_district_id,
      input.value_basis ?? "depreciated_cost",
      renditionDueDate(input.tax_year),
      input.cad_account_number ?? null,
      input.notes ?? null,
      actorUserId,
    ]
  );
  const got = await getRendition(client, operatingCompanyId, res.rows[0].id);
  if (!got) throw new Error("rendition_create_failed");
  await appendCrudAudit(client as Parameters<typeof appendCrudAudit>[0], actorUserId, "compliance.property_tax_rendition.created", {
    entityId: got.rendition.id,
    operatingCompanyId,
    tax_year: got.rendition.tax_year,
    appraisal_district_id: got.rendition.appraisal_district_id,
  });
  return got.rendition;
}

export async function updateRendition(
  client: DbClient,
  operatingCompanyId: string,
  actorUserId: string,
  renditionId: string,
  patch: {
    status?: RenditionStatus;
    value_basis?: ValueBasis;
    extension_requested?: boolean;
    extended_due_date?: string | null;
    cad_account_number?: string | null;
    assessed_tax_cents?: number | null;
    notes?: string | null;
  }
): Promise<Rendition | null> {
  const sets: string[] = [];
  const vals: unknown[] = [];
  let i = 1;
  const push = (col: string, val: unknown, cast = "") => {
    sets.push(`${col} = $${i}${cast}`);
    vals.push(val);
    i += 1;
  };
  if (patch.status !== undefined) push("status", patch.status);
  if (patch.value_basis !== undefined) push("value_basis", patch.value_basis);
  if (patch.extension_requested !== undefined) push("extension_requested", patch.extension_requested);
  if (patch.extended_due_date !== undefined) push("extended_due_date", patch.extended_due_date, "::date");
  if (patch.cad_account_number !== undefined) push("cad_account_number", patch.cad_account_number);
  if (patch.assessed_tax_cents !== undefined) push("assessed_tax_cents", patch.assessed_tax_cents);
  if (patch.notes !== undefined) push("notes", patch.notes);
  // Mark filed_at when status transitions to filed.
  if (patch.status === "filed") {
    sets.push(`filed_at = COALESCE(filed_at, now())`);
    sets.push(`filed_by_user_id = COALESCE(filed_by_user_id, $${i}::uuid)`);
    vals.push(actorUserId);
    i += 1;
  }
  sets.push(`updated_by_user_id = $${i}::uuid`);
  vals.push(actorUserId);
  i += 1;
  sets.push(`updated_at = now()`);

  vals.push(operatingCompanyId);
  vals.push(renditionId);
  await client.query(
    `UPDATE compliance.property_tax_renditions SET ${sets.join(", ")}
     WHERE operating_company_id = $${i}::uuid AND id = $${i + 1}::uuid AND is_active`,
    vals
  );
  const got = await getRendition(client, operatingCompanyId, renditionId);
  if (got) {
    await appendCrudAudit(client as Parameters<typeof appendCrudAudit>[0], actorUserId, "compliance.property_tax_rendition.updated", {
      entityId: renditionId,
      operatingCompanyId,
      changed: Object.keys(patch).filter((k) => (patch as Record<string, unknown>)[k] !== undefined),
      status: got.rendition.status,
    });
  }
  return got?.rendition ?? null;
}

export async function addRenditionLine(
  client: DbClient,
  operatingCompanyId: string,
  actorUserId: string,
  renditionId: string,
  line: {
    unit_id?: string | null;
    equipment_id?: string | null;
    fixed_asset_id?: string | null;
    asset_description: string;
    asset_category?: string | null;
    acquisition_date?: string | null;
    acquisition_cost_cents?: number | null;
    rendered_value_cents?: number;
  }
): Promise<RenditionLine> {
  const res = await client.query<{ id: string }>(
    `INSERT INTO compliance.property_tax_rendition_lines (
       operating_company_id, rendition_id, unit_id, equipment_id, fixed_asset_id,
       asset_description, asset_category, acquisition_date, acquisition_cost_cents, rendered_value_cents,
       created_by_user_id
     )
     VALUES ($1::uuid, $2::uuid, $3::uuid, $4::uuid, $5::uuid, $6, $7, $8::date, $9, $10, $11::uuid)
     RETURNING id::text`,
    [
      operatingCompanyId,
      renditionId,
      line.unit_id ?? null,
      line.equipment_id ?? null,
      line.fixed_asset_id ?? null,
      line.asset_description,
      line.asset_category ?? null,
      line.acquisition_date ?? null,
      line.acquisition_cost_cents ?? null,
      line.rendered_value_cents ?? 0,
      actorUserId,
    ]
  );
  await recomputeRenditionTotal(client, operatingCompanyId, renditionId);
  const got = await getRendition(client, operatingCompanyId, renditionId);
  const created = got?.lines.find((l) => l.id === res.rows[0].id);
  if (!created) throw new Error("rendition_line_create_failed");
  await appendCrudAudit(client as Parameters<typeof appendCrudAudit>[0], actorUserId, "compliance.property_tax_rendition_line.added", {
    entityId: created.id,
    renditionId,
    operatingCompanyId,
    asset_description: created.asset_description,
    rendered_value_cents: created.rendered_value_cents,
  });
  return created;
}

/** Roll the line rendered values up into the header total (kept in sync so the widget/aggregate reads truth). */
async function recomputeRenditionTotal(client: DbClient, operatingCompanyId: string, renditionId: string): Promise<void> {
  await client.query(
    `UPDATE compliance.property_tax_renditions r
     SET total_rendered_value_cents = COALESCE((
       SELECT SUM(rendered_value_cents) FROM compliance.property_tax_rendition_lines
       WHERE rendition_id = r.id AND is_active
     ), 0), updated_at = now()
     WHERE r.operating_company_id = $1::uuid AND r.id = $2::uuid`,
    [operatingCompanyId, renditionId]
  );
}

/**
 * Candidate taxable assets for the rendering entity — the fleet it OPERATES, owned OR leased
 * (COALESCE(currently_leased_to_company_id, owner_company_id), COMP-F6310). Tractors (mdata.units) +
 * trailers (mdata.equipment). Powers "listing the taxable business personal property" and the inline
 * "+ add asset line" picker. Connectivity: rendition ← assets.
 */
export async function listCandidateAssets(client: DbClient, operatingCompanyId: string): Promise<CandidateAsset[]> {
  // COMP-F6310: was `WHERE owner_company_id = $1` only — every fleet unit/trailer USMCA (and TRANSP)
  // actually runs is LEASED, not owned (TRK=owner, TRANSP/USMCA=lease per
  // config/samsara-carrier-attribution.json), so the raw owner_company_id filter matched 0 rows for
  // both tables (live-confirmed: 0 owned / 44 leased units, 0 owned / 6 leased equipment on USMCA) —
  // the "+ Create Line" asset picker had nothing to select, ever, for any leased-fleet entity. Fixed
  // to the same COALESCE(currently_leased_to_company_id, owner_company_id) predicate already
  // canonical elsewhere in this codebase (e.g. dashboard.routes.ts's severe-alerts/rm-status joins).
  const unitsRes = await client.query<{ id: string; unit_number: string; vin: string | null; make: string | null; model: string | null; year: number | null; acquired_date: string | null }>(
    `SELECT id::text, unit_number, vin, make, model, year, acquired_date::text
     FROM mdata.units
     WHERE COALESCE(currently_leased_to_company_id, owner_company_id) = $1::uuid AND deactivated_at IS NULL
     ORDER BY unit_number
     LIMIT 500`,
    [operatingCompanyId]
  );
  const equipRes = await client.query<{ id: string; equipment_number: string; vin: string | null; equipment_type: string | null; make: string | null; model: string | null; year: number | null; acquired_date: string | null }>(
    `SELECT id::text, equipment_number, vin, equipment_type, make, model, year, acquired_date::text
     FROM mdata.equipment
     WHERE COALESCE(currently_leased_to_company_id, owner_company_id) = $1::uuid AND deactivated_at IS NULL
     ORDER BY equipment_number
     LIMIT 500`,
    [operatingCompanyId]
  );
  const units: CandidateAsset[] = unitsRes.rows.map((u) => ({
    kind: "unit",
    id: u.id,
    label: `Unit ${u.unit_number}${u.year ? ` — ${u.year}` : ""} ${[u.make, u.model].filter(Boolean).join(" ")}`.trim(),
    vin: u.vin,
    acquired_date: u.acquired_date,
  }));
  const equipment: CandidateAsset[] = equipRes.rows.map((e) => ({
    kind: "equipment",
    id: e.id,
    label: `Trailer ${e.equipment_number}${e.equipment_type ? ` (${e.equipment_type})` : ""}${e.year ? ` — ${e.year}` : ""}`.trim(),
    vin: e.vin,
    acquired_date: e.acquired_date,
  }));
  return [...units, ...equipment];
}
