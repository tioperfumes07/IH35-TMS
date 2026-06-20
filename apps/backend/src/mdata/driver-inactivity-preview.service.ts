// Driver 21-day inactivity sweep — READ / PREVIEW ONLY. Writes NOTHING.
//
// Goal: surface every active driver who hasn't logged into the app in > 21 days, so Jorge can approve the exact
// list BEFORE any deactivation. Login time is NOT on mdata.drivers — it lives on the auth user
// (identity.users.last_login_at, populated on session create), joined via mdata.drivers.identity_user_id.
//
// The actual deactivation (status='Inactive' + deactivated_at) is a SEPARATE, Jorge-approved Tier-1 mass write —
// NOT here. This file has no INSERT/UPDATE/DELETE.
import type { PoolClient } from "pg";

export const INACTIVITY_THRESHOLD_DAYS = 21;

export type InactivityBucket = "OVER_21" | "UNDER_21" | "NEVER_LOGGED_IN" | "NO_LOGIN_ACCOUNT";
export type InactivityRow = {
  driver_id: string;
  driver_name: string;
  identity_user_id: string | null;
  last_login_at: string | null;
  days_since_login: number | null;
  bucket: InactivityBucket;
};
export type InactivityPreview = {
  operating_company_id: string;
  generated_at: string;
  threshold_days: number;
  timezone: string;
  active_drivers: number;
  counts: Record<InactivityBucket, number>;
  rows: InactivityRow[];
};

/** Read-only: bucket every Active driver by app-login recency. No DB writes. The OVER_21 set is the candidate
 *  deactivation list Jorge reviews; the write is a separate approved step. */
export async function previewDriverInactivity(client: PoolClient, operatingCompanyId: string): Promise<InactivityPreview> {
  // days_since_login + over_21 computed in SQL so the boundary is exact (elapsed time from last successful login).
  // Calendar-day vs elapsed-day semantics is an open question Jorge confirms before the write.
  const res = await client.query(
    `SELECT d.id::text AS driver_id,
            trim(coalesce(d.first_name,'') || ' ' || coalesce(d.last_name,'')) AS driver_name,
            d.identity_user_id::text AS identity_user_id,
            u.last_login_at::text AS last_login_at,
            CASE WHEN u.last_login_at IS NOT NULL
                 THEN floor(EXTRACT(EPOCH FROM (now() - u.last_login_at)) / 86400.0)::int
                 ELSE NULL END AS days_since_login,
            (u.last_login_at IS NOT NULL AND u.last_login_at < now() - ($2 || ' days')::interval) AS over_21
       FROM mdata.drivers d
       LEFT JOIN identity.users u ON u.id = d.identity_user_id
      WHERE d.operating_company_id = $1::uuid AND d.deactivated_at IS NULL AND d.status = 'Active'
      ORDER BY u.last_login_at ASC NULLS FIRST`,
    [operatingCompanyId, INACTIVITY_THRESHOLD_DAYS]
  );

  const counts: Record<InactivityBucket, number> = { OVER_21: 0, UNDER_21: 0, NEVER_LOGGED_IN: 0, NO_LOGIN_ACCOUNT: 0 };
  const rows: InactivityRow[] = res.rows.map((r: Record<string, unknown>) => {
    let bucket: InactivityBucket;
    if (!r.identity_user_id) bucket = "NO_LOGIN_ACCOUNT"; // no login account — cannot be measured by login
    else if (r.last_login_at == null) bucket = "NEVER_LOGGED_IN"; // has account, never logged in
    else if (r.over_21 === true) bucket = "OVER_21";
    else bucket = "UNDER_21";
    counts[bucket] += 1;
    return {
      driver_id: r.driver_id as string,
      driver_name: (r.driver_name as string) || "—",
      identity_user_id: (r.identity_user_id as string) || null,
      last_login_at: (r.last_login_at as string) || null,
      days_since_login: r.days_since_login == null ? null : Number(r.days_since_login),
      bucket,
    };
  });

  return {
    operating_company_id: operatingCompanyId,
    generated_at: new Date().toISOString(),
    threshold_days: INACTIVITY_THRESHOLD_DAYS,
    timezone: "America/Chicago",
    active_drivers: rows.length,
    counts,
    rows,
  };
}

// ─── DRIVING-based inactivity (THE sweep — Jorge's rule is "has not DRIVEN in 21 days") ──────────────────────
// "Driven" = had a vehicle_driver_assignment (paired to a truck). last_drove_at = MAX(COALESCE(ended_at,
// started_at)) over a driver's assignments; an OPEN assignment (ended_at IS NULL) = currently driving = never
// inactive. Login is NOT the signal (87/91 drivers have no login account). Still READ-ONLY; the deactivation is
// a separate Jorge-approved step.
export type DrivingBucket = "CURRENTLY_DRIVING" | "DROVE_WITHIN_21" | "OVER_21_DAYS" | "NEVER_ON_RECORD";
export type DrivingInactivityRow = {
  driver_id: string;
  driver_name: string;
  last_drove_at: string | null;
  days_since_drove: number | null;
  currently_driving: boolean;
  bucket: DrivingBucket;
};
export type DrivingInactivityPreview = {
  operating_company_id: string;
  generated_at: string;
  threshold_days: number;
  timezone: string;
  active_drivers: number;
  // Coverage guard: if we have < 21 days of assignment history, OVER_21_DAYS is UNTRUSTWORTHY (a driver looks
  // idle only because we weren't recording assignments yet). Surfaced loudly so we never mass-deactivate on it.
  coverage: { assignment_history_earliest_date: string | null; assignment_history_row_count: number; coverage_days: number | null; trustworthy: boolean; warning: string | null };
  counts: Record<DrivingBucket, number>;
  rows: DrivingInactivityRow[];
};

export async function previewDriverDrivingInactivity(client: PoolClient, operatingCompanyId: string): Promise<DrivingInactivityPreview> {
  const res = await client.query(
    `WITH asg AS (
       SELECT driver_id,
              max(coalesce(ended_at, started_at)) AS last_drove_at,
              bool_or(ended_at IS NULL) AS currently_driving
         FROM telematics.vehicle_driver_assignments
        WHERE operating_company_id = $1::uuid AND driver_id IS NOT NULL
        GROUP BY driver_id
     )
     SELECT d.id::text AS driver_id,
            trim(coalesce(d.first_name,'') || ' ' || coalesce(d.last_name,'')) AS driver_name,
            a.last_drove_at::text AS last_drove_at,
            coalesce(a.currently_driving, false) AS currently_driving,
            CASE WHEN a.last_drove_at IS NOT NULL
                 THEN floor(EXTRACT(EPOCH FROM (now() - a.last_drove_at)) / 86400.0)::int ELSE NULL END AS days_since_drove,
            (a.last_drove_at IS NOT NULL AND a.last_drove_at < now() - ($2 || ' days')::interval) AS over_21
       FROM mdata.drivers d
       LEFT JOIN asg a ON a.driver_id = d.id
      WHERE d.operating_company_id = $1::uuid AND d.deactivated_at IS NULL AND d.status = 'Active'
      ORDER BY a.last_drove_at ASC NULLS FIRST`,
    [operatingCompanyId, INACTIVITY_THRESHOLD_DAYS]
  );

  const counts: Record<DrivingBucket, number> = { CURRENTLY_DRIVING: 0, DROVE_WITHIN_21: 0, OVER_21_DAYS: 0, NEVER_ON_RECORD: 0 };
  const rows: DrivingInactivityRow[] = res.rows.map((r: Record<string, unknown>) => {
    let bucket: DrivingBucket;
    if (r.last_drove_at == null) bucket = "NEVER_ON_RECORD"; // no assignment row ever
    else if (r.currently_driving === true) bucket = "CURRENTLY_DRIVING"; // open assignment = driving now
    else if (r.over_21 === true) bucket = "OVER_21_DAYS";
    else bucket = "DROVE_WITHIN_21";
    counts[bucket] += 1;
    return {
      driver_id: r.driver_id as string,
      driver_name: (r.driver_name as string) || "—",
      last_drove_at: (r.last_drove_at as string) || null,
      days_since_drove: r.days_since_drove == null ? null : Number(r.days_since_drove),
      currently_driving: r.currently_driving === true,
      bucket,
    };
  });

  // Coverage guard — how far back does our assignment history actually go for this company?
  const cov = await client.query(
    `SELECT min(started_at)::text AS earliest, count(*)::int AS n,
            CASE WHEN min(started_at) IS NOT NULL THEN floor(EXTRACT(EPOCH FROM (now() - min(started_at))) / 86400.0)::int ELSE NULL END AS coverage_days
       FROM telematics.vehicle_driver_assignments WHERE operating_company_id = $1::uuid`,
    [operatingCompanyId]
  );
  const covRow = (cov.rows[0] ?? {}) as { earliest: string | null; n: number; coverage_days: number | null };
  const coverageDays = covRow.coverage_days == null ? null : Number(covRow.coverage_days);
  const trustworthy = coverageDays != null && coverageDays >= INACTIVITY_THRESHOLD_DAYS;
  const warning = trustworthy
    ? null
    : `Assignment history only goes back ${coverageDays ?? 0} day(s) (< ${INACTIVITY_THRESHOLD_DAYS}d) — OVER_21_DAYS may be false positives; do NOT mass-deactivate on this run.`;

  return {
    operating_company_id: operatingCompanyId,
    generated_at: new Date().toISOString(),
    threshold_days: INACTIVITY_THRESHOLD_DAYS,
    timezone: "America/Chicago",
    active_drivers: rows.length,
    coverage: { assignment_history_earliest_date: covRow.earliest ?? null, assignment_history_row_count: Number(covRow.n ?? 0), coverage_days: coverageDays, trustworthy, warning },
    counts,
    rows,
  };
}
