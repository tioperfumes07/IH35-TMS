import { computeDaysUntilExpiry, computeSeverity, type CertExpirySeverity } from "../../../safety/expiry-tracking/cert-monitor.service.js";

export const PERMIT_TYPES = ["oversize", "overweight", "hazmat", "idle", "specialized"] as const;
export type PermitType = (typeof PERMIT_TYPES)[number];

export type UnitPermitRow = {
  uuid: string;
  operating_company_id: string;
  unit_uuid: string;
  permit_type: PermitType;
  issuing_state: string;
  permit_number: string;
  effective_date: string;
  expiration_date: string;
  cost: string | null;
  notes: string | null;
  pdf_evidence_uuid: string | null;
  deleted_at: string | null;
  created_at: string;
  updated_at: string;
};

export type UnitPermitExpiryAlert = {
  operating_company_id: string;
  unit_uuid: string;
  unit_number: string;
  permit_uuid: string;
  permit_type: PermitType;
  permit_label: string;
  expiry_date: string;
  days_until_expiry: number;
  severity: CertExpirySeverity;
};

type Queryable = {
  query: <R = Record<string, unknown>>(sql: string, values?: unknown[]) => Promise<{ rows: R[] }>;
};

const PERMIT_LABELS: Record<PermitType, string> = {
  oversize: "Oversize",
  overweight: "Overweight",
  hazmat: "Hazmat",
  idle: "Idle",
  specialized: "Specialized",
};

export function permitLabel(permitType: PermitType): string {
  return PERMIT_LABELS[permitType] ?? permitType;
}

export function buildPermitExpiryAlert(
  row: Pick<UnitPermitRow, "uuid" | "unit_uuid" | "permit_type" | "expiration_date"> & {
    operating_company_id: string;
    unit_number: string;
  },
  referenceDate = new Date()
): UnitPermitExpiryAlert | null {
  const days = computeDaysUntilExpiry(row.expiration_date, referenceDate);
  const severity = computeSeverity(days);
  if (severity == null || days == null) return null;
  return {
    operating_company_id: row.operating_company_id,
    unit_uuid: row.unit_uuid,
    unit_number: row.unit_number,
    permit_uuid: row.uuid,
    permit_type: row.permit_type,
    permit_label: permitLabel(row.permit_type),
    expiry_date: row.expiration_date.slice(0, 10),
    days_until_expiry: days,
    severity,
  };
}

export async function assertUnitScope(
  client: Queryable,
  unitUuid: string,
  operatingCompanyId: string
): Promise<string | null> {
  const res = await client.query<{ id: string }>(
    `
      SELECT id::text
      FROM mdata.units
      WHERE id = $1::uuid
        AND (owner_company_id = $2::uuid OR currently_leased_to_company_id = $2::uuid)
      LIMIT 1
    `,
    [unitUuid, operatingCompanyId]
  );
  return res.rows[0]?.id ?? null;
}

export async function listUnitPermits(
  client: Queryable,
  unitUuid: string,
  operatingCompanyId: string
): Promise<UnitPermitRow[]> {
  const res = await client.query<UnitPermitRow>(
    `
      SELECT
        uuid::text,
        operating_company_id::text,
        unit_uuid::text,
        permit_type,
        issuing_state,
        permit_number,
        effective_date::text,
        expiration_date::text,
        cost::text,
        notes,
        pdf_evidence_uuid::text,
        deleted_at::text,
        created_at::text,
        updated_at::text
      FROM master_data.unit_permits
      WHERE unit_uuid = $1::uuid
        AND operating_company_id = $2::uuid
        AND deleted_at IS NULL
      ORDER BY expiration_date ASC, permit_type
    `,
    [unitUuid, operatingCompanyId]
  );
  return res.rows;
}

export async function createUnitPermit(
  client: Queryable,
  unitUuid: string,
  operatingCompanyId: string,
  input: {
    permit_type: PermitType;
    issuing_state: string;
    permit_number: string;
    effective_date: string;
    expiration_date: string;
    cost?: number | null;
    notes?: string | null;
    pdf_evidence_uuid?: string | null;
  }
): Promise<UnitPermitRow> {
  const res = await client.query<UnitPermitRow>(
    `
      INSERT INTO master_data.unit_permits (
        operating_company_id,
        unit_uuid,
        permit_type,
        issuing_state,
        permit_number,
        effective_date,
        expiration_date,
        cost,
        notes,
        pdf_evidence_uuid
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
      RETURNING
        uuid::text,
        operating_company_id::text,
        unit_uuid::text,
        permit_type,
        issuing_state,
        permit_number,
        effective_date::text,
        expiration_date::text,
        cost::text,
        notes,
        pdf_evidence_uuid::text,
        deleted_at::text,
        created_at::text,
        updated_at::text
    `,
    [
      operatingCompanyId,
      unitUuid,
      input.permit_type,
      input.issuing_state,
      input.permit_number,
      input.effective_date,
      input.expiration_date,
      input.cost ?? null,
      input.notes ?? null,
      input.pdf_evidence_uuid ?? null,
    ]
  );
  return res.rows[0]!;
}

export async function updateUnitPermit(
  client: Queryable,
  unitUuid: string,
  permitUuid: string,
  operatingCompanyId: string,
  patch: Partial<{
    permit_type: PermitType;
    issuing_state: string;
    permit_number: string;
    effective_date: string;
    expiration_date: string;
    cost: number | null;
    notes: string | null;
    pdf_evidence_uuid: string | null;
  }>
): Promise<UnitPermitRow | null> {
  const setParts: string[] = ["updated_at = now()"];
  const values: unknown[] = [];
  const add = (col: string, val: unknown) => {
    values.push(val);
    setParts.push(`${col} = $${values.length}`);
  };
  if ("permit_type" in patch) add("permit_type", patch.permit_type);
  if ("issuing_state" in patch) add("issuing_state", patch.issuing_state);
  if ("permit_number" in patch) add("permit_number", patch.permit_number);
  if ("effective_date" in patch) add("effective_date", patch.effective_date);
  if ("expiration_date" in patch) add("expiration_date", patch.expiration_date);
  if ("cost" in patch) add("cost", patch.cost ?? null);
  if ("notes" in patch) add("notes", patch.notes ?? null);
  if ("pdf_evidence_uuid" in patch) add("pdf_evidence_uuid", patch.pdf_evidence_uuid ?? null);
  values.push(permitUuid, unitUuid, operatingCompanyId);
  const res = await client.query<UnitPermitRow>(
    `
      UPDATE master_data.unit_permits
      SET ${setParts.join(", ")}
      WHERE uuid = $${values.length - 2}::uuid
        AND unit_uuid = $${values.length - 1}::uuid
        AND operating_company_id = $${values.length}::uuid
        AND deleted_at IS NULL
      RETURNING
        uuid::text,
        operating_company_id::text,
        unit_uuid::text,
        permit_type,
        issuing_state,
        permit_number,
        effective_date::text,
        expiration_date::text,
        cost::text,
        notes,
        pdf_evidence_uuid::text,
        deleted_at::text,
        created_at::text,
        updated_at::text
    `,
    values
  );
  return res.rows[0] ?? null;
}

export async function softDeleteUnitPermit(
  client: Queryable,
  unitUuid: string,
  permitUuid: string,
  operatingCompanyId: string
): Promise<boolean> {
  const res = await client.query(
    `
      UPDATE master_data.unit_permits
      SET deleted_at = now(), updated_at = now()
      WHERE uuid = $1::uuid
        AND unit_uuid = $2::uuid
        AND operating_company_id = $3::uuid
        AND deleted_at IS NULL
      RETURNING uuid
    `,
    [permitUuid, unitUuid, operatingCompanyId]
  );
  return res.rows.length > 0;
}

export async function scanUnitPermitExpiries(
  client: Queryable,
  operatingCompanyId: string,
  referenceDate = new Date()
): Promise<UnitPermitExpiryAlert[]> {
  const res = await client.query<
    UnitPermitRow & { unit_number: string }
  >(
    `
      SELECT
        p.uuid::text,
        p.operating_company_id::text,
        p.unit_uuid::text,
        p.permit_type,
        p.issuing_state,
        p.permit_number,
        p.effective_date::text,
        p.expiration_date::text,
        p.cost::text,
        p.notes,
        p.pdf_evidence_uuid::text,
        p.deleted_at::text,
        p.created_at::text,
        p.updated_at::text,
        COALESCE(NULLIF(TRIM(u.unit_number), ''), u.id::text) AS unit_number
      FROM master_data.unit_permits p
      JOIN mdata.units u ON u.id = p.unit_uuid
      WHERE p.operating_company_id = $1::uuid
        AND p.deleted_at IS NULL
    `,
    [operatingCompanyId]
  );

  const alerts: UnitPermitExpiryAlert[] = [];
  for (const row of res.rows) {
    const alert = buildPermitExpiryAlert(row, referenceDate);
    if (alert) alerts.push(alert);
  }

  alerts.sort((a, b) => {
    const severityOrder = { critical: 0, warn: 1, info: 2 };
    const severityDiff = severityOrder[a.severity] - severityOrder[b.severity];
    if (severityDiff !== 0) return severityDiff;
    return a.days_until_expiry - b.days_until_expiry;
  });

  return alerts;
}
