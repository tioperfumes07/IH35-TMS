import { withSavepoint } from "../auth/db.js";
import { getCurrentClocks, type HosDutyStatus } from "../telematics/hos-clocks.service.js";

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

function mapTruck(row: Record<string, unknown> | undefined, extra?: Record<string, unknown>) {
  if (!row) return null;
  return {
    unit_id: String(row.unit_id ?? row.id),
    unit_number: row.unit_number ?? null,
    vin: row.vin ?? null,
    ...extra,
  };
}

export async function buildDriverAggregate(
  client: DbClient,
  driverId: string,
  operatingCompanyId: string
): Promise<Record<string, unknown> | null> {
  await client.query(`SELECT set_config('app.operating_company_id', $1, true)`, [operatingCompanyId]);

  const driverRes = await client.query(
    `
      SELECT d.*
      FROM mdata.drivers d
      WHERE d.id = $1::uuid
        AND (
          d.operating_company_id = $2::uuid
          OR EXISTS (
            SELECT 1 FROM mdata.driver_company_authorizations dca
            WHERE dca.driver_id = d.id AND dca.company_id = $2::uuid AND dca.is_authorized = true AND dca.deactivated_at IS NULL
          )
        )
      LIMIT 1
    `,
    [driverId, operatingCompanyId]
  );
  const driver = driverRes.rows[0];
  if (!driver) return null;

  const cdlExpiration = driver.cdl_expires_at as string | null;
  const license = {
    cdl_number: driver.cdl_number,
    class: driver.cdl_class,
    state: driver.cdl_state,
    expiration: cdlExpiration,
    days_until_expiration: daysUntil(cdlExpiration),
    restrictions: driver.cdl_restrictions,
    endorsements: {
      h: Boolean(driver.endorsement_h),
      n: Boolean(driver.endorsement_n),
      p: Boolean(driver.endorsement_p),
      s: Boolean(driver.endorsement_s),
      t: Boolean(driver.endorsement_t),
      x: Boolean(driver.endorsement_x),
    },
  };

  const medicalRes = await withSavepoint(
    client,
    "driver_agg_medical",
    () =>
      client.query(
        `
      SELECT expiry_date::text, card_number, notes
      FROM safety.medical_cards
      WHERE driver_id = $1::uuid
        AND operating_company_id = $2::uuid
        AND voided_at IS NULL
      ORDER BY expiry_date DESC
      LIMIT 1
    `,
        [driverId, operatingCompanyId]
      ),
    { rows: [] as Array<Record<string, unknown>> }
  );
  const medRow = medicalRes.rows[0];
  const medExp = (medRow?.expiry_date as string) ?? (driver.dot_medical_expires_at as string | null);
  const medDays = daysUntil(medExp);
  const medical_card = {
    expiration: medExp,
    days_until_expiration: medDays,
    examiner: medRow?.notes ?? null,
    restrictions: null,
    color_status: complianceColor(medDays),
  };

  const drugRes = await withSavepoint(
    client,
    "driver_agg_drug",
    () =>
      client.query(
        `
      SELECT test_date::text, test_type, result::text
      FROM safety.drug_test
      WHERE driver_id = $1::uuid
        AND operating_company_id = $2::uuid
        AND voided_at IS NULL
      ORDER BY test_date DESC
      LIMIT 1
    `,
        [driverId, operatingCompanyId]
      ),
    { rows: [] as Array<Record<string, unknown>> }
  );
  const poolRes = await withSavepoint(
    client,
    "driver_agg_pool",
    () =>
      client.query(
        `
      SELECT COUNT(*)::int AS c
      FROM safety.random_pool
      WHERE driver_id = $1::uuid
        AND operating_company_id = $2::uuid
        AND status NOT IN ('missed', 'excused')
    `,
        [driverId, operatingCompanyId]
      ),
    { rows: [{ c: 0 }] }
  );
  const lastTest = drugRes.rows[0];
  const drug_program = {
    in_random_pool: Number(poolRes.rows[0]?.c ?? 0) > 0,
    last_test: lastTest
      ? { date: lastTest.test_date, type: lastTest.test_type, result: lastTest.result }
      : null,
    next_due_est: null,
  };

  let hos: Record<string, unknown> | null = null;
  try {
    const clocks = await getCurrentClocks(client, operatingCompanyId, driverId);
    const latestRes = await client.query<{ duty_status: string; started_at: string }>(
      `
        SELECT duty_status::text, started_at::text
        FROM hos.duty_status_events
        WHERE driver_id = $1::uuid AND operating_company_id = $2::uuid
        ORDER BY started_at DESC
        LIMIT 1
      `,
      [driverId, operatingCompanyId]
    );
    const latest = latestRes.rows[0];
    if (latest) {
      hos = {
        cycle_remaining_min: clocks.cycle_remaining_min,
        drive_remaining_min: clocks.drive_remaining_min,
        on_duty_remaining_min: clocks.window_remaining_min,
        current_status: latest.duty_status as HosDutyStatus,
        last_log_update_at: latest.started_at,
        eld_device_status: clocks.status === "violation" ? "offline" : "connected",
      };
    }
  } catch {
    hos = null;
  }

  const defaultTruckRes = await client.query(
    `
      SELECT u.id::text AS unit_id, u.unit_number, u.vin, vda.started_at::text
      FROM telematics.vehicle_driver_assignments vda
      JOIN mdata.units u ON u.id = vda.unit_id
      WHERE vda.driver_id = $1::uuid
        AND vda.operating_company_id = $2::uuid
        AND vda.is_default = true
        AND vda.ended_at IS NULL
      ORDER BY vda.started_at DESC
      LIMIT 1
    `,
    [driverId, operatingCompanyId]
  );
  const currentTruckRes = await client.query(
    `
      SELECT u.id::text AS unit_id, u.unit_number, u.vin, vda.started_at::text AS samsara_logged_in_at
      FROM telematics.vehicle_driver_assignments vda
      JOIN mdata.units u ON u.id = vda.unit_id
      WHERE vda.driver_id = $1::uuid
        AND vda.operating_company_id = $2::uuid
        AND vda.source = 'samsara_webhook'
        AND vda.ended_at IS NULL
      ORDER BY vda.started_at DESC
      LIMIT 1
    `,
    [driverId, operatingCompanyId]
  );
  const loadRes = await client.query(
    `
      SELECT l.id::text AS load_id, l.load_number, l.status::text,
        (
          SELECT NULLIF(TRIM(CONCAT_WS(', ', ls.city, ls.state)), '')
          FROM mdata.load_stops ls WHERE ls.load_id = l.id ORDER BY ls.sequence_number ASC LIMIT 1
        ) AS pickup,
        (
          SELECT NULLIF(TRIM(CONCAT_WS(', ', ls.city, ls.state)), '')
          FROM mdata.load_stops ls WHERE ls.load_id = l.id ORDER BY ls.sequence_number DESC LIMIT 1
        ) AS delivery
      FROM mdata.loads l
      WHERE l.assigned_primary_driver_id = $1::uuid
        AND l.operating_company_id = $2::uuid
        AND l.soft_deleted_at IS NULL
        AND l.status::text NOT IN ('delivered', 'cancelled', 'void', 'completed', 'closed')
      ORDER BY l.updated_at DESC
      LIMIT 1
    `,
    [driverId, operatingCompanyId]
  );

  return {
    driver,
    license,
    medical_card,
    drug_program,
    hos,
    current_assignment: {
      default_truck: mapTruck(defaultTruckRes.rows[0]),
      currently_driving_truck: mapTruck(currentTruckRes.rows[0], {
        samsara_logged_in_at: currentTruckRes.rows[0]?.samsara_logged_in_at ?? null,
      }),
      current_load: loadRes.rows[0] ?? null,
    },
  };
}
