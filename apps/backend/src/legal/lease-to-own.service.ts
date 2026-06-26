// LEGAL-CONTRACT-CREATOR-01 — lease-to-own backend service (pure-code, behind LEGAL_CONTRACTS_ENABLED).
//
// Extends the EXISTING legal contract system (does NOT duplicate it):
//   - ensureLeaseToOwnTemplate(): seeds the canonical lease_to_own template into legal.contract_templates
//     (versioned, entity-scoped, status='active') from the verbatim prototype, if absent.
//   - listFleetUnitsForPicker(): reads mdata.units for the creator's vehicle picker, with a CONFIGURABLE
//     owner filter (default TRK, selectable) + owner label badge. No data rewrite — ownership data is
//     read as-is (TRK owns / TRANSP leases is the real arrangement, Jorge-confirmed).
//
// The saved contract itself reuses the existing createContractInstance(template_code='lease_to_own',
// filled_variables={deal fields + vehicles[]}); render/PDF/sign/audit are inherited. NO accounting.* writes.

import {
  LEASE_TO_OWN_TEMPLATE_CODE,
  LEASE_TO_OWN_DISPLAY_NAME_EN,
  LEASE_TO_OWN_DISPLAY_NAME_ES,
  LEASE_TO_OWN_CATEGORY,
  LEASE_TO_OWN_CONTENT_HTML_EN,
  LEASE_TO_OWN_CONTENT_HTML_ES,
  LEASE_TO_OWN_VARIABLE_SCHEMA,
} from "./templates/lease-to-own.template.js";
import { appendCrudAudit } from "../audit/crud-audit.js";

type QueryableClient = { query: (sql: string, params?: unknown[]) => Promise<{ rows: any[] }> };

export function leaseToOwnEnabled(): boolean {
  return (process.env.LEGAL_CONTRACTS_ENABLED ?? "false") === "true";
}

/** TRK is the default Seller / equipment owner on all lease-to-own contracts (Jorge-confirmed). */
export const DEFAULT_SELLER_COMPANY_CODE = "TRK";

/** Resolve a company's legal name + address for seller/owner auto-fill (org.companies). */
export async function getCompanyForSeller(client: QueryableClient, code: string) {
  const res = await client.query(
    `SELECT id::text, code, legal_name, short_name, address_line1, address_line2, postal_code
       FROM org.companies WHERE code = $1 LIMIT 1`,
    [code],
  );
  return res.rows[0] ?? null;
}

/**
 * Seed the canonical lease_to_own template (status='active', version 1) for the entity if no active one
 * exists. Idempotent: returns the existing active template when present. Mirrors the 0126 template columns.
 */
export async function ensureLeaseToOwnTemplate(
  client: QueryableClient,
  operatingCompanyId: string,
  actorUserId: string,
): Promise<{ id: string; version: number; seeded: boolean }> {
  const existing = await client.query(
    `SELECT id::text, version FROM legal.contract_templates
      WHERE operating_company_id = $1 AND template_code = $2 AND status = 'active'
      ORDER BY version DESC LIMIT 1`,
    [operatingCompanyId, LEASE_TO_OWN_TEMPLATE_CODE],
  );
  if (existing.rows[0]) return { id: existing.rows[0].id, version: existing.rows[0].version, seeded: false };

  const ins = await client.query(
    `INSERT INTO legal.contract_templates (
        operating_company_id, template_code, version,
        display_name_en, display_name_es, category,
        content_html_en, content_html_es, variable_schema,
        requires_witness, status, created_by_user_id, updated_by_user_id
     ) VALUES ($1,$2,1,$3,$4,$5,$6,$7,$8::jsonb,true,'active',$9,$9)
     ON CONFLICT (operating_company_id, template_code, version) DO NOTHING
     RETURNING id::text, version`,
    [
      operatingCompanyId, LEASE_TO_OWN_TEMPLATE_CODE,
      LEASE_TO_OWN_DISPLAY_NAME_EN, LEASE_TO_OWN_DISPLAY_NAME_ES, LEASE_TO_OWN_CATEGORY,
      LEASE_TO_OWN_CONTENT_HTML_EN, LEASE_TO_OWN_CONTENT_HTML_ES, JSON.stringify(LEASE_TO_OWN_VARIABLE_SCHEMA),
      actorUserId,
    ],
  );
  if (ins.rows[0]) {
    // Ch.11 DIP audit completeness: a template seed is an auditable event (audit.append_event).
    await appendCrudAudit(client, actorUserId, "legal.lease_to_own_template.seeded", {
      template_id: ins.rows[0].id,
      version: ins.rows[0].version,
      operating_company_id: operatingCompanyId,
      template_code: LEASE_TO_OWN_TEMPLATE_CODE,
    });
    return { id: ins.rows[0].id, version: ins.rows[0].version, seeded: true };
  }

  // lost a race / a draft v1 already existed — re-read the active one.
  const reread = await client.query(
    `SELECT id::text, version FROM legal.contract_templates
      WHERE operating_company_id = $1 AND template_code = $2 AND status = 'active'
      ORDER BY version DESC LIMIT 1`,
    [operatingCompanyId, LEASE_TO_OWN_TEMPLATE_CODE],
  );
  if (reread.rows[0]) return { id: reread.rows[0].id, version: reread.rows[0].version, seeded: false };
  throw new Error("lease_to_own_template_seed_failed");
}

export type FleetPickerUnit = {
  id: string;
  unit_number: string;
  vin: string;
  make: string | null;
  model: string | null;
  year: number | null;
  status: string;
  unit_type: string | null;
  owner_company_id: string | null;
  owner_label: string | null;
  currently_leased_to_company_id: string | null;
};

/**
 * Fleet for the vehicle picker. owner-filter is CONFIGURABLE (param) — default TRK, selectable; when null,
 * returns all owned units with an owner badge (no data rewrite). Excludes sold/totaled/disposed/deactivated.
 * unit_type is returned so the UI can exclude trailers/non-commercial. Reads ownership as-is.
 */
export async function listFleetUnitsForPicker(
  client: QueryableClient,
  args: { ownerCompanyId?: string | null },
): Promise<FleetPickerUnit[]> {
  const params: unknown[] = [];
  let ownerFilter = "";
  if (args.ownerCompanyId) {
    params.push(args.ownerCompanyId);
    ownerFilter = `AND u.owner_company_id = $${params.length}`;
  }
  const res = await client.query(
    `SELECT u.id::text, u.unit_number, u.vin, u.make, u.model, u.year,
            u.status::text AS status, u.unit_type,
            u.owner_company_id::text AS owner_company_id,
            COALESCE(oc.short_name, oc.legal_name) AS owner_label,
            u.currently_leased_to_company_id::text AS currently_leased_to_company_id
       FROM mdata.units u
       LEFT JOIN org.companies oc ON oc.id = u.owner_company_id
      WHERE u.deactivated_at IS NULL
        AND u.disposed_date IS NULL
        AND u.status NOT IN ('Sold','Totaled')
        ${ownerFilter}
      ORDER BY u.unit_number`,
    params,
  );
  return res.rows as FleetPickerUnit[];
}
