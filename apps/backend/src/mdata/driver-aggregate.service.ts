import { withSavepoint } from "../auth/db.js";
import { computeDriverScoreFromCounts } from "../safety/driver-scoring.service.js";
import { getCurrentClocks, type HosDutyStatus } from "../telematics/hos-clocks.service.js";
import { loadDriverReferenceFkEnrichment } from "./driver-reference-fk.service.js";

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

  const referenceFk = await loadDriverReferenceFkEnrichment(client, driverId);
  const cdlExpiration = driver.cdl_expires_at as string | null;
  const license = {
    cdl_number: driver.cdl_number,
    class: referenceFk.license_class_code ?? driver.cdl_class,
    class_label: referenceFk.license_class_label,
    license_class_id: driver.license_class_id ?? null,
    state: driver.cdl_state,
    expiration: cdlExpiration,
    days_until_expiration: daysUntil(cdlExpiration),
    restrictions: referenceFk.restriction_codes.length > 0 ? referenceFk.restriction_codes.join(", ") : driver.cdl_restrictions,
    restriction_codes: referenceFk.restriction_codes,
    endorsements: {
      h: Boolean(driver.endorsement_h),
      n: Boolean(driver.endorsement_n),
      p: Boolean(driver.endorsement_p),
      s: Boolean(driver.endorsement_s),
      t: Boolean(driver.endorsement_t),
      x: Boolean(driver.endorsement_x),
    },
    endorsement_codes: referenceFk.endorsement_codes,
    driver_employment_status_code: referenceFk.driver_employment_status_code,
    driver_employment_status_label: referenceFk.driver_employment_status_label,
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
    status_code: referenceFk.medical_card_status_code,
    status_label: referenceFk.medical_card_status_label,
    medical_card_status_id: driver.medical_card_status_id ?? null,
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

  let performance_scorecard: Record<string, unknown> | null = null;
  try {
    const perfRes = await withSavepoint(
      client,
      "driver_agg_perf",
      () =>
        client.query<{
          total_events: number;
          harsh_braking: number;
          speeding: number;
          distracted: number;
          critical_count: number;
          major_count: number;
          minor_count: number;
        }>(
          `
            SELECT
              COUNT(*)::int AS total_events,
              COUNT(*) FILTER (WHERE event_kind IN ('harsh_brake','harsh_accel','harsh_turn'))::int AS harsh_braking,
              COUNT(*) FILTER (WHERE event_kind = 'speeding')::int AS speeding,
              COUNT(*) FILTER (WHERE event_kind IN ('distracted','mobile_use'))::int AS distracted,
              COUNT(*) FILTER (WHERE severity = 'critical')::int AS critical_count,
              COUNT(*) FILTER (WHERE severity = 'major')::int AS major_count,
              COUNT(*) FILTER (WHERE severity = 'minor')::int AS minor_count
            FROM safety.harsh_events
            WHERE operating_company_id = $2::uuid
              AND driver_id = $1::uuid
              AND event_at >= (now() - interval '30 days')
          `,
          [driverId, operatingCompanyId]
        ),
      { rows: [] as Array<Record<string, unknown>> }
    );
    const perf = perfRes.rows[0];
    if (perf) {
      const scoreResult = computeDriverScoreFromCounts({
        counts: {
          critical: Number(perf.critical_count ?? 0),
          major: Number(perf.major_count ?? 0),
          minor: Number(perf.minor_count ?? 0),
        },
        periodMiles: null,
      });
      const fleetRes = await client.query<{ avg_score: string; rank: string }>(
        `
          WITH scored AS (
            SELECT
              e.driver_id,
              GREATEST(
                0,
                100
                  - COUNT(*) FILTER (WHERE e.severity = 'critical') * 10
                  - COUNT(*) FILTER (WHERE e.severity = 'major') * 5
                  - COUNT(*) FILTER (WHERE e.severity = 'minor') * 1
              )::int AS score
            FROM safety.harsh_events e
            WHERE e.operating_company_id = $1::uuid
              AND e.driver_id IS NOT NULL
              AND e.event_at >= (now() - interval '30 days')
            GROUP BY e.driver_id
          )
          SELECT
            COALESCE(AVG(score), 0)::numeric(10,2)::text AS avg_score,
            COALESCE(
              (
                SELECT COUNT(*) + 1
                FROM scored s2
                WHERE s2.score > COALESCE((SELECT score FROM scored WHERE driver_id = $2::uuid), 0)
              ),
              1
            )::text AS rank
          FROM scored
        `,
        [operatingCompanyId, driverId]
      );
      performance_scorecard = {
        period: "last_30_days",
        total_events: Number(perf.total_events ?? 0),
        harsh_braking: Number(perf.harsh_braking ?? 0),
        speeding: Number(perf.speeding ?? 0),
        distracted: Number(perf.distracted ?? 0),
        score: scoreResult.score,
        fleet_avg_score: Number(fleetRes.rows[0]?.avg_score ?? 0),
        rank_in_fleet: Number(fleetRes.rows[0]?.rank ?? 1),
      };
    }
  } catch {
    performance_scorecard = null;
  }

  const settlementsRes = await withSavepoint(
    client,
    "driver_agg_settlements",
    () =>
      client.query(
        `
          WITH ytd AS (
            SELECT
              COALESCE(SUM(gross_cents), 0)::bigint AS ytd_gross,
              COALESCE(SUM(deductions_cents), 0)::bigint AS ytd_deductions,
              COALESCE(SUM(net_cents), 0)::bigint AS ytd_net
            FROM payroll.driver_settlements
            WHERE driver_id = $1::uuid
              AND operating_company_id = $2::uuid
              AND pay_period_end >= date_trunc('year', CURRENT_DATE)::date
              AND status <> 'void'
          ),
          lifetime AS (
            SELECT COALESCE(SUM(net_cents), 0)::bigint AS lifetime_with_company
            FROM payroll.driver_settlements
            WHERE driver_id = $1::uuid
              AND operating_company_id = $2::uuid
              AND status <> 'void'
          ),
          weeks AS (
            SELECT
              pay_period_end::text AS week_ending,
              gross_cents::bigint AS gross,
              net_cents::bigint AS net
            FROM payroll.driver_settlements
            WHERE driver_id = $1::uuid
              AND operating_company_id = $2::uuid
              AND status <> 'void'
            ORDER BY pay_period_end DESC
            LIMIT 4
          )
          SELECT
            (SELECT ytd_gross FROM ytd) AS ytd_gross,
            (SELECT ytd_deductions FROM ytd) AS ytd_deductions,
            (SELECT ytd_net FROM ytd) AS ytd_net,
            (SELECT lifetime_with_company FROM lifetime) AS lifetime_with_company,
            COALESCE((SELECT json_agg(w ORDER BY w.week_ending DESC) FROM weeks w), '[]'::json) AS last_4_weeks
        `,
        [driverId, operatingCompanyId]
      ),
    { rows: [{ ytd_gross: 0, ytd_deductions: 0, ytd_net: 0, lifetime_with_company: 0, last_4_weeks: [] }] }
  );
  const settlementRow = settlementsRes.rows[0] ?? {};
  const settlements = {
    ytd_gross: Number(settlementRow.ytd_gross ?? 0),
    ytd_deductions: Number(settlementRow.ytd_deductions ?? 0),
    ytd_net: Number(settlementRow.ytd_net ?? 0),
    last_4_weeks: settlementRow.last_4_weeks ?? [],
    lifetime_with_company: Number(settlementRow.lifetime_with_company ?? 0),
  };

  const trainingRes = await withSavepoint(
    client,
    "driver_agg_training",
    () =>
      client.query(
        `
          SELECT
            training_name AS type,
            completed_at::text AS completion_date,
            expiry_date::text AS expiration_date,
            notes AS certificate_url
          FROM safety.training_records
          WHERE driver_id = $1::uuid
            AND operating_company_id = $2::uuid
            AND voided_at IS NULL
          ORDER BY completed_at DESC
          LIMIT 50
        `,
        [driverId, operatingCompanyId]
      ),
    { rows: [] as Array<Record<string, unknown>> }
  );
  const training_records = trainingRes.rows.map((row) => {
    const days = daysUntil(row.expiration_date as string | null);
    let status: "green" | "yellow" | "red" | "gray" = complianceColor(days);
    return { ...row, status };
  });

  const fastExp = driver.fast_card_expiration as string | null;
  const sentriExp = driver.sentri_expiration as string | null;
  const twicExp = driver.twic_expiration as string | null;
  const passportExp = (driver.passport_expires_at as string | null) ?? null;
  const mxLicExp = driver.mexican_license_expiration as string | null;
  const border_credentials = {
    fast_card: {
      number: driver.fast_card_number ?? null,
      expiration: fastExp,
      days_until: daysUntil(fastExp),
    },
    sentri: { member: Boolean(driver.sentri_member), expiration: sentriExp },
    twic: { number: driver.twic_card_number ?? null, expiration: twicExp },
    passport: {
      number: driver.passport_number ?? null,
      country: driver.passport_country ?? null,
      expiration: passportExp,
    },
    mexican_license: { number: driver.mexican_license_number ?? null, expiration: mxLicExp },
    visa_b1: { status: driver.visa_b1_status ?? driver.visa_type ?? null },
  };

  const documentsRes = await withSavepoint(
    client,
    "driver_agg_docs",
    () =>
      client.query(
        `
          SELECT
            f.id::text AS file_id,
            f.original_filename AS name,
            fc.code AS category,
            f.expiration_date::text AS expiration_date,
            f.created_at::text AS uploaded_at,
            f.r2_key AS url
          FROM docs.file_links fl
          JOIN docs.files f ON f.id = fl.file_id
          LEFT JOIN catalogs.file_categories fc ON fc.id = f.category_id
          WHERE fl.entity_type = 'driver'
            AND fl.entity_id = $1::uuid
            AND fl.deleted_at IS NULL
            AND f.deleted_at IS NULL
            AND f.upload_completed_at IS NOT NULL
            AND f.operating_company_id = $2::uuid
          ORDER BY f.created_at DESC
        `,
        [driverId, operatingCompanyId]
      ),
    { rows: [] as Array<Record<string, unknown>> }
  );

  // W-8BEN — IRS foreign-status certificate (B-1 drivers). At-hire capture + yearly renewal
  // (IH35 policy) surfaced against the latest active certificate. Degrades gracefully if the
  // table is absent (pre-migration branch copy).
  const w8benRes = await withSavepoint(
    client,
    "driver_agg_w8ben",
    () =>
      client.query(
        `
          SELECT
            id::text,
            full_legal_name,
            country_of_citizenship,
            foreign_tin,
            us_tin,
            date_of_birth::text,
            certification_name,
            signed_date::text,
            irs_expiration_date::text
          FROM safety.driver_w8ben
          WHERE driver_id = $1::uuid
            AND operating_company_id = $2::uuid
            AND voided_at IS NULL
          ORDER BY signed_date DESC, created_at DESC
          LIMIT 1
        `,
        [driverId, operatingCompanyId]
      ),
    { rows: [] as Array<Record<string, unknown>> }
  );
  const w8benRow = w8benRes.rows[0] ?? null;
  let w8ben: Record<string, unknown>;
  if (w8benRow) {
    const signed = String(w8benRow.signed_date);
    // IH35 policy = renew yearly → renewal is due 1 year after signing.
    const renewalDue = signed ? `${Number(signed.slice(0, 4)) + 1}${signed.slice(4)}` : null;
    const renewalDays = daysUntil(renewalDue);
    // "expiring" once inside the 60-day pre-renewal window (or already past due).
    const status = renewalDays !== null && renewalDays <= 60 ? "expiring" : "on_file";
    w8ben = {
      status,
      on_file: true,
      ...w8benRow,
      renewal_due_date: renewalDue,
      renewal_days_until: renewalDays,
      color_status: complianceColor(renewalDays),
    };
  } else {
    w8ben = { status: "missing", on_file: false, color_status: "red" };
  }

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
    performance_scorecard,
    settlements,
    training_records,
    border_credentials,
    w8ben,
    documents: documentsRes.rows,
  };
}
