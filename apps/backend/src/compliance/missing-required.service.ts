import type { PoolClient } from "pg";

// DOC-REQ-2b — read-only "Missing required documents" resolver. For an entity, cross the active required
// document types (compliance.required_document_types) with actual presence in the operative store for each
// code, and report what's missing + the worst enforcement. Column-verified against schema (2026-07-02).
//
// HONESTY RULES (a compliance chip that lies is worse than none — and a false-GREEN is worse than a
// false-red):
//   • Auto-resolve ONLY codes with an unambiguous presence signal (a dedicated structured store, or a
//     dedicated docs.files category). These are the 14 codes below.
//   • The 4 codes that share the coarse docs.files 'legal_doc' category (customer msa/noa/credit_app,
//     vendor agreement) CANNOT be told apart by category — one legal_doc upload would false-green all of
//     them. So they are NOT auto-satisfied here; they surface as satisfied=false with needs_manual=true
//     (an owner decision: add finer doc-typing before these can auto-resolve). Never false-green.
//   • w9 (driver): satisfied by a W-8BEN record OR a tax_form doc (foreign-vs-domestic switch has no schema
//     field — requiring EITHER is honest without guessing the switch).

export type RequiredDocResult = {
  code: string;
  label: string;
  enforcement: "warn" | "hard_block";
  authority: string | null;
  satisfied: boolean;
  needs_manual: boolean; // true = cannot be auto-verified yet (owner doc-typing decision), shown as missing
};

export type MissingRequiredSummary = {
  entity_kind: string;
  entity_id: string;
  required: RequiredDocResult[];
  missing_count: number;
  worst_enforcement: "none" | "warn" | "hard_block";
};

type CatalogRow = { code: string; label: string; enforcement: "warn" | "hard_block"; authority: string | null };

// Per entity kind: one query returning a boolean presence flag per code. Codes not returned here (the
// legal_doc-ambiguous set) are handled as needs_manual below.
const PRESENCE_SQL: Record<string, string> = {
  driver: `
    SELECT
      (d.cdl_number IS NOT NULL AND (d.cdl_expires_at IS NULL OR d.cdl_expires_at >= current_date)) AS cdl,
      EXISTS (SELECT 1 FROM safety.medical_cards mc
              WHERE mc.driver_id = d.id AND mc.operating_company_id = $2::uuid
                AND mc.voided_at IS NULL AND mc.expiry_date >= current_date) AS med_cert,
      EXISTS (SELECT 1 FROM safety.clearinghouse_query cq
              WHERE cq.driver_id = d.id AND cq.operating_company_id = $2::uuid
                AND cq.voided_at IS NULL AND cq.query_status = 'clear'
                AND (cq.expires_at IS NULL OR cq.expires_at >= current_date)) AS clearinghouse,
      EXISTS (SELECT 1 FROM safety.driver_documents dd
              WHERE dd.driver_id = d.id AND dd.operating_company_id = $2::uuid
                AND dd.doc_type = 'mvr' AND dd.voided_at IS NULL
                AND (dd.expiry_date IS NULL OR dd.expiry_date >= current_date)) AS mvr,
      EXISTS (SELECT 1 FROM safety.driver_documents dd
              WHERE dd.driver_id = d.id AND dd.operating_company_id = $2::uuid
                AND dd.doc_type = 'driver_application' AND dd.voided_at IS NULL) AS driver_application,
      (EXISTS (SELECT 1 FROM safety.driver_w8ben w
               WHERE w.driver_id = d.id AND w.operating_company_id = $2::uuid AND w.voided_at IS NULL
                 AND (w.irs_expiration_date IS NULL OR w.irs_expiration_date >= current_date))
       OR EXISTS (SELECT 1 FROM docs.file_links fl JOIN docs.files f ON f.id = fl.file_id
                  JOIN catalogs.file_categories c ON c.id = f.category_id
                  WHERE fl.entity_type = 'driver' AND fl.entity_id = d.id AND fl.deleted_at IS NULL
                    AND f.operating_company_id = $2::uuid AND f.deleted_at IS NULL
                    AND f.upload_completed_at IS NOT NULL AND c.code = 'tax_form')) AS w9
    FROM mdata.drivers d
    WHERE d.id = $1::uuid
      AND (
        d.operating_company_id = $2::uuid
        OR EXISTS (
          SELECT 1
          FROM mdata.driver_company_authorizations missing_required_dca
          WHERE missing_required_dca.driver_id = d.id
            AND missing_required_dca.company_id = $2::uuid
            AND missing_required_dca.is_authorized = true
            AND missing_required_dca.deactivated_at IS NULL
        )
      )
  `,
  unit: `
    SELECT
      (u.irp_expiration IS NOT NULL AND u.irp_expiration >= current_date) AS registration,
      EXISTS (SELECT 1 FROM maintenance.inspections i
              WHERE i.unit_id = u.id AND i.operating_company_id = $2::uuid
                AND i.inspection_type = 'annual_dot' AND i.status = 'completed' AND i.outcome = 'pass'
                AND i.archived_at IS NULL AND i.inspection_date >= (current_date - INTERVAL '1 year')) AS annual_inspection,
      EXISTS (SELECT 1 FROM safety.permits pm
              WHERE pm.unit_id = u.id AND pm.operating_company_id = $2::uuid
                AND pm.permit_type = 'ifta_sticker' AND pm.archived_at IS NULL
                AND (pm.expiry_date IS NULL OR pm.expiry_date >= current_date)) AS ifta,
      EXISTS (SELECT 1 FROM compliance.form_2290_filing_vehicles fv
              JOIN compliance.form_2290_filings ff ON ff.id = fv.filing_id
              WHERE fv.vehicle_id = u.id AND fv.operating_company_id = $2::uuid
                AND ff.filing_status = 'accepted'
                AND ff.tax_period_start <= current_date AND ff.tax_period_end >= current_date) AS form_2290,
      EXISTS (SELECT 1 FROM mdata.assets a
              JOIN insurance.policy_unit pu ON pu.asset_id = a.id AND pu.removed_at IS NULL
              JOIN insurance.policy p ON p.id = pu.policy_id AND p.tenant_id = pu.tenant_id
                AND p.status = 'active' AND p.effective_date <= current_date AND p.expiry_date >= current_date
              WHERE a.tenant_id = $2::uuid AND a.unit_code = u.unit_number) AS insurance
    FROM mdata.units u WHERE u.id = $1::uuid
      AND COALESCE(u.currently_leased_to_company_id, u.owner_company_id) = $2::uuid
    -- NOTE: mdata.units has NO operating_company_id (it uses owner_company_id / currently_leased_to_company_id);
    -- unit visibility is RLS-scoped, and every subquery above scopes its own table by $2 (opco/tenant).
    -- ENTITY PREDICATE (CLS-JOIN-ENTITY-UNSCOPED) added on the outer unit row itself, matching the
    -- lease-pair predicate already used by every subquery above.
  `,
  customer: `
    SELECT
      EXISTS (SELECT 1 FROM docs.file_links fl JOIN docs.files f ON f.id = fl.file_id
              JOIN catalogs.file_categories c ON c.id = f.category_id
              WHERE fl.entity_type = 'customer' AND fl.entity_id = $1::uuid AND fl.deleted_at IS NULL
                AND f.operating_company_id = $2::uuid AND f.deleted_at IS NULL
                AND f.upload_completed_at IS NOT NULL AND c.code = 'tax_form') AS w9
  `,
  vendor: `
    SELECT
      EXISTS (SELECT 1 FROM docs.file_links fl JOIN docs.files f ON f.id = fl.file_id
              JOIN catalogs.file_categories c ON c.id = f.category_id
              WHERE fl.entity_type = 'vendor' AND fl.entity_id = $1::uuid AND fl.deleted_at IS NULL
                AND f.operating_company_id = $2::uuid AND f.deleted_at IS NULL
                AND f.upload_completed_at IS NOT NULL AND c.code = 'tax_form') AS w9,
      EXISTS (SELECT 1 FROM docs.file_links fl JOIN docs.files f ON f.id = fl.file_id
              JOIN catalogs.file_categories c ON c.id = f.category_id
              WHERE fl.entity_type = 'vendor' AND fl.entity_id = $1::uuid AND fl.deleted_at IS NULL
                AND f.operating_company_id = $2::uuid AND f.deleted_at IS NULL
                AND f.upload_completed_at IS NOT NULL AND c.code = 'insurance_policy'
                AND (f.expiration_date IS NULL OR f.expiration_date >= current_date)) AS coi
  `,
};

// Codes that share the coarse legal_doc category and can't be auto-verified without finer doc-typing.
// Never auto-green; surface as needs_manual.
const NEEDS_MANUAL: Record<string, Set<string>> = {
  customer: new Set(["msa", "noa", "credit_app"]),
  vendor: new Set(["agreement"]),
  driver: new Set(),
  unit: new Set(),
};

export async function resolveMissingRequired(
  client: PoolClient,
  operatingCompanyId: string,
  entityKind: "driver" | "unit" | "customer" | "vendor",
  entityId: string,
): Promise<MissingRequiredSummary> {
  const catRes = await client.query<CatalogRow>(
    `SELECT code, label, enforcement, authority
       FROM compliance.required_document_types
      WHERE operating_company_id = $1::uuid AND entity_kind = $2 AND is_active = true
      ORDER BY sort_order, label`,
    [operatingCompanyId, entityKind],
  );

  const presenceSql = PRESENCE_SQL[entityKind];
  let presence: Record<string, boolean> = {};
  if (presenceSql) {
    const pres = await client.query<Record<string, boolean>>(presenceSql, [entityId, operatingCompanyId]);
    presence = pres.rows[0] ?? {};
  }
  const manual = NEEDS_MANUAL[entityKind] ?? new Set<string>();

  const required: RequiredDocResult[] = catRes.rows.map((r) => {
    const needsManual = manual.has(r.code);
    // satisfied only when we have an affirmative presence flag; needs_manual codes are never auto-satisfied.
    const satisfied = !needsManual && presence[r.code] === true;
    return { code: r.code, label: r.label, enforcement: r.enforcement, authority: r.authority, satisfied, needs_manual: needsManual };
  });

  const missing = required.filter((r) => !r.satisfied);
  const worst: MissingRequiredSummary["worst_enforcement"] = missing.some((m) => m.enforcement === "hard_block")
    ? "hard_block"
    : missing.length > 0
      ? "warn"
      : "none";

  return { entity_kind: entityKind, entity_id: entityId, required, missing_count: missing.length, worst_enforcement: worst };
}
