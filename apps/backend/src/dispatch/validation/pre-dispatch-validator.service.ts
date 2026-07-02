import { pool } from "../../auth/db.js";
import { getCurrentClocks } from "../../telematics/hos-clocks.service.js";

// GAP-14: Pre-Dispatch Validation — read-only, no financial writes.

export const DEBT_WARN_THRESHOLD_CENTS = 50_000; // $500.00
export const FMCSA_STALE_HOURS = 24;
export const MEDICAL_CARD_WARN_DAYS = 30;
export const CDL_WARN_DAYS = 30;
// HOS: warn below 2 hours (120 min) of drive time remaining
export const HOS_DRIVE_MIN_THRESHOLD = 120;

export type ValidationSeverity = "block" | "warn" | "info";

export type ValidationItem = {
  rule_id: string;
  severity: ValidationSeverity;
  message: string;
  evidence: Record<string, unknown>;
};

export type PreDispatchValidationResult = {
  blockers: ValidationItem[];
  warnings: ValidationItem[];
  info: ValidationItem[];
  can_dispatch: boolean;
};

export type PreDispatchValidationInput = {
  operating_company_id: string;
  driver_uuid?: string | null;
  unit_uuid?: string | null;
  trailer_uuid?: string | null;
  customer_id?: string | null;
  requesting_user_uuid: string;
};

type DbClient = {
  query: <T = Record<string, unknown>>(sql: string, values?: unknown[]) => Promise<{ rows: T[] }>;
};

async function checkDriverCdl(
  client: DbClient,
  driverUuid: string,
  operatingCompanyId: string
): Promise<ValidationItem[]> {
  const res = await client.query<{
    cdl_expires_at: string | null;
    days_until_expiry: number | null;
    full_name: string | null;
    first_name: string | null;
    last_name: string | null;
  }>(
    `
      SELECT
        cdl_expires_at::text,
        (cdl_expires_at - CURRENT_DATE)::int AS days_until_expiry,
        CONCAT_WS(' ', first_name, last_name) AS full_name,
        first_name,
        last_name
      FROM mdata.drivers
      WHERE id = $1::uuid
        AND operating_company_id = $2::uuid
      LIMIT 1
    `,
    [driverUuid, operatingCompanyId]
  );

  const row = res.rows[0];
  if (!row) return [];

  const driverName = row.full_name ?? [row.first_name, row.last_name].filter(Boolean).join(" ") ?? "Driver";
  const items: ValidationItem[] = [];

  if (row.cdl_expires_at === null) {
    items.push({
      rule_id: "WF-CDL-MISSING",
      severity: "warn",
      message: `${driverName}: No CDL expiry date on file.`,
      evidence: { driver_id: driverUuid },
    });
    return items;
  }

  const days = Number(row.days_until_expiry ?? 0);

  if (days < 0) {
    items.push({
      rule_id: "WF-CDL-EXPIRED",
      severity: "block",
      message: `${driverName}: CDL expired ${Math.abs(days)} day(s) ago (${row.cdl_expires_at}).`,
      evidence: { driver_id: driverUuid, cdl_expires_at: row.cdl_expires_at, days_until_expiry: days },
    });
  } else if (days <= CDL_WARN_DAYS) {
    items.push({
      rule_id: "WF-CDL-EXPIRING",
      severity: "warn",
      message: `${driverName}: CDL expires in ${days} day(s) on ${row.cdl_expires_at}.`,
      evidence: { driver_id: driverUuid, cdl_expires_at: row.cdl_expires_at, days_until_expiry: days },
    });
  }

  return items;
}

async function checkDriverMedicalCard(
  client: DbClient,
  driverUuid: string,
  operatingCompanyId: string
): Promise<ValidationItem[]> {
  const res = await client.query<{
    expiry_date: string | null;
    days_until_expiry: number | null;
    full_name: string | null;
    first_name: string | null;
    last_name: string | null;
  }>(
    `
      SELECT
        COALESCE(mc.expiry_date, d.dot_medical_expires_at)::text AS expiry_date,
        (COALESCE(mc.expiry_date, d.dot_medical_expires_at) - CURRENT_DATE)::int AS days_until_expiry,
        CONCAT_WS(' ', d.first_name, d.last_name) AS full_name,
        d.first_name,
        d.last_name
      FROM mdata.drivers d
      LEFT JOIN LATERAL (
        SELECT id, expiry_date
        FROM safety.medical_cards
        WHERE driver_id = d.id
          AND operating_company_id = $2::uuid
          AND voided_at IS NULL
        ORDER BY expiry_date DESC
        LIMIT 1
      ) mc ON true
      WHERE d.id = $1::uuid
        AND d.operating_company_id = $2::uuid
      LIMIT 1
    `,
    [driverUuid, operatingCompanyId]
  );

  const row = res.rows[0];
  if (!row || row.expiry_date === null) return [];

  const driverName = row.full_name ?? [row.first_name, row.last_name].filter(Boolean).join(" ") ?? "Driver";
  const days = Number(row.days_until_expiry ?? 0);
  const items: ValidationItem[] = [];

  if (days < 0) {
    items.push({
      rule_id: "WF-MED-CARD-EXPIRED",
      severity: "block",
      message: `${driverName}: DOT medical card expired ${Math.abs(days)} day(s) ago (${row.expiry_date}).`,
      evidence: { driver_id: driverUuid, expiry_date: row.expiry_date, days_until_expiry: days },
    });
  } else if (days <= MEDICAL_CARD_WARN_DAYS) {
    items.push({
      rule_id: "WF-MED-CARD-EXPIRING",
      severity: "warn",
      message: `${driverName}: DOT medical card expires in ${days} day(s) on ${row.expiry_date}.`,
      evidence: { driver_id: driverUuid, expiry_date: row.expiry_date, days_until_expiry: days },
    });
  }

  return items;
}

async function checkDriverActive(
  client: DbClient,
  driverUuid: string,
  operatingCompanyId: string
): Promise<ValidationItem[]> {
  const res = await client.query<{
    deactivated_at: string | null;
    full_name: string | null;
    first_name: string | null;
    last_name: string | null;
  }>(
    `
      SELECT
        deactivated_at::text,
        CONCAT_WS(' ', first_name, last_name) AS full_name,
        first_name,
        last_name
      FROM mdata.drivers
      WHERE id = $1::uuid
        AND operating_company_id = $2::uuid
      LIMIT 1
    `,
    [driverUuid, operatingCompanyId]
  );

  const row = res.rows[0];
  if (!row) return [];

  if (row.deactivated_at) {
    const driverName = row.full_name ?? [row.first_name, row.last_name].filter(Boolean).join(" ") ?? "Driver";
    return [
      {
        rule_id: "WF-038-DRIVER-INACTIVE",
        severity: "block",
        message: `${driverName}: Driver is inactive (deactivated ${row.deactivated_at.slice(0, 10)}).`,
        evidence: { driver_id: driverUuid, deactivated_at: row.deactivated_at },
      },
    ];
  }

  return [];
}

async function checkDriverDebt(
  client: DbClient,
  driverUuid: string,
  operatingCompanyId: string
): Promise<ValidationItem[]> {
  try {
    const res = await client.query<{
      debt_cents: number | null;
    }>(
      `
        SELECT COALESCE(
          (SELECT total_debt_cents::bigint
           FROM driver_finance.recompute_driver_debt($1::uuid)
           LIMIT 1),
          0
        ) AS debt_cents
      `,
      [driverUuid]
    );

    const row = res.rows[0];
    const debtCents = Number(row?.debt_cents ?? 0);

    if (debtCents > DEBT_WARN_THRESHOLD_CENTS) {
      const debtDollars = (debtCents / 100).toFixed(2);
      return [
        {
          rule_id: "GAP-14-DRIVER-DEBT",
          severity: "warn",
          message: `Driver has outstanding debt of $${debtDollars} (threshold: $${(DEBT_WARN_THRESHOLD_CENTS / 100).toFixed(2)}).`,
          evidence: { driver_id: driverUuid, debt_cents: debtCents, threshold_cents: DEBT_WARN_THRESHOLD_CENTS },
        },
      ];
    }
  } catch {
    // Debt check is best-effort; do not block dispatch on DB function failure.
  }

  return [];
}

async function checkDriverHos(
  client: DbClient,
  driverUuid: string,
  operatingCompanyId: string
): Promise<ValidationItem[]> {
  try {
    const clocks = await getCurrentClocks(client, operatingCompanyId, driverUuid);

    if (clocks.status === "violation") {
      return [
        {
          rule_id: "WF-HOS-VIOLATION",
          severity: "block",
          message: `Driver is currently in an HOS violation. Drive remaining: ${clocks.drive_remaining_min} min, window remaining: ${clocks.window_remaining_min} min.`,
          evidence: {
            driver_id: driverUuid,
            drive_remaining_min: clocks.drive_remaining_min,
            window_remaining_min: clocks.window_remaining_min,
            cycle_remaining_min: clocks.cycle_remaining_min,
            hos_status: clocks.status,
          },
        },
      ];
    }

    if (clocks.drive_remaining_min < HOS_DRIVE_MIN_THRESHOLD) {
      return [
        {
          rule_id: "WF-HOS-LOW",
          severity: "block",
          message: `Driver has insufficient drive time remaining (${clocks.drive_remaining_min} min). Minimum required: ${HOS_DRIVE_MIN_THRESHOLD} min.`,
          evidence: {
            driver_id: driverUuid,
            drive_remaining_min: clocks.drive_remaining_min,
            window_remaining_min: clocks.window_remaining_min,
            hos_status: clocks.status,
          },
        },
      ];
    }
  } catch {
    // HOS data unavailable — skip silently.
  }

  return [];
}

async function checkUnitOos(
  client: DbClient,
  unitUuid: string,
  operatingCompanyId: string
): Promise<ValidationItem[]> {
  const res = await client.query<{
    display_id: string | null;
    is_dispatch_blocked: boolean;
    dispatch_block_reason: string | null;
    has_open_pm_due_wo: boolean;
    open_wo_count: number;
  }>(
    `
      SELECT
        display_id,
        COALESCE(is_dispatch_blocked, false) AS is_dispatch_blocked,
        dispatch_block_reason,
        COALESCE(has_open_pm_due_wo, false) AS has_open_pm_due_wo,
        COALESCE(open_wo_count, 0) AS open_wo_count
      FROM views.units_with_dispatch_status
      WHERE id = $1::uuid
        AND operating_company_id = $2::uuid
      LIMIT 1
    `,
    [unitUuid, operatingCompanyId]
  );

  const unit = res.rows[0];
  if (!unit) return [];

  const items: ValidationItem[] = [];

  if (unit.is_dispatch_blocked) {
    items.push({
      rule_id: "WF-050-DVIR-MAJOR",
      severity: "block",
      message: `Unit ${unit.display_id ?? unitUuid} is dispatch-blocked: ${unit.dispatch_block_reason ?? "Major defect reported on DVIR."}`,
      evidence: {
        unit_id: unitUuid,
        unit_display_id: unit.display_id,
        block_reason: unit.dispatch_block_reason,
      },
    });
  } else if (unit.has_open_pm_due_wo) {
    items.push({
      rule_id: "WF-044-PM-DUE",
      severity: "warn",
      message: `Unit ${unit.display_id ?? unitUuid} has ${unit.open_wo_count} open PM-due work order(s).`,
      evidence: {
        unit_id: unitUuid,
        unit_display_id: unit.display_id,
        open_wo_count: unit.open_wo_count,
      },
    });
  }

  return items;
}

async function checkFmcsaCache(
  client: DbClient,
  customerId: string,
  operatingCompanyId: string
): Promise<ValidationItem[]> {
  const res = await client.query<{
    mc_number: string | null;
    dot_number: string | null;
    safer_verified_at: string | null;
    customer_name: string | null;
  }>(
    `
      SELECT
        mc_number,
        dot_number,
        safer_verified_at::text,
        display_name AS customer_name
      FROM mdata.customers
      WHERE id = $1::uuid
        AND operating_company_id = $2::uuid
      LIMIT 1
    `,
    [customerId, operatingCompanyId]
  );

  const row = res.rows[0];
  if (!row) return [];

  if (!row.mc_number && !row.dot_number) {
    return [
      {
        rule_id: "GAP-14-FMCSA-NO-NUMBER",
        severity: "warn",
        message: `Customer "${row.customer_name ?? customerId}" has no MC# or DOT# for FMCSA verification.`,
        evidence: { customer_id: customerId },
      },
    ];
  }

  if (!row.safer_verified_at) {
    return [
      {
        rule_id: "GAP-14-FMCSA-NEVER-VERIFIED",
        severity: "warn",
        message: `Customer FMCSA authority has never been verified. Run FMCSA check before dispatching.`,
        evidence: { customer_id: customerId, mc_number: row.mc_number, dot_number: row.dot_number },
      },
    ];
  }

  const ageMs = Date.now() - Date.parse(row.safer_verified_at);
  const ageHours = ageMs / (1000 * 60 * 60);

  if (ageHours > FMCSA_STALE_HOURS) {
    return [
      {
        rule_id: "GAP-14-FMCSA-STALE",
        severity: "warn",
        message: `Customer FMCSA cache is ${Math.round(ageHours)} hours old (threshold: ${FMCSA_STALE_HOURS}h). Last verified: ${row.safer_verified_at.slice(0, 19)} UTC.`,
        evidence: {
          customer_id: customerId,
          safer_verified_at: row.safer_verified_at,
          age_hours: Math.round(ageHours),
          threshold_hours: FMCSA_STALE_HOURS,
        },
      },
    ];
  }

  return [];
}

export async function validatePreDispatch(
  input: PreDispatchValidationInput
): Promise<PreDispatchValidationResult> {
  const blockers: ValidationItem[] = [];
  const warnings: ValidationItem[] = [];
  const info: ValidationItem[] = [];

  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query(
      `SELECT set_config('app.current_user_id', $1::text, true)`,
      [input.requesting_user_uuid]
    );

    const checkResults = await Promise.allSettled([
      input.driver_uuid
        ? checkDriverActive(client, input.driver_uuid, input.operating_company_id)
        : Promise.resolve([]),
      input.driver_uuid
        ? checkDriverCdl(client, input.driver_uuid, input.operating_company_id)
        : Promise.resolve([]),
      input.driver_uuid
        ? checkDriverMedicalCard(client, input.driver_uuid, input.operating_company_id)
        : Promise.resolve([]),
      input.driver_uuid
        ? checkDriverDebt(client, input.driver_uuid, input.operating_company_id)
        : Promise.resolve([]),
      input.driver_uuid
        ? checkDriverHos(client, input.driver_uuid, input.operating_company_id)
        : Promise.resolve([]),
      input.unit_uuid
        ? checkUnitOos(client, input.unit_uuid, input.operating_company_id)
        : Promise.resolve([]),
      input.customer_id
        ? checkFmcsaCache(client, input.customer_id, input.operating_company_id)
        : Promise.resolve([]),
    ]);

    await client.query("COMMIT");

    for (const result of checkResults) {
      if (result.status === "fulfilled") {
        for (const item of result.value) {
          if (item.severity === "block") blockers.push(item);
          else if (item.severity === "warn") warnings.push(item);
          else info.push(item);
        }
      }
    }
  } catch (err) {
    await client.query("ROLLBACK").catch(() => {});
    throw err;
  } finally {
    client.release();
  }

  return {
    blockers,
    warnings,
    info,
    can_dispatch: blockers.length === 0,
  };
}
