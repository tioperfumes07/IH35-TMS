type DbClient = {
  query: <T = Record<string, unknown>>(sql: string, values?: unknown[]) => Promise<{ rows: T[] }>;
};

function asObject(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

export function parseSamsaraVehiclePayload(raw: unknown) {
  const payload = asObject(raw) ?? {};
  const record = asObject(payload.data) ?? asObject(payload.vehicle) ?? payload;
  const odometerRaw =
    record.odometer_mi ?? record.odometerMiles ?? record.odometer_miles ?? record.odometer ?? payload.odometer;
  const odometer = Number(odometerRaw);
  const engineHoursRaw = record.engine_hours ?? record.engineHours ?? payload.engine_hours;
  const engineHours = Number(engineHoursRaw);
  const fuelRaw = record.fuel_level_pct ?? record.fuelPercent ?? record.fuel_level ?? payload.fuel_level_pct;
  const fuel = Number(fuelRaw);
  const faults: Array<{ code: string; severity: string; description: string | null }> = [];
  for (const key of ["dtc_codes", "diagnostics", "faults", "faultCodes"]) {
    const arr = record[key] ?? payload[key];
    if (!Array.isArray(arr)) continue;
    for (const item of arr) {
      const obj = asObject(item);
      if (!obj) continue;
      const code = String(obj.code ?? obj.dtc_code ?? obj.id ?? "").trim();
      if (!code) continue;
      faults.push({
        code,
        severity: String(obj.severity ?? obj.level ?? "unknown"),
        description: typeof obj.description === "string" ? obj.description : null,
      });
    }
  }
  return {
    odometer_miles: Number.isFinite(odometer) && odometer >= 0 ? Math.round(odometer) : null,
    engine_hours: Number.isFinite(engineHours) && engineHours >= 0 ? engineHours : null,
    fuel_level_pct: Number.isFinite(fuel) && fuel >= 0 && fuel <= 100 ? fuel : null,
    fault_codes: faults,
  };
}

function daysUntil(dateStr: string | null | undefined): number | null {
  if (!dateStr) return null;
  const d = new Date(dateStr);
  if (Number.isNaN(d.getTime())) return null;
  return Math.ceil((d.getTime() - Date.now()) / (24 * 60 * 60 * 1000));
}

function complianceColor(days: number | null): "green" | "yellow" | "red" | "gray" {
  if (days === null) return "gray";
  if (days < 0 || days < 7) return "red";
  if (days <= 30) return "yellow";
  return "green";
}

async function mapDriverRow(row: Record<string, unknown> | undefined, extra?: Record<string, unknown>) {
  if (!row) return null;
  return {
    id: String(row.id),
    name: [row.first_name, row.last_name].filter(Boolean).join(" ").trim() || null,
    phone: row.phone ?? null,
    photo_url: row.photo_url ?? null,
    ...extra,
  };
}

export async function buildUnitAggregate(
  client: DbClient,
  unitId: string,
  operatingCompanyId: string
): Promise<Record<string, unknown> | null> {
  await client.query(`SELECT set_config('app.operating_company_id', $1, true)`, [operatingCompanyId]);

  const unitRes = await client.query(
    `
      SELECT u.*
      FROM mdata.units u
      WHERE u.id = $1::uuid
        AND (
          u.owner_company_id = $2::uuid
          OR u.currently_leased_to_company_id = $2::uuid
        )
      LIMIT 1
    `,
    [unitId, operatingCompanyId]
  );
  const unit = unitRes.rows[0];
  if (!unit) return null;

  const platesRes = await client.query(
    `
      SELECT id, country, jurisdiction, plate_number, expiration::text, status
      FROM mdata.unit_plates
      WHERE unit_id = $1::uuid
        AND operating_company_id = $2::uuid
        AND status <> 'archived'
      ORDER BY country, jurisdiction
    `,
    [unitId, operatingCompanyId]
  );

  const samsaraRes = await client.query(
    `
      SELECT sv.samsara_vehicle_id, sv.last_seen_at::text, sv.raw_payload
      FROM integrations.samsara_vehicles sv
      WHERE sv.local_unit_id = $1::uuid
        AND sv.operating_company_id = $2::uuid
      ORDER BY sv.last_seen_at DESC NULLS LAST
      LIMIT 1
    `,
    [unitId, operatingCompanyId]
  );
  const samsaraRow = samsaraRes.rows[0];
  const samsara = samsaraRow
    ? {
        samsara_vehicle_id: samsaraRow.samsara_vehicle_id,
        last_seen_at: samsaraRow.last_seen_at,
        raw_payload_parsed: parseSamsaraVehiclePayload(samsaraRow.raw_payload),
      }
    : unit.samsara_vehicle_id
      ? {
          samsara_vehicle_id: unit.samsara_vehicle_id,
          last_seen_at: null,
          raw_payload_parsed: parseSamsaraVehiclePayload(null),
        }
      : null;

  const posRes = await client.query(
    `
      SELECT lat, lng, speed_mph, heading_deg, engine_state, captured_at::text, NULL::text AS geofence_label
      FROM telematics.vehicle_latest_position
      WHERE unit_id = $1::uuid
        AND operating_company_id = $2::uuid
      LIMIT 1
    `,
    [unitId, operatingCompanyId]
  );
  const latest_position = posRes.rows[0] ?? null;

  const defaultDriverRes = await client.query(
    `
      SELECT d.id, d.first_name, d.last_name, d.phone, vda.started_at::text
      FROM telematics.vehicle_driver_assignments vda
      JOIN mdata.drivers d ON d.id = vda.driver_id
      WHERE vda.unit_id = $1::uuid
        AND vda.operating_company_id = $2::uuid
        AND vda.is_default = true
        AND vda.ended_at IS NULL
      ORDER BY vda.started_at DESC
      LIMIT 1
    `,
    [unitId, operatingCompanyId]
  );

  const currentDriverRes = await client.query(
    `
      SELECT d.id, d.first_name, d.last_name, d.phone, vda.started_at::text AS logged_in_at, vda.source
      FROM telematics.vehicle_driver_assignments vda
      JOIN mdata.drivers d ON d.id = vda.driver_id
      WHERE vda.unit_id = $1::uuid
        AND vda.operating_company_id = $2::uuid
        AND vda.source = 'samsara_webhook'
        AND vda.ended_at IS NULL
      ORDER BY vda.started_at DESC
      LIMIT 1
    `,
    [unitId, operatingCompanyId]
  );

  const default_driver = await mapDriverRow(defaultDriverRes.rows[0]);
  const current_driver = await mapDriverRow(currentDriverRes.rows[0], {
    source: currentDriverRes.rows[0]?.source ?? null,
    logged_in_at: currentDriverRes.rows[0]?.logged_in_at ?? null,
    hos_drive_remaining_min: null,
    hos_on_duty_remaining_min: null,
    hos_cycle_remaining_min: null,
  });

  const loadRes = await client.query(
    `
      SELECT
        l.id::text AS load_id,
        l.load_number,
        l.status,
        c.customer_name AS customer,
        (
          SELECT NULLIF(TRIM(CONCAT_WS(', ', ls.city, ls.state)), '')
          FROM mdata.load_stops ls
          WHERE ls.load_id = l.id
          ORDER BY ls.sequence_number ASC
          LIMIT 1
        ) AS pickup,
        (
          SELECT NULLIF(TRIM(CONCAT_WS(', ', ls.city, ls.state)), '')
          FROM mdata.load_stops ls
          WHERE ls.load_id = l.id
          ORDER BY ls.sequence_number DESC
          LIMIT 1
        ) AS delivery,
        (
          SELECT ls.scheduled_arrival_at::text
          FROM mdata.load_stops ls
          WHERE ls.load_id = l.id
          ORDER BY ls.sequence_number DESC
          LIMIT 1
        ) AS eta
      FROM mdata.loads l
      LEFT JOIN mdata.customers c ON c.id = l.customer_id
      WHERE l.assigned_unit_id = $1::uuid
        AND l.operating_company_id = $2::uuid
        AND l.soft_deleted_at IS NULL
        AND l.status::text NOT IN ('delivered', 'cancelled', 'void', 'completed')
      ORDER BY l.updated_at DESC
      LIMIT 1
    `,
    [unitId, operatingCompanyId]
  );
  const current_load = loadRes.rows[0] ?? null;

  const woRes = await client.query(
    `
      SELECT
        COUNT(*) FILTER (
          WHERE COALESCE(
            w.bucket::text,
            CASE
              WHEN w.repair_location = 'mobile_roadside' THEN 'roadside'
              WHEN w.repair_location = 'in_house' THEN 'in_house'
              ELSE 'external'
            END
          ) = 'in_house'
        )::int AS in_house,
        COUNT(*) FILTER (
          WHERE COALESCE(
            w.bucket::text,
            CASE
              WHEN w.repair_location = 'mobile_roadside' THEN 'roadside'
              WHEN w.repair_location = 'in_house' THEN 'in_house'
              ELSE 'external'
            END
          ) = 'external'
        )::int AS external,
        COUNT(*) FILTER (
          WHERE COALESCE(
            w.bucket::text,
            CASE
              WHEN w.repair_location = 'mobile_roadside' THEN 'roadside'
              WHEN w.repair_location = 'in_house' THEN 'in_house'
              ELSE 'external'
            END
          ) = 'roadside'
        )::int AS roadside,
        COUNT(*)::int AS total
      FROM maintenance.work_orders w
      WHERE w.unit_id = $1::uuid
        AND w.operating_company_id = $2::uuid
        AND w.status NOT IN ('complete', 'completed', 'cancelled')
    `,
    [unitId, operatingCompanyId]
  );
  const wo = woRes.rows[0] ?? { in_house: 0, external: 0, roadside: 0, total: 0 };

  const pmRes = await client.query(
    `
      SELECT ps.label, ps.next_due_odometer::int, ps.last_service_odometer::int
      FROM maintenance.pm_alerts pa
      JOIN maintenance.pm_schedules ps ON ps.id = pa.pm_schedule_id
      WHERE pa.unit_id = $1::uuid
        AND pa.operating_company_id = $2::uuid
        AND pa.state IN ('open', 'acknowledged')
      ORDER BY ps.next_due_odometer ASC NULLS LAST
      LIMIT 4
    `,
    [unitId, operatingCompanyId]
  );
  const next_pm_due: Record<string, unknown> = {};
  for (const row of pmRes.rows) {
    const key = String(row.label ?? "general").toLowerCase().replace(/\s+/g, "_");
    const milesRemaining =
      row.next_due_odometer != null && samsara?.raw_payload_parsed?.odometer_miles != null
        ? Number(row.next_due_odometer) - Number(samsara.raw_payload_parsed.odometer_miles)
        : null;
    next_pm_due[key] = {
      miles_remaining: milesRemaining,
      due_date_est: null,
      last_done_odometer: row.last_service_odometer,
    };
  }

  const lastServiceRes = await client.query(
    `
      SELECT w.updated_at::text AS date, NULL::int AS odometer, w.total_actual_cost AS cost, v.vendor_name AS vendor
      FROM maintenance.work_orders w
      LEFT JOIN mdata.vendors v ON v.id = w.external_vendor_id
      WHERE w.unit_id = $1::uuid
        AND w.operating_company_id = $2::uuid
        AND w.status IN ('complete', 'completed')
      ORDER BY w.updated_at DESC NULLS LAST
      LIMIT 1
    `,
    [unitId, operatingCompanyId]
  );
  const last_service = lastServiceRes.rows[0] ?? null;

  const registration_plates = platesRes.rows.map((p) => ({
    country: p.country,
    jurisdiction: p.jurisdiction,
    expiration: p.expiration,
    days_until_expiration: daysUntil(p.expiration as string),
  }));

  const compliance = {
    dot_inspection: { last_date: null, result: null, next_due: null, days_until_due: null },
    us_insurance: {
      policy: unit.us_insurance_policy_number,
      carrier: unit.us_insurance_carrier,
      expiration: unit.us_insurance_expiration,
      days_until_expiration: daysUntil(unit.us_insurance_expiration as string),
      color: complianceColor(daysUntil(unit.us_insurance_expiration as string)),
    },
    mx_insurance: {
      policy: unit.mx_insurance_policy_number,
      carrier: unit.mx_insurance_carrier,
      expiration: unit.mx_insurance_expiration,
      days_until_expiration: daysUntil(unit.mx_insurance_expiration as string),
      color: complianceColor(daysUntil(unit.mx_insurance_expiration as string)),
    },
    registration_plates,
    irp: {
      texas_irp_number: unit.texas_irp_number,
      account: unit.irp_account_number,
      expiration: unit.irp_expiration,
      jurisdictions: unit.irp_registered_jurisdictions,
    },
    sct_permit: {
      number: unit.sct_permit_number,
      expiration: unit.sct_permit_expiration,
      days_until_expiration: daysUntil(unit.sct_permit_expiration as string),
    },
    pita: {
      permit_number: unit.pita_permit_number,
      status: unit.pita_status,
      expiration: unit.pita_expiration,
    },
    ifta_current_quarter_filed: false,
    annual_inspection_status: "unknown",
  };

  const maintenance_alerts: Array<{ severity: string; message: string; source: string; created_at: string }> = [];
  for (const fault of samsara?.raw_payload_parsed?.fault_codes ?? []) {
    if (String(fault.severity).toLowerCase() === "high") {
      maintenance_alerts.push({
        severity: "high",
        message: `Fault code ${fault.code}${fault.description ? `: ${fault.description}` : ""}`,
        source: "samsara",
        created_at: new Date().toISOString(),
      });
    }
  }
  const usDays = daysUntil(unit.us_insurance_expiration as string);
  if (usDays !== null && usDays < 0) {
    maintenance_alerts.push({
      severity: "high",
      message: "US insurance expired",
      source: "compliance",
      created_at: new Date().toISOString(),
    });
  } else if (usDays !== null && usDays <= 30) {
    maintenance_alerts.push({
      severity: "medium",
      message: `US insurance expires in ${usDays} days`,
      source: "compliance",
      created_at: new Date().toISOString(),
    });
  }
  for (const plate of registration_plates) {
    const d = plate.days_until_expiration as number | null;
    if (d !== null && d < 0) {
      maintenance_alerts.push({
        severity: "high",
        message: `Plate ${plate.jurisdiction} (${plate.country}) expired`,
        source: "compliance",
        created_at: new Date().toISOString(),
      });
    } else if (d !== null && d <= 60) {
      maintenance_alerts.push({
        severity: "low",
        message: `Plate ${plate.jurisdiction} expires in ${d} days`,
        source: "compliance",
        created_at: new Date().toISOString(),
      });
    }
  }

  return {
    unit,
    plates: platesRes.rows,
    samsara,
    latest_position,
    default_driver,
    current_driver,
    current_load,
    open_wo_count: wo,
    next_pm_due,
    last_service,
    compliance,
    maintenance_alerts,
  };
}
