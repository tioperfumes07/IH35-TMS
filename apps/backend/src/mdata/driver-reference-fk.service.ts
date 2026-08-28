type DbClient = {
  query: <T = Record<string, unknown>>(sql: string, values?: unknown[]) => Promise<{ rows: T[] }>;
};

export type DriverReferenceFkEnrichment = {
  license_class_code: string | null;
  license_class_label: string | null;
  driver_employment_status_code: string | null;
  driver_employment_status_label: string | null;
  medical_card_status_code: string | null;
  medical_card_status_label: string | null;
  endorsement_codes: string[];
  restriction_codes: string[];
};

export async function loadDriverReferenceFkEnrichment(
  client: DbClient,
  driverId: string,
  operatingCompanyId: string,
): Promise<DriverReferenceFkEnrichment> {
  const rowRes = await client.query<{
    license_class_code: string | null;
    license_class_label: string | null;
    driver_employment_status_code: string | null;
    driver_employment_status_label: string | null;
    medical_card_status_code: string | null;
    medical_card_status_label: string | null;
  }>(
    `
      SELECT
        lc.code AS license_class_code,
        lc.label AS license_class_label,
        es.code AS driver_employment_status_code,
        es.label AS driver_employment_status_label,
        mcs.code AS medical_card_status_code,
        mcs.label AS medical_card_status_label
      FROM mdata.drivers d
      LEFT JOIN reference.license_classes lc ON lc.id = d.license_class_id
      LEFT JOIN reference.employment_statuses es ON es.id = d.driver_employment_status_id
      LEFT JOIN reference.medical_card_statuses mcs ON mcs.id = d.medical_card_status_id
      WHERE d.id = $1::uuid
        AND (
          d.operating_company_id = $2::uuid
          OR EXISTS (
            SELECT 1 FROM mdata.driver_company_authorizations dca
            WHERE dca.driver_id = d.id
              AND dca.company_id = $2::uuid
              AND dca.is_authorized = true
              AND dca.deactivated_at IS NULL
          )
        )
      LIMIT 1
    `,
    [driverId, operatingCompanyId]
  );

  const endorsementsRes = await client.query<{ code: string }>(
    `
      SELECT e.code
      FROM mdata.driver_cdl_endorsements de
      JOIN reference.cdl_endorsements e ON e.id = de.endorsement_id
      JOIN mdata.drivers d ON d.id = de.driver_id
      WHERE de.driver_id = $1::uuid
        AND (
          d.operating_company_id = $2::uuid
          OR EXISTS (
            SELECT 1 FROM mdata.driver_company_authorizations dca
            WHERE dca.driver_id = d.id
              AND dca.company_id = $2::uuid
              AND dca.is_authorized = true
              AND dca.deactivated_at IS NULL
          )
        )
      ORDER BY e.sort_order, e.code
    `,
    [driverId, operatingCompanyId]
  );

  const restrictionsRes = await client.query<{ code: string }>(
    `
      SELECT r.code
      FROM mdata.driver_cdl_restrictions dr
      JOIN reference.cdl_restrictions r ON r.id = dr.restriction_id
      JOIN mdata.drivers d ON d.id = dr.driver_id
      WHERE dr.driver_id = $1::uuid
        AND (
          d.operating_company_id = $2::uuid
          OR EXISTS (
            SELECT 1 FROM mdata.driver_company_authorizations dca
            WHERE dca.driver_id = d.id
              AND dca.company_id = $2::uuid
              AND dca.is_authorized = true
              AND dca.deactivated_at IS NULL
          )
        )
      ORDER BY r.sort_order, r.code
    `,
    [driverId, operatingCompanyId]
  );

  const row = rowRes.rows[0] ?? {};
  return {
    license_class_code: row.license_class_code ?? null,
    license_class_label: row.license_class_label ?? null,
    driver_employment_status_code: row.driver_employment_status_code ?? null,
    driver_employment_status_label: row.driver_employment_status_label ?? null,
    medical_card_status_code: row.medical_card_status_code ?? null,
    medical_card_status_label: row.medical_card_status_label ?? null,
    endorsement_codes: endorsementsRes.rows.map((r) => r.code),
    restriction_codes: restrictionsRes.rows.map((r) => r.code),
  };
}
