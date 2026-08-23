/**
 * GAP-68 — Safety Officer Home Data Aggregator
 *
 * Aggregates safety KPIs and ranked alerts for the Safety Officer role home view.
 * Each source uses graceful degradation when underlying tables are absent.
 */

import { scanAllDrivers } from "../../safety/expiry-tracking/cert-monitor.service.js";

export type SafetyAlertSeverity = "info" | "warning" | "error" | "critical";

export interface SafetyAlert {
  alert_id: string;
  source: string;
  severity: SafetyAlertSeverity;
  severity_rank: number;
  title: string;
  body: string;
  count: number;
  action_url: string;
  action_label: string;
  // SAFETY-KPI-DRILLTHROUGH: when the alert resolves to a single driver/unit, action_url deep-links
  // straight to that record's detail route (/drivers/:id, /fleet/units/:id) instead of a generic list.
  // These fields expose the resolved subject id for traceability + reverse linkage.
  subject_driver_id?: string | null;
  subject_unit_id?: string | null;
}

export interface SafetyHomeKpis {
  open_dvir_major_defects: number;
  hos_violations_today: number;
  expiring_certs_30d: number;
  open_accidents_7d: number;
  pending_da_draws: number;
  open_workers_comp_claims: number;
}

export interface SafetyHomeData {
  kpis: SafetyHomeKpis;
  alerts: SafetyAlert[];
  cert_data_stale: boolean;
  computed_at: string;
}

type DbClient = {
  query: (sql: string, values?: unknown[]) => Promise<{ rows: Record<string, unknown>[] }>;
};

function num(v: unknown, fallback = 0): number {
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}

function severityRank(severity: SafetyAlertSeverity): number {
  if (severity === "critical") return 0;
  if (severity === "warning") return 1;
  if (severity === "error") return 2;
  return 3;
}

async function tableExists(client: DbClient, qualifiedName: string): Promise<boolean> {
  try {
    const r = await client.query(`SELECT to_regclass($1) IS NOT NULL AS ok`, [qualifiedName]);
    return Boolean(r.rows[0]?.ok);
  } catch {
    return false;
  }
}

// SAFETY-KPI-DRILLTHROUGH: count + the sole subject id when exactly ONE distinct driver/unit is
// behind the rows. When count(DISTINCT subject) === 1, the alert can deep-link to that record's detail
// route; when 0 or >1, callers keep the generic list route (honest — a list spanning many subjects
// must not masquerade as a single-record drill-through).
interface CountWithUnit {
  count: number;
  soleUnitId: string | null;
}
interface CountWithDriver {
  count: number;
  soleDriverId: string | null;
}

function soleId(distinct: unknown, value: unknown): string | null {
  return num(distinct) === 1 && value != null && value !== "" ? String(value) : null;
}

async function countOpenDvirMajorDefects(client: DbClient, ociId: string): Promise<CountWithUnit> {
  if (!(await tableExists(client, "safety.dvir_defects"))) return { count: 0, soleUnitId: null };
  const res = await client.query(
    `
      SELECT count(*)::int AS c,
             count(DISTINCT d.unit_id)::int AS distinct_units,
             (array_agg(DISTINCT d.unit_id) FILTER (WHERE d.unit_id IS NOT NULL))[1] AS sole_unit
      FROM safety.dvir_defects d
      WHERE d.operating_company_id = $1::uuid
        AND d.severity = 'major'
        AND d.resolved_at IS NULL
    `,
    [ociId]
  );
  const row = res.rows[0] ?? {};
  return { count: num(row.c), soleUnitId: soleId(row.distinct_units, row.sole_unit) };
}

async function countHosViolationsToday(client: DbClient, ociId: string): Promise<CountWithDriver> {
  if (!(await tableExists(client, "safety.hos_violations"))) return { count: 0, soleDriverId: null };
  const res = await client.query(
    `
      SELECT count(*)::int AS c,
             count(DISTINCT driver_id)::int AS distinct_drivers,
             (array_agg(DISTINCT driver_id) FILTER (WHERE driver_id IS NOT NULL))[1] AS sole_driver
      FROM safety.hos_violations
      WHERE operating_company_id = $1::uuid
        AND occurred_at::date = CURRENT_DATE
        AND voided_at IS NULL
    `,
    [ociId]
  );
  const row = res.rows[0] ?? {};
  return { count: num(row.c), soleDriverId: soleId(row.distinct_drivers, row.sole_driver) };
}

async function countOpenAccidents7d(
  client: DbClient,
  ociId: string
): Promise<{ open: number; pendingInvestigations: number; soleDriverId: string | null; soleUnitId: string | null }> {
  if (!(await tableExists(client, "safety.accident_reports"))) {
    return { open: 0, pendingInvestigations: 0, soleDriverId: null, soleUnitId: null };
  }
  // 0441-mod6: status + updated_at added on safety.accident_reports (migration 202607580000).
  // Open = not closed; pendingInvestigations = under-investigation within the 7d window.
  const res = await client.query(
    `
      SELECT count(*) FILTER (
               WHERE status NOT IN ('closed-no-fault', 'closed-driver-at-fault')
             )::int AS open_count,
             count(*) FILTER (WHERE status = 'under-investigation')::int AS pending_investigations,
             count(DISTINCT driver_id)::int AS distinct_drivers,
             (array_agg(DISTINCT driver_id) FILTER (WHERE driver_id IS NOT NULL))[1] AS sole_driver,
             count(DISTINCT unit_id)::int AS distinct_units,
             (array_agg(DISTINCT unit_id) FILTER (WHERE unit_id IS NOT NULL))[1] AS sole_unit
      FROM safety.accident_reports
      WHERE operating_company_id = $1::uuid
        AND accident_at >= (CURRENT_DATE - INTERVAL '7 days')
    `,
    [ociId]
  );
  const row = res.rows[0] ?? {};
  return {
    open: num(row.open_count),
    pendingInvestigations: num(row.pending_investigations),
    soleDriverId: soleId(row.distinct_drivers, row.sole_driver),
    soleUnitId: soleId(row.distinct_units, row.sole_unit),
  };
}

async function countPendingDaDraws(client: DbClient, ociId: string): Promise<CountWithDriver> {
  // §4 landmine: safety.da_random_pool_draws (migration 0327) has NO `status` column (it is an audit
  // trail of completed draws). The prior `status IN (...)` 42703'd → the safety role-home endpoint 500'd.
  // Pending drug/alcohol tests are tracked on safety.da_test_records.result = 'pending' (same migration),
  // which is exactly this KPI ("await test scheduling or completion"). The subject column here is
  // `driver_uuid` (verified on Neon prod), NOT `driver_id`.
  //
  // COMP-01-B (2026-07-26): the scoping predicate was `= $1::uuid`. On PROD this table's
  // operating_company_id is TEXT (pg_attribute, verified this session) — unlike every sibling safety
  // table — and Postgres has no text = uuid operator, so this query 42883'd at PLAN TIME on every
  // call, with or without rows. The tableExists() guard above cannot see that: the table DOES exist.
  // The KPI therefore never returned a count; it returned a 500. Cast to ::text, the real type.
  if (!(await tableExists(client, "safety.da_test_records"))) return { count: 0, soleDriverId: null };
  const res = await client.query(
    `
      SELECT count(*)::int AS c,
             count(DISTINCT driver_uuid)::int AS distinct_drivers,
             (array_agg(DISTINCT driver_uuid) FILTER (WHERE driver_uuid IS NOT NULL))[1] AS sole_driver
      FROM safety.da_test_records
      WHERE operating_company_id::text = $1::uuid::text
        AND result = 'pending'
    `,
    [ociId]
  );
  const row = res.rows[0] ?? {};
  return { count: num(row.c), soleDriverId: soleId(row.distinct_drivers, row.sole_driver) };
}

async function countCsaUpdates30d(client: DbClient, ociId: string): Promise<number> {
  if (!(await tableExists(client, "safety.csa_scores"))) return 0;
  const res = await client.query(
    `
      SELECT count(*)::int AS c
      FROM safety.csa_scores
      WHERE operating_company_id = $1::uuid
        AND computed_at >= (CURRENT_DATE - INTERVAL '30 days')
    `,
    [ociId]
  );
  return num(res.rows[0]?.c);
}

async function countOpenWorkersCompClaims(client: DbClient, ociId: string): Promise<number> {
  if (!(await tableExists(client, "safety.workers_comp_claims"))) return 0;
  const res = await client.query(
    `
      SELECT count(*)::int AS c
      FROM safety.workers_comp_claims
      WHERE operating_company_id = $1::uuid
        AND status NOT IN ('closed', 'denied', 'resolved')
    `,
    [ociId]
  );
  return num(res.rows[0]?.c);
}

async function countExpiringCerts30d(client: DbClient, ociId: string): Promise<number> {
  if (!(await tableExists(client, "mdata.drivers"))) return 0;
  try {
    const alerts = await scanAllDrivers(
      client as Parameters<typeof scanAllDrivers>[0],
      ociId
    );
    return alerts.filter((a) => a.days_until_expiry >= 0 && a.days_until_expiry <= 30).length;
  } catch {
    return 0;
  }
}

async function isCertDataStale(client: DbClient, ociId: string): Promise<boolean> {
  if (!(await tableExists(client, "mdata.drivers"))) return false;
  const res = await client.query(
    `
      SELECT max(GREATEST(
        COALESCE(d.updated_at, d.created_at),
        COALESCE(d.cdl_expires_at::timestamptz, 'epoch'::timestamptz),
        COALESCE(d.dot_medical_expires_at::timestamptz, 'epoch'::timestamptz)
      ))::text AS last_touch
      FROM mdata.drivers d
      WHERE (
          d.operating_company_id = $1::uuid
          OR EXISTS (
            SELECT 1
            FROM mdata.driver_company_authorizations safety_home_cert_stale_dca
            WHERE safety_home_cert_stale_dca.driver_id = d.id
              AND safety_home_cert_stale_dca.company_id = $1::uuid
              AND safety_home_cert_stale_dca.is_authorized = true
              AND safety_home_cert_stale_dca.deactivated_at IS NULL
          )
        )
        AND d.deactivated_at IS NULL
    `,
    [ociId]
  );
  const lastTouch = res.rows[0]?.last_touch;
  if (!lastTouch || typeof lastTouch !== "string") return false;
  const ageMs = Date.now() - new Date(lastTouch).getTime();
  return ageMs > 7 * 24 * 60 * 60 * 1000;
}

// SAFETY-KPI-DRILLTHROUGH: canonical per-entity detail routes (mirrors the CI-verified
// EntityLink resolver in apps/frontend/src/components/shared/EntityLink.tsx — /drivers/:id and
// /fleet/units/:id are real, mounted detail routes). When exactly one subject is behind an alert we
// deep-link straight to it; otherwise we fall back to the scoped list surface (never a bare "/safety").
function driverRoute(driverId: string): string {
  return `/drivers/${driverId}`;
}
function unitRoute(unitId: string): string {
  return `/fleet/units/${unitId}`;
}

function buildAlerts(input: {
  dvir: CountWithUnit;
  hos: CountWithDriver;
  accidents: { open: number; pendingInvestigations: number; soleDriverId: string | null; soleUnitId: string | null };
  pendingDa: CountWithDriver;
  csaUpdates: number;
  expiringCerts: number;
  workersComp: number;
}): SafetyAlert[] {
  const alerts: SafetyAlert[] = [];

  if (input.dvir.count > 0) {
    alerts.push({
      alert_id: "dvir_major_defects",
      source: "dvir_defects",
      severity: input.dvir.count >= 5 ? "critical" : "warning",
      severity_rank: severityRank(input.dvir.count >= 5 ? "critical" : "warning"),
      title: `${input.dvir.count} open DVIR major defect${input.dvir.count === 1 ? "" : "s"}`,
      body: input.dvir.soleUnitId
        ? "All open major defects are on one unit — open the unit to review before dispatch."
        : "Major or critical DVIR defects require Safety Officer review before dispatch.",
      count: input.dvir.count,
      action_url: input.dvir.soleUnitId ? unitRoute(input.dvir.soleUnitId) : "/maintenance/dvir",
      action_label: input.dvir.soleUnitId ? "Open unit" : "Review DVIR defects",
      subject_unit_id: input.dvir.soleUnitId,
    });
  }

  if (input.hos.count > 0) {
    alerts.push({
      alert_id: "hos_violations_today",
      source: "hos_violations",
      severity: input.hos.count >= 3 ? "error" : "warning",
      severity_rank: severityRank(input.hos.count >= 3 ? "error" : "warning"),
      title: `${input.hos.count} HOS violation${input.hos.count === 1 ? "" : "s"} today`,
      body: input.hos.soleDriverId
        ? "All of today's HOS violations are on one driver — open the driver for coaching or reassignment."
        : "Drivers with HOS violations today may need coaching or reassignment.",
      count: input.hos.count,
      action_url: input.hos.soleDriverId ? driverRoute(input.hos.soleDriverId) : "/safety/hos",
      action_label: input.hos.soleDriverId ? "Open driver" : "Open HOS exceptions",
      subject_driver_id: input.hos.soleDriverId,
    });
  }

  if (input.accidents.open > 0) {
    const accidentUrl = input.accidents.soleDriverId
      ? driverRoute(input.accidents.soleDriverId)
      : input.accidents.soleUnitId
        ? unitRoute(input.accidents.soleUnitId)
        : "/safety/accidents";
    alerts.push({
      alert_id: "accidents_7d",
      source: "accident_reports",
      severity: input.accidents.pendingInvestigations > 0 ? "critical" : "error",
      severity_rank: severityRank(input.accidents.pendingInvestigations > 0 ? "critical" : "error"),
      title: `${input.accidents.open} accident${input.accidents.open === 1 ? "" : "s"} this week`,
      body:
        input.accidents.pendingInvestigations > 0
          ? `${input.accidents.pendingInvestigations} investigation${input.accidents.pendingInvestigations === 1 ? "" : "s"} still pending.`
          : "Review accident reports filed in the last 7 days.",
      count: input.accidents.open,
      action_url: accidentUrl,
      action_label:
        input.accidents.soleDriverId
          ? "Open driver"
          : input.accidents.soleUnitId
            ? "Open unit"
            : "Review accidents",
      subject_driver_id: input.accidents.soleDriverId,
      subject_unit_id: input.accidents.soleUnitId,
    });
  }

  if (input.pendingDa.count > 0) {
    alerts.push({
      alert_id: "da_random_draws",
      source: "drug_alcohol",
      severity: "warning",
      severity_rank: severityRank("warning"),
      title: `${input.pendingDa.count} random pool draw${input.pendingDa.count === 1 ? "" : "s"} pending`,
      body: input.pendingDa.soleDriverId
        ? "One driver has a pending D&A test — open the driver to schedule or record the result."
        : "Drug & alcohol random pool draws await test scheduling or completion.",
      count: input.pendingDa.count,
      action_url: input.pendingDa.soleDriverId ? driverRoute(input.pendingDa.soleDriverId) : "/safety/drug-alcohol",
      action_label: input.pendingDa.soleDriverId ? "Open driver" : "Open D/A program",
      subject_driver_id: input.pendingDa.soleDriverId,
    });
  }

  if (input.csaUpdates > 0) {
    alerts.push({
      alert_id: "csa_updates_30d",
      source: "csa_scores",
      severity: "info",
      severity_rank: severityRank("info"),
      title: `${input.csaUpdates} internal inspection-point update${input.csaUpdates === 1 ? "" : "s"} (30d)`,
      body: "IH35 inspection-point rollups were recomputed in the last 30 days; these are not FMCSA BASIC percentiles.",
      count: input.csaUpdates,
      action_url: "/safety/dot-compliance",
      action_label: "View inspection points",
    });
  }

  if (input.expiringCerts > 0) {
    alerts.push({
      alert_id: "expiring_certs_30d",
      source: "cert_expiry",
      severity: input.expiringCerts >= 10 ? "error" : "warning",
      severity_rank: severityRank(input.expiringCerts >= 10 ? "error" : "warning"),
      title: `${input.expiringCerts} driver cert${input.expiringCerts === 1 ? "" : "s"} expiring within 30 days`,
      body: "CDL, medical, hazmat, or TWIC credentials need renewal tracking.",
      count: input.expiringCerts,
      action_url: "/safety/cert-expiry",
      action_label: "Open cert expiry dashboard",
    });
  }

  if (input.workersComp > 0) {
    alerts.push({
      alert_id: "workers_comp_open",
      source: "workers_comp",
      severity: "warning",
      severity_rank: severityRank("warning"),
      title: `${input.workersComp} open workers comp claim${input.workersComp === 1 ? "" : "s"}`,
      body: "Open workers compensation claims require Safety Officer follow-up.",
      count: input.workersComp,
      action_url: "/safety/home",
      action_label: "Review workers comp",
    });
  }

  return alerts.sort((a, b) => a.severity_rank - b.severity_rank || b.count - a.count);
}

export async function getSafetyHomeData(client: DbClient, operatingCompanyId: string): Promise<SafetyHomeData> {
  const [
    dvir,
    hos,
    accidents,
    pendingDa,
    csaUpdates,
    expiringCerts,
    workersComp,
    certStale,
  ] = await Promise.all([
    countOpenDvirMajorDefects(client, operatingCompanyId),
    countHosViolationsToday(client, operatingCompanyId),
    countOpenAccidents7d(client, operatingCompanyId),
    countPendingDaDraws(client, operatingCompanyId),
    countCsaUpdates30d(client, operatingCompanyId),
    countExpiringCerts30d(client, operatingCompanyId),
    countOpenWorkersCompClaims(client, operatingCompanyId),
    isCertDataStale(client, operatingCompanyId),
  ]);

  const kpis: SafetyHomeKpis = {
    open_dvir_major_defects: dvir.count,
    hos_violations_today: hos.count,
    expiring_certs_30d: expiringCerts,
    open_accidents_7d: accidents.open,
    pending_da_draws: pendingDa.count,
    open_workers_comp_claims: workersComp,
  };

  const alerts = buildAlerts({
    dvir,
    hos,
    accidents,
    pendingDa,
    csaUpdates,
    expiringCerts,
    workersComp,
  });

  return {
    kpis,
    alerts,
    cert_data_stale: certStale,
    computed_at: new Date().toISOString(),
  };
}
