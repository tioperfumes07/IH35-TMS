type DbClient = {
  query: <T = Record<string, unknown>>(sql: string, values?: unknown[]) => Promise<{ rows: T[] }>;
};

export type ComplianceSeverity = "red" | "yellow" | "green";

export type ComplianceCredential = {
  credential_id: string;
  type: string;
  owner_type: string;
  owner_id: string;
  owner_name: string;
  label: string;
  expiration_date: string | null;
  days_until_expiration: number | null;
  severity: ComplianceSeverity;
  action_link: string;
};

export function daysUntilExpiration(dateStr: string | null | undefined): number | null {
  if (!dateStr) return null;
  const d = new Date(`${String(dateStr).slice(0, 10)}T12:00:00Z`);
  if (Number.isNaN(d.getTime())) return null;
  return Math.ceil((d.getTime() - Date.now()) / (24 * 60 * 60 * 1000));
}

export function computeComplianceSeverity(daysUntil: number | null): ComplianceSeverity {
  if (daysUntil === null) return "green";
  if (daysUntil < 0 || daysUntil < 7) return "red";
  if (daysUntil <= 30) return "yellow";
  return "green";
}

function mapRow(row: Record<string, unknown>): ComplianceCredential {
  const expiration = row.expiration_date ? String(row.expiration_date).slice(0, 10) : null;
  const days = row.days_until_expiration === null || row.days_until_expiration === undefined
    ? daysUntilExpiration(expiration)
    : Number(row.days_until_expiration);
  const ownerType = String(row.owner_type ?? "");
  const ownerId = String(row.owner_id ?? "");
  const type = String(row.type ?? "");
  const actionLink =
    ownerType === "unit"
      ? `/fleet/units/${ownerId}`
      : ownerType === "equipment"
        ? `/fleet/trailers/${ownerId}`
        : ownerType === "driver"
          ? `/drivers/${ownerId}/profile`
          : ownerType === "company"
            ? `/settings`
            : ownerType === "unit_plate"
              ? `/fleet/units/${String(row.parent_id ?? ownerId)}`
              : ownerType === "equipment_plate"
                ? `/fleet/trailers/${String(row.parent_id ?? ownerId)}`
                : "/compliance";

  return {
    credential_id: `${ownerType}:${ownerId}:${type}:${expiration ?? "none"}`,
    type,
    owner_type: ownerType,
    owner_id: ownerId,
    owner_name: String(row.owner_name ?? ""),
    label: String(row.label ?? type),
    expiration_date: expiration,
    days_until_expiration: days,
    severity: computeComplianceSeverity(days),
    action_link: actionLink,
  };
}

const AGGREGATE_SQL = `
  SELECT type, owner_type, owner_id::text, owner_name, label, expiration_date::text,
         (expiration_date - CURRENT_DATE)::int AS days_until_expiration, parent_id::text
  FROM (
    SELECT 'us_insurance'::text AS type, 'unit'::text AS owner_type, u.id AS owner_id,
           COALESCE(u.unit_number, u.id::text) AS owner_name, 'US Insurance'::text AS label,
           u.us_insurance_expiration AS expiration_date, NULL::uuid AS parent_id
    FROM mdata.units u
    WHERE u.operating_company_id = $1::uuid AND u.us_insurance_expiration IS NOT NULL

    UNION ALL
    SELECT 'mx_insurance', 'unit', u.id, COALESCE(u.unit_number, u.id::text), 'MX Insurance',
           u.mx_insurance_expiration, NULL
    FROM mdata.units u
    WHERE u.operating_company_id = $1::uuid AND u.mx_insurance_expiration IS NOT NULL

    UNION ALL
    SELECT 'irp', 'unit', u.id, COALESCE(u.unit_number, u.id::text), 'IRP Registration',
           u.irp_expiration, NULL
    FROM mdata.units u
    WHERE u.operating_company_id = $1::uuid AND u.irp_expiration IS NOT NULL

    UNION ALL
    SELECT 'sct_permit', 'unit', u.id, COALESCE(u.unit_number, u.id::text), 'SCT Permit',
           u.sct_permit_expiration, NULL
    FROM mdata.units u
    WHERE u.operating_company_id = $1::uuid AND u.sct_permit_expiration IS NOT NULL

    UNION ALL
    SELECT 'pita', 'unit', u.id, COALESCE(u.unit_number, u.id::text), 'PITA Permit',
           u.pita_expiration, NULL
    FROM mdata.units u
    WHERE u.operating_company_id = $1::uuid AND u.pita_expiration IS NOT NULL

    UNION ALL
    SELECT 'trailer_us_insurance', 'equipment', e.id, COALESCE(e.equipment_number, e.id::text), 'Trailer US Insurance',
           e.us_insurance_expiration, NULL
    FROM mdata.equipment e
    WHERE e.operating_company_id = $1::uuid AND e.us_insurance_expiration IS NOT NULL

    UNION ALL
    SELECT 'trailer_mx_insurance', 'equipment', e.id, COALESCE(e.equipment_number, e.id::text), 'Trailer MX Insurance',
           e.mx_insurance_expiration, NULL
    FROM mdata.equipment e
    WHERE e.operating_company_id = $1::uuid AND e.mx_insurance_expiration IS NOT NULL

    UNION ALL
    SELECT 'dot_inspection', 'equipment', e.id, COALESCE(e.equipment_number, e.id::text), 'DOT Inspection',
           e.dot_inspection_next_due, NULL
    FROM mdata.equipment e
    WHERE e.operating_company_id = $1::uuid AND e.dot_inspection_next_due IS NOT NULL

    UNION ALL
    SELECT 'unit_plate', 'unit_plate', p.id, COALESCE(u.unit_number, u.id::text),
           CONCAT('Plate ', p.jurisdiction, ' ', p.plate_number), p.expiration, u.id
    FROM mdata.unit_plates p
    JOIN mdata.units u ON u.id = p.unit_id
    WHERE p.operating_company_id = $1::uuid AND p.expiration IS NOT NULL AND p.archived_at IS NULL

    UNION ALL
    SELECT 'equipment_plate', 'equipment_plate', p.id, COALESCE(e.equipment_number, e.id::text),
           CONCAT('Plate ', p.jurisdiction, ' ', p.plate_number), p.expiration, e.id
    FROM mdata.equipment_plates p
    JOIN mdata.equipment e ON e.id = p.equipment_id
    WHERE p.operating_company_id = $1::uuid AND p.expiration IS NOT NULL AND p.status <> 'archived'

    UNION ALL
    SELECT 'cdl', 'driver', d.id,
           TRIM(CONCAT(COALESCE(d.first_name, ''), ' ', COALESCE(d.last_name, ''))), 'CDL',
           d.cdl_expires_at, NULL
    FROM mdata.drivers d
    WHERE d.operating_company_id = $1::uuid AND d.cdl_expires_at IS NOT NULL

    UNION ALL
    SELECT 'medical_card', 'driver', d.id,
           TRIM(CONCAT(COALESCE(d.first_name, ''), ' ', COALESCE(d.last_name, ''))), 'Medical Card',
           d.dot_medical_expires_at, NULL
    FROM mdata.drivers d
    WHERE d.operating_company_id = $1::uuid AND d.dot_medical_expires_at IS NOT NULL

    UNION ALL
    SELECT 'fast_card', 'driver', d.id,
           TRIM(CONCAT(COALESCE(d.first_name, ''), ' ', COALESCE(d.last_name, ''))), 'FAST Card',
           d.fast_card_expiration, NULL
    FROM mdata.drivers d
    WHERE d.operating_company_id = $1::uuid AND d.fast_card_expiration IS NOT NULL

    UNION ALL
    SELECT 'sentri', 'driver', d.id,
           TRIM(CONCAT(COALESCE(d.first_name, ''), ' ', COALESCE(d.last_name, ''))), 'SENTRI',
           d.sentri_expiration, NULL
    FROM mdata.drivers d
    WHERE d.operating_company_id = $1::uuid AND d.sentri_expiration IS NOT NULL

    UNION ALL
    SELECT 'twic', 'driver', d.id,
           TRIM(CONCAT(COALESCE(d.first_name, ''), ' ', COALESCE(d.last_name, ''))), 'TWIC',
           d.twic_expiration, NULL
    FROM mdata.drivers d
    WHERE d.operating_company_id = $1::uuid AND d.twic_expiration IS NOT NULL

    UNION ALL
    SELECT 'mexican_license', 'driver', d.id,
           TRIM(CONCAT(COALESCE(d.first_name, ''), ' ', COALESCE(d.last_name, ''))), 'Mexican License',
           d.mexican_license_expiration, NULL
    FROM mdata.drivers d
    WHERE d.operating_company_id = $1::uuid AND d.mexican_license_expiration IS NOT NULL

    UNION ALL
    SELECT 'drug_test_cycle', 'driver', d.id,
           TRIM(CONCAT(COALESCE(d.first_name, ''), ' ', COALESCE(d.last_name, ''))), 'Drug Test Cycle',
           (dt.test_date + interval '90 days')::date, NULL
    FROM mdata.drivers d
    JOIN LATERAL (
      SELECT test_date
      FROM safety.drug_test
      WHERE driver_id = d.id AND operating_company_id = $1::uuid AND voided_at IS NULL
      ORDER BY test_date DESC
      LIMIT 1
    ) dt ON true
    WHERE d.operating_company_id = $1::uuid

    UNION ALL
    SELECT 'training', 'driver', t.driver_id,
           TRIM(CONCAT(COALESCE(d.first_name, ''), ' ', COALESCE(d.last_name, ''))),
           COALESCE(t.training_name, 'Training'), t.expiry_date, NULL
    FROM safety.training_records t
    JOIN mdata.drivers d ON d.id = t.driver_id
    WHERE t.operating_company_id = $1::uuid AND t.voided_at IS NULL AND t.expiry_date IS NOT NULL

    UNION ALL
    SELECT 'irp_account', 'company', c.id, COALESCE(c.legal_name, c.id::text),
           'IRP Account', c.irp_account_expiration, NULL
    FROM org.companies c
    WHERE c.id = $1::uuid AND c.irp_account_expiration IS NOT NULL

    UNION ALL
    SELECT 'ifta_license', 'company', c.id, COALESCE(c.legal_name, c.id::text),
           'IFTA License', c.ifta_license_expiration, NULL
    FROM org.companies c
    WHERE c.id = $1::uuid AND c.ifta_license_expiration IS NOT NULL

    UNION ALL
    SELECT 'eld_certification', 'company', c.id, COALESCE(c.legal_name, c.id::text),
           'ELD Certification', c.eld_certification_date, NULL
    FROM org.companies c
    WHERE c.id = $1::uuid AND c.eld_certification_date IS NOT NULL
  ) combined
  ORDER BY days_until_expiration ASC NULLS LAST
`;

export async function buildComplianceCredentials(
  client: DbClient,
  operatingCompanyId: string,
  filters?: { severity?: ComplianceSeverity; type?: string; owner_type?: string }
): Promise<ComplianceCredential[]> {
  await client.query(`SELECT set_config('app.operating_company_id', $1, true)`, [operatingCompanyId]);
  const res = await client.query<Record<string, unknown>>(AGGREGATE_SQL, [operatingCompanyId]);
  let rows = res.rows.map(mapRow);
  if (filters?.severity) rows = rows.filter((r) => r.severity === filters.severity);
  if (filters?.type) rows = rows.filter((r) => r.type === filters.type);
  if (filters?.owner_type) rows = rows.filter((r) => r.owner_type === filters.owner_type);
  rows.sort((a, b) => (a.days_until_expiration ?? 9999) - (b.days_until_expiration ?? 9999));
  return rows;
}

export function summarizeComplianceCredentials(rows: ComplianceCredential[]) {
  const summary = { red: 0, yellow: 0, green: 0, total: rows.length };
  for (const row of rows) summary[row.severity] += 1;
  return summary;
}
