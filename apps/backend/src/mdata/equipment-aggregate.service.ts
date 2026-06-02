import { withSavepoint } from "../auth/db.js";

type DbClient = {
  query: <T = Record<string, unknown>>(sql: string, values?: unknown[]) => Promise<{ rows: T[] }>;
};

function daysUntil(dateStr: string | null | undefined): number | null {
  if (!dateStr) return null;
  const d = new Date(String(dateStr));
  if (Number.isNaN(d.getTime())) return null;
  return Math.ceil((d.getTime() - Date.now()) / (24 * 60 * 60 * 1000));
}

function complianceColor(days: number | null): "green" | "yellow" | "red" | "gray" {
  if (days === null) return "gray";
  if (days < 0) return "red";
  if (days <= 30) return "yellow";
  return "green";
}

export async function buildEquipmentAggregate(
  client: DbClient,
  equipmentId: string,
  operatingCompanyId: string
): Promise<Record<string, unknown> | null> {
  await client.query(`SELECT set_config('app.operating_company_id', $1, true)`, [operatingCompanyId]);

  const eqRes = await client.query(
    `
      SELECT e.*
      FROM mdata.equipment e
      WHERE e.id = $1::uuid
        AND (
          e.owner_company_id = $2::uuid
          OR e.currently_leased_to_company_id = $2::uuid
        )
      LIMIT 1
    `,
    [equipmentId, operatingCompanyId]
  );
  const equipment = eqRes.rows[0];
  if (!equipment) return null;

  const type_specs = {
    length_ft: equipment.length_ft,
    width_ft: equipment.width_ft,
    height_ft: equipment.height_ft,
    max_payload_lbs: equipment.max_payload_lbs,
    axle_count: equipment.axle_count,
    suspension_type: equipment.suspension_type,
    tire_size: equipment.tire_size,
  };

  const unitId = equipment.current_unit_id as string | null;
  let attached_to_unit = null;
  let current_load = null;
  if (unitId) {
    const unitRes = await client.query(
      `SELECT id::text AS unit_id, unit_number, vin FROM mdata.units WHERE id = $1::uuid LIMIT 1`,
      [unitId]
    );
    attached_to_unit = unitRes.rows[0] ?? null;
    const loadRes = await client.query(
      `
        SELECT l.id::text AS load_id, l.load_number, l.status::text
        FROM mdata.loads l
        WHERE l.assigned_primary_unit_id = $1::uuid
          AND l.operating_company_id = $2::uuid
          AND l.soft_deleted_at IS NULL
          AND l.status::text NOT IN ('delivered', 'cancelled', 'void', 'completed', 'closed')
        ORDER BY l.updated_at DESC
        LIMIT 1
      `,
      [unitId, operatingCompanyId]
    );
    current_load = loadRes.rows[0] ?? null;
  }

  const isReefer = String(equipment.equipment_type) === "Reefer";
  const reefer = isReefer
    ? {
        reefer_year: equipment.reefer_year,
        reefer_brand: equipment.reefer_brand,
        reefer_model: equipment.reefer_model,
        reefer_setpoint_temp_f: equipment.reefer_setpoint_temp_f,
        reefer_fuel_capacity_gal: equipment.reefer_fuel_capacity_gal,
        reefer_service_interval_hours: equipment.reefer_service_interval_hours,
        reefer_last_service_hours: equipment.reefer_last_service_hours,
        reefer_last_service_date: equipment.reefer_last_service_date,
        reefer_notes: equipment.reefer_notes,
      }
    : null;

  let samsara_telemetry: Record<string, unknown> | null = null;
  if (isReefer && unitId) {
    const telRes = await withSavepoint(
      client,
      "eq_agg_reefer_tel",
      () =>
        client.query(
          `
            SELECT sv.raw_payload
            FROM integrations.samsara_vehicles sv
            WHERE sv.local_unit_id = $1::uuid
              AND sv.operating_company_id = $2::uuid
            ORDER BY sv.last_seen_at DESC NULLS LAST
            LIMIT 1
          `,
          [unitId, operatingCompanyId]
        ),
      { rows: [] as Array<Record<string, unknown>> }
    );
    const raw = telRes.rows[0]?.raw_payload;
    if (raw && typeof raw === "object") {
      samsara_telemetry = { source: "samsara", payload: raw };
    }
  }

  const maintUnitId = unitId;
  let maintenance = { open_wo_count: 0, next_pm_due: null as unknown, last_service: null as unknown };
  if (maintUnitId) {
    const woRes = await client.query<{ total: number }>(
      `
        SELECT COUNT(*)::int AS total
        FROM maintenance.work_orders w
        WHERE w.unit_id = $1::uuid
          AND w.operating_company_id = $2::uuid
          AND w.status NOT IN ('complete', 'completed', 'cancelled')
      `,
      [maintUnitId, operatingCompanyId]
    );
    const pmRes = await client.query(
      `
        SELECT ps.label, ps.next_due_odometer::int
        FROM maintenance.pm_alerts pa
        JOIN maintenance.pm_schedules ps ON ps.id = pa.pm_schedule_id
        WHERE pa.unit_id = $1::uuid
          AND pa.operating_company_id = $2::uuid
          AND pa.state IN ('open', 'acknowledged')
        ORDER BY ps.next_due_odometer ASC NULLS LAST
        LIMIT 1
      `,
      [maintUnitId, operatingCompanyId]
    );
    const lastRes = await client.query(
      `
        SELECT w.updated_at::text AS date, w.total_actual_cost AS cost
        FROM maintenance.work_orders w
        WHERE w.unit_id = $1::uuid
          AND w.operating_company_id = $2::uuid
          AND w.status IN ('complete', 'completed')
        ORDER BY w.updated_at DESC NULLS LAST
        LIMIT 1
      `,
      [maintUnitId, operatingCompanyId]
    );
    maintenance = {
      open_wo_count: Number(woRes.rows[0]?.total ?? 0),
      next_pm_due: pmRes.rows[0] ?? null,
      last_service: lastRes.rows[0] ?? null,
    };
  }

  const platesRes = await client.query(
    `
      SELECT id::text, country, jurisdiction, plate_number, expiration::text, status
      FROM mdata.equipment_plates
      WHERE equipment_id = $1::uuid
        AND operating_company_id = $2::uuid
        AND status <> 'archived'
      ORDER BY country, jurisdiction
    `,
    [equipmentId, operatingCompanyId]
  );

  const compliance = {
    dot_inspection: {
      last_date: equipment.dot_inspection_last_date,
      next_due: equipment.dot_inspection_next_due,
      days_until_due: daysUntil(equipment.dot_inspection_next_due as string),
    },
    us_insurance: {
      policy: equipment.us_insurance_policy_number,
      expiration: equipment.us_insurance_expiration,
      days_until_expiration: daysUntil(equipment.us_insurance_expiration as string),
      color: complianceColor(daysUntil(equipment.us_insurance_expiration as string)),
    },
    mx_insurance: {
      policy: equipment.mx_insurance_policy_number,
      expiration: equipment.mx_insurance_expiration,
      days_until_expiration: daysUntil(equipment.mx_insurance_expiration as string),
      color: complianceColor(daysUntil(equipment.mx_insurance_expiration as string)),
    },
    registration: {
      title_status: equipment.title_status,
      lien_holder: equipment.lien_holder,
    },
    plates: platesRes.rows,
  };

  const documentsRes = await withSavepoint(
    client,
    "eq_agg_docs",
    () =>
      client.query(
        `
          SELECT
            f.id::text AS file_id,
            f.original_filename AS name,
            fc.code AS category,
            f.expiration_date::text AS expiration_date,
            f.created_at::text AS uploaded_at
          FROM docs.file_links fl
          JOIN docs.files f ON f.id = fl.file_id
          LEFT JOIN catalogs.file_categories fc ON fc.id = f.category_id
          WHERE fl.entity_type = 'equipment'
            AND fl.entity_id = $1::uuid
            AND fl.deleted_at IS NULL
            AND f.deleted_at IS NULL
            AND f.upload_completed_at IS NOT NULL
            AND f.operating_company_id = $2::uuid
          ORDER BY f.created_at DESC
        `,
        [equipmentId, operatingCompanyId]
      ),
    { rows: [] as Array<Record<string, unknown>> }
  );

  return {
    equipment,
    type_specs,
    current_assignment: { attached_to_unit, current_load },
    reefer,
    samsara_telemetry,
    maintenance,
    compliance,
    documents: documentsRes.rows,
    plates: platesRes.rows,
  };
}
