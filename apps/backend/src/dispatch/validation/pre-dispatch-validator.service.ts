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
      FROM mdata.drivers d
      WHERE d.id = $1::uuid
        AND (d.operating_company_id = $2::uuid OR EXISTS (
          SELECT 1 FROM mdata.driver_company_authorizations predispatch_cdl_driver_dca
          WHERE predispatch_cdl_driver_dca.driver_id = d.id
            AND predispatch_cdl_driver_dca.company_id = $2::uuid
            AND predispatch_cdl_driver_dca.is_authorized = true
            AND predispatch_cdl_driver_dca.deactivated_at IS NULL
        ))
      LIMIT 1
    `,
    [driverUuid, operatingCompanyId]
  );

  const row = res.rows[0];
  if (!row) return [];

  const driverName = row.full_name ?? [row.first_name, row.last_name].filter(Boolean).join(" ") ?? "Driver";
  const items: ValidationItem[] = [];

  if (row.cdl_expires_at === null) {
    // Safety hard-stop: a CDL is a DOT requirement to operate a CMV. No expiry on
    // file = unverifiable qualification → BLOCK (was previously only a warning).
    items.push({
      rule_id: "WF-CDL-MISSING",
      severity: "block",
      message: `${driverName}: No CDL expiry date on file — CDL is a DOT requirement for dispatch.`,
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
        AND (d.operating_company_id = $2::uuid OR EXISTS (
          SELECT 1 FROM mdata.driver_company_authorizations predispatch_medical_driver_dca
          WHERE predispatch_medical_driver_dca.driver_id = d.id
            AND predispatch_medical_driver_dca.company_id = $2::uuid
            AND predispatch_medical_driver_dca.is_authorized = true
            AND predispatch_medical_driver_dca.deactivated_at IS NULL
        ))
      LIMIT 1
    `,
    [driverUuid, operatingCompanyId]
  );

  const row = res.rows[0];
  if (!row) return [];

  const driverName = row.full_name ?? [row.first_name, row.last_name].filter(Boolean).join(" ") ?? "Driver";

  if (row.expiry_date === null) {
    // Safety hard-stop: no DOT medical card on file (neither a safety.medical_cards
    // row nor mdata.drivers.dot_medical_expires_at) = unverifiable medical
    // qualification → BLOCK (was previously silently dropped as []).
    return [
      {
        rule_id: "WF-MED-CARD-MISSING",
        severity: "block",
        message: `${driverName}: No DOT medical card on file — required for dispatch.`,
        evidence: { driver_id: driverUuid },
      },
    ];
  }

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
      FROM mdata.drivers d
      WHERE d.id = $1::uuid
        AND (d.operating_company_id = $2::uuid OR EXISTS (
          SELECT 1 FROM mdata.driver_company_authorizations predispatch_active_driver_dca
          WHERE predispatch_active_driver_dca.driver_id = d.id
            AND predispatch_active_driver_dca.company_id = $2::uuid
            AND predispatch_active_driver_dca.is_authorized = true
            AND predispatch_active_driver_dca.deactivated_at IS NULL
        ))
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
    // ACCT-F5657 — driver_finance.recompute_driver_debt(uuid) returns a column named
    // total_active_debt (numeric, DOLLARS — db/migrations/202612471500_create_recompute_driver_debt.sql),
    // never total_debt_cents. Selecting a column that doesn't exist throws Postgres 42703 on every
    // call, which the catch{} below silently swallows as "best-effort" — so this GAP-14-DRIVER-DEBT
    // warning has never fired for any driver, at any debt level, since it shipped. Fixed the column
    // name AND the units mismatch this bug was masking: total_active_debt is dollars, not cents, so
    // it must be multiplied by 100 before comparing against DEBT_WARN_THRESHOLD_CENTS — a $1,500 debt
    // would otherwise have compared as 1500 cents ($15.00) even once the column name was corrected.
    const res = await client.query<{
      debt_cents: number | null;
    }>(
      `
        SELECT COALESCE(
          (SELECT ROUND(total_active_debt * 100)::bigint
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
  } catch (err) {
    // Debt check is best-effort; do not block dispatch on DB function failure. But a swallowed error
    // is indistinguishable from a passing control (this exact class of bug — a wrong column name —
    // hid silently behind this catch for as long as the check has existed), so at minimum surface it.
    console.warn("[GAP-14-DRIVER-DEBT] checkDriverDebt failed (best-effort, not blocking dispatch):", err);
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
  } catch (error) {
    // Do not turn a failed safety read into a clean validation result. This remains a warning (rather
    // than an invented hard block) so the existing role-gated dispatch policy is unchanged, while the
    // dispatcher can distinguish "HOS unavailable" from "HOS checked and clear".
    console.warn("[WF-HOS-UNAVAILABLE] checkDriverHos failed:", error);
    return [
      {
        rule_id: "WF-HOS-UNAVAILABLE",
        severity: "warn",
        message: "HOS clocks could not be verified. Confirm the driver's current clocks before dispatch.",
        evidence: {
          driver_id: driverUuid,
          operating_company_id: operatingCompanyId,
          validation_status: "unavailable",
        },
      },
    ];
  }

  return [];
}

// INS-SCHEDULE: Owner ruling 2026-08-31 — a driver not on the insurance policy schedule raises a
// WARNING (not a hard block). The dispatcher MUST explicitly confirm before booking. Every confirm
// is logged. Build on policy-schedule MEMBERSHIP (insurance.driver_schedule), NOT assigned_driver_id.
// Gated by feature flag INSURANCE_SCHEDULE_WARNING_ENABLED (default OFF, owner-gated).
async function checkDriverInsuranceSchedule(
  client: DbClient,
  driverUuid: string,
  operatingCompanyId: string
): Promise<ValidationItem[]> {
  const flagRes = await client.query<{ enabled: boolean }>(
    `SELECT COALESCE(
       (SELECT ffo.enabled FROM lib.feature_flag_overrides ffo
        WHERE ffo.flag_key = 'INSURANCE_SCHEDULE_WARNING_ENABLED' AND ffo.operating_company_id = $1::uuid LIMIT 1),
       (SELECT default_enabled FROM lib.feature_flags WHERE flag_key = 'INSURANCE_SCHEDULE_WARNING_ENABLED' LIMIT 1),
       false) AS enabled`,
    [operatingCompanyId]
  );
  if (flagRes.rows[0]?.enabled !== true) return [];

  const res = await client.query<{
    on_schedule: boolean; submitted_at: string | null; confirmed_by_insurer_at: string | null;
    full_name: string | null; first_name: string | null; last_name: string | null;
  }>(
    `SELECT EXISTS (
       SELECT 1 FROM insurance.driver_schedule ds
       WHERE ds.driver_id = $1::uuid AND ds.operating_company_id = $2::uuid
         AND ds.is_active = true AND ds.voided_at IS NULL) AS on_schedule,
     (SELECT ds.submitted_at::text FROM insurance.driver_schedule ds
      WHERE ds.driver_id = $1::uuid AND ds.operating_company_id = $2::uuid
        AND ds.is_active = true AND ds.voided_at IS NULL LIMIT 1) AS submitted_at,
     (SELECT ds.confirmed_by_insurer_at::text FROM insurance.driver_schedule ds
      WHERE ds.driver_id = $1::uuid AND ds.operating_company_id = $2::uuid
        AND ds.is_active = true AND ds.voided_at IS NULL LIMIT 1) AS confirmed_by_insurer_at,
     CONCAT_WS(' ', d.first_name, d.last_name) AS full_name, d.first_name, d.last_name
     FROM mdata.drivers d
     WHERE d.id = $1::uuid AND (d.operating_company_id = $2::uuid OR EXISTS (
       SELECT 1 FROM mdata.driver_company_authorizations dca
       WHERE dca.driver_id = d.id AND dca.company_id = $2::uuid
         AND dca.is_authorized = true AND dca.deactivated_at IS NULL)) LIMIT 1`,
    [driverUuid, operatingCompanyId]
  );
  const row = res.rows[0];
  if (!row || row.on_schedule) return [];

  const driverName = row.full_name ?? [row.first_name, row.last_name].filter(Boolean).join(" ") ?? "Driver";
  const parts = [`${driverName}: Driver is not on the insurance policy schedule.`];
  if (row.submitted_at && !row.confirmed_by_insurer_at) parts.push(`Submitted to insurer on ${row.submitted_at} — pending confirmation.`);
  else if (!row.submitted_at) parts.push(`Driver has not been submitted to the insurer yet — this is a setup workflow state, not a violation.`);
  parts.push(`The dispatcher MUST explicitly confirm before booking.`);

  return [{
    rule_id: "INS-SCHEDULE-NOT-ON-POLICY", severity: "warn", message: parts.join(" "),
    evidence: { driver_id: driverUuid, on_schedule: false, submitted_at: row.submitted_at, confirmed_by_insurer_at: row.confirmed_by_insurer_at, confirmation_required: true },
  }];
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
    is_oos: boolean;
  }>(
    `
      -- DISP-F01 — this was FROM views.units_with_dispatch_status v JOIN mdata.units u, and that view
      -- is a dead stub on prod: "SELECT NULL::uuid AS id, ... false AS is_dispatch_blocked ... WHERE
      -- false" — it returns ZERO rows for every unit, always. The INNER JOIN therefore produced no
      -- row, 'if (!unit) return []' fired, and this validator returned NO ITEMS AT ALL. Every gate it
      -- owns — OOS, WF-050 dispatch-block, PM-due — was silently disabled. 13 active OOS units
      -- (TRK-owned, leased to TRANSP) were dispatchable, verified on prod 2026-08-02.
      --
      -- The unit row now comes from mdata.units, which is the authority for is_oos, and the view is
      -- LEFT JOINed for its advisory columns. A dead or missing view degrades those advisories to
      -- false; it can no longer switch the OOS block off. quick-assign.service.ts already read is_oos
      -- this way, which is the only reason ONE of the three dispatch paths still blocked OOS units.
      --
      -- Scoping is lease-aware on purpose. mdata.units has NO operating_company_id (§4): it carries
      -- owner_company_id and currently_leased_to_company_id. The old filter v.operating_company_id
      -- could never have matched a TRK-owned unit leased to TRANSP even had the view been alive —
      -- which is exactly the population that is out of service.
      SELECT
        COALESCE(u.unit_number, v.display_id, u.id::text) AS display_id,
        COALESCE(v.is_dispatch_blocked, false) AS is_dispatch_blocked,
        v.dispatch_block_reason,
        COALESCE(v.has_open_pm_due_wo, false) AS has_open_pm_due_wo,
        COALESCE(v.open_wo_count, 0) AS open_wo_count,
        COALESCE(u.is_oos, false) AS is_oos
      FROM mdata.units u
      LEFT JOIN views.units_with_dispatch_status v ON v.id = u.id
      WHERE u.id = $1::uuid
        AND COALESCE(u.currently_leased_to_company_id, u.owner_company_id) = $2::uuid
      LIMIT 1
    `,
    [unitUuid, operatingCompanyId]
  );

  const unit = res.rows[0];
  if (!unit) return [];

  const items: ValidationItem[] = [];

  // 0441-mod2: OOS is the same severity class as WF-050 dispatch-blocked.
  if (unit.is_oos) {
    items.push({
      rule_id: "UNIT-OOS",
      severity: "block",
      message: `Unit ${unit.display_id ?? unitUuid} is out of service (OOS) and cannot be assigned.`,
      evidence: {
        unit_id: unitUuid,
        unit_display_id: unit.display_id,
        is_oos: true,
      },
    });
  }

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
        customer_name
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

type NamedCheck = {
  name: string;
  run: (client: DbClient) => Promise<ValidationItem[]>;
};

/**
 * Run ONE check on its OWN pooled connection + transaction. Previously all checks
 * shared a single client/transaction: a single query failure (e.g. a phantom column,
 * an RLS 42501, or a 25P02 abort) could poison the whole transaction, and because the
 * caller only read `status === "fulfilled"` results, a thrown check was silently
 * dropped and the gate reported `can_dispatch: true`. Isolating each check on its own
 * connection means one query's failure can never abort a sibling's transaction, and a
 * rejection is surfaced (fail-closed) by the caller rather than swallowed.
 */
async function runIsolatedCheck(
  requestingUserUuid: string,
  fn: (client: DbClient) => Promise<ValidationItem[]>
): Promise<ValidationItem[]> {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query(
      `SELECT set_config('app.current_user_id', $1::text, true)`,
      [requestingUserUuid]
    );
    const items = await fn(client);
    await client.query("COMMIT");
    return items;
  } catch (err) {
    await client.query("ROLLBACK").catch(() => {});
    throw err;
  } finally {
    client.release();
  }
}

export async function validatePreDispatch(
  input: PreDispatchValidationInput
): Promise<PreDispatchValidationResult> {
  const blockers: ValidationItem[] = [];
  const warnings: ValidationItem[] = [];
  const info: ValidationItem[] = [];

  const checks: NamedCheck[] = [];
  if (input.driver_uuid) {
    const driverUuid = input.driver_uuid;
    checks.push({ name: "driver_active", run: (c) => checkDriverActive(c, driverUuid, input.operating_company_id) });
    checks.push({ name: "driver_cdl", run: (c) => checkDriverCdl(c, driverUuid, input.operating_company_id) });
    checks.push({ name: "driver_medical_card", run: (c) => checkDriverMedicalCard(c, driverUuid, input.operating_company_id) });
    checks.push({ name: "driver_debt", run: (c) => checkDriverDebt(c, driverUuid, input.operating_company_id) });
    checks.push({ name: "driver_hos", run: (c) => checkDriverHos(c, driverUuid, input.operating_company_id) });
    checks.push({ name: "driver_insurance_schedule", run: (c) => checkDriverInsuranceSchedule(c, driverUuid, input.operating_company_id) });
  }
  if (input.unit_uuid) {
    const unitUuid = input.unit_uuid;
    checks.push({ name: "unit_oos", run: (c) => checkUnitOos(c, unitUuid, input.operating_company_id) });
  }
  if (input.customer_id) {
    const customerId = input.customer_id;
    checks.push({ name: "fmcsa_cache", run: (c) => checkFmcsaCache(c, customerId, input.operating_company_id) });
  }

  const results = await Promise.allSettled(
    checks.map((chk) => runIsolatedCheck(input.requesting_user_uuid, chk.run))
  );

  for (let i = 0; i < results.length; i++) {
    const result = results[i];
    const chk = checks[i];
    if (result.status === "fulfilled") {
      for (const item of result.value) {
        if (item.severity === "block") blockers.push(item);
        else if (item.severity === "warn") warnings.push(item);
        else info.push(item);
      }
    } else {
      // FAIL-CLOSED: a check that THREW must NEVER be silently dropped. An
      // unverifiable safety check becomes a synthetic hard blocker so the gate
      // errs toward NOT dispatching instead of reporting can_dispatch: true.
      const reason = result.reason instanceof Error ? result.reason.message : String(result.reason);
      blockers.push({
        rule_id: "WF-PREDISPATCH-CHECK-FAILED",
        severity: "block",
        message: `Pre-dispatch safety check "${chk.name}" could not be verified: ${reason}. Dispatch blocked (fail-closed).`,
        evidence: { check: chk.name, error: reason },
      });
    }
  }

  return {
    blockers,
    warnings,
    info,
    can_dispatch: blockers.length === 0,
  };
}
