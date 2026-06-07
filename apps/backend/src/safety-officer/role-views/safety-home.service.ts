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

async function countOpenDvirMajorDefects(client: DbClient, ociId: string): Promise<number> {
  if (!(await tableExists(client, "safety.dvir_defects"))) return 0;
  const res = await client.query(
    `
      SELECT count(*)::int AS c
      FROM safety.dvir_defects d
      WHERE d.operating_company_id = $1::uuid
        AND d.severity = 'major'
        AND d.resolved_at IS NULL
    `,
    [ociId]
  );
  return num(res.rows[0]?.c);
}

async function countHosViolationsToday(client: DbClient, ociId: string): Promise<number> {
  if (!(await tableExists(client, "safety.hos_violations"))) return 0;
  const res = await client.query(
    `
      SELECT count(*)::int AS c
      FROM safety.hos_violations
      WHERE operating_company_id = $1::uuid
        AND occurred_at::date = CURRENT_DATE
        AND voided_at IS NULL
    `,
    [ociId]
  );
  return num(res.rows[0]?.c);
}

async function countOpenAccidents7d(client: DbClient, ociId: string): Promise<{ open: number; pendingInvestigations: number }> {
  if (!(await tableExists(client, "safety.accident_reports"))) {
    return { open: 0, pendingInvestigations: 0 };
  }
  const res = await client.query(
    `
      SELECT
        count(*)::int AS open_count,
        count(*) FILTER (WHERE investigation_status IN ('pending', 'in_progress', 'open'))::int AS pending_investigations
      FROM safety.accident_reports
      WHERE operating_company_id = $1::uuid
        AND accident_at >= (CURRENT_DATE - INTERVAL '7 days')
        AND status NOT IN ('closed', 'resolved')
    `,
    [ociId]
  );
  return {
    open: num(res.rows[0]?.open_count),
    pendingInvestigations: num(res.rows[0]?.pending_investigations),
  };
}

async function countPendingDaDraws(client: DbClient, ociId: string): Promise<number> {
  if (!(await tableExists(client, "safety.da_random_pool_draws"))) return 0;
  const res = await client.query(
    `
      SELECT count(*)::int AS c
      FROM safety.da_random_pool_draws
      WHERE operating_company_id = $1::uuid
        AND status IN ('pending', 'scheduled', 'awaiting_tests')
    `,
    [ociId]
  );
  return num(res.rows[0]?.c);
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
      WHERE d.operating_company_id = $1::uuid
        AND d.deactivated_at IS NULL
    `,
    [ociId]
  );
  const lastTouch = res.rows[0]?.last_touch;
  if (!lastTouch || typeof lastTouch !== "string") return false;
  const ageMs = Date.now() - new Date(lastTouch).getTime();
  return ageMs > 7 * 24 * 60 * 60 * 1000;
}

function buildAlerts(input: {
  openDvir: number;
  hosToday: number;
  accidents: { open: number; pendingInvestigations: number };
  pendingDa: number;
  csaUpdates: number;
  expiringCerts: number;
  workersComp: number;
}): SafetyAlert[] {
  const alerts: SafetyAlert[] = [];

  if (input.openDvir > 0) {
    alerts.push({
      alert_id: "dvir_major_defects",
      source: "dvir_defects",
      severity: input.openDvir >= 5 ? "critical" : "warning",
      severity_rank: severityRank(input.openDvir >= 5 ? "critical" : "warning"),
      title: `${input.openDvir} open DVIR major defect${input.openDvir === 1 ? "" : "s"}`,
      body: "Major or critical DVIR defects require Safety Officer review before dispatch.",
      count: input.openDvir,
      action_url: "/maintenance/dvir",
      action_label: "Review DVIR defects",
    });
  }

  if (input.hosToday > 0) {
    alerts.push({
      alert_id: "hos_violations_today",
      source: "hos_violations",
      severity: input.hosToday >= 3 ? "error" : "warning",
      severity_rank: severityRank(input.hosToday >= 3 ? "error" : "warning"),
      title: `${input.hosToday} HOS violation${input.hosToday === 1 ? "" : "s"} today`,
      body: "Drivers with HOS violations today may need coaching or reassignment.",
      count: input.hosToday,
      action_url: "/safety/hos",
      action_label: "Open HOS exceptions",
    });
  }

  if (input.accidents.open > 0) {
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
      action_url: "/safety/accidents",
      action_label: "Review accidents",
    });
  }

  if (input.pendingDa > 0) {
    alerts.push({
      alert_id: "da_random_draws",
      source: "drug_alcohol",
      severity: "warning",
      severity_rank: severityRank("warning"),
      title: `${input.pendingDa} random pool draw${input.pendingDa === 1 ? "" : "s"} pending`,
      body: "Drug & alcohol random pool draws await test scheduling or completion.",
      count: input.pendingDa,
      action_url: "/safety/drug-alcohol",
      action_label: "Open D/A program",
    });
  }

  if (input.csaUpdates > 0) {
    alerts.push({
      alert_id: "csa_updates_30d",
      source: "csa_scores",
      severity: "info",
      severity_rank: severityRank("info"),
      title: `${input.csaUpdates} CSA BASIC score update${input.csaUpdates === 1 ? "" : "s"} (30d)`,
      body: "CSA BASIC scores were recomputed in the last 30 days — review trend shifts.",
      count: input.csaUpdates,
      action_url: "/safety/dot-compliance",
      action_label: "View CSA scores",
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
      action_url: "/safety/dot-compliance",
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
      action_url: "/safety",
      action_label: "Review workers comp",
    });
  }

  return alerts.sort((a, b) => a.severity_rank - b.severity_rank || b.count - a.count);
}

export async function getSafetyHomeData(client: DbClient, operatingCompanyId: string): Promise<SafetyHomeData> {
  const [
    openDvir,
    hosToday,
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
    open_dvir_major_defects: openDvir,
    hos_violations_today: hosToday,
    expiring_certs_30d: expiringCerts,
    open_accidents_7d: accidents.open,
    pending_da_draws: pendingDa,
    open_workers_comp_claims: workersComp,
  };

  const alerts = buildAlerts({
    openDvir,
    hosToday,
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
