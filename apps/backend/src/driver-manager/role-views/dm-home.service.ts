/**
 * GAP-69 — Driver Manager Home Data Aggregator
 *
 * Aggregates driver retention, comms, payroll, and scoring KPIs for the Manager role home view.
 * Each source uses graceful degradation when underlying tables are absent.
 */

import { lateArrivalGraceMinutes } from "../../dispatch/late-arrivals.service.js";
import { computeDriverScoreFromCounts } from "../../safety/driver-scoring.service.js";
import { scanAllDrivers } from "../../safety/expiry-tracking/cert-monitor.service.js";

export type DriverManagerAttentionSeverity = "info" | "warning" | "error" | "critical";

export interface DriverManagerAttentionItem {
  item_id: string;
  source: string;
  severity: DriverManagerAttentionSeverity;
  severity_rank: number;
  title: string;
  body: string;
  count: number;
  action_url: string;
  action_label: string;
}

export interface DriverManagerHomeKpis {
  unread_driver_comms: number;
  late_arrivals_7d: number;
  pending_settlements: number;
}

export interface DriverLateArrivalRow {
  driver_id: string;
  driver_name: string;
  late_count: number;
}

export interface DriverScoringLeaderboardEntry {
  driver_id: string;
  driver_name: string;
  score: number;
  incidents: number;
}

export interface CoolingDriverRow {
  driver_id: string;
  driver_name: string;
  days_idle: number;
}

export interface DriverManagerHomeData {
  kpis: DriverManagerHomeKpis;
  attention_items: DriverManagerAttentionItem[];
  late_arrivals_by_driver: DriverLateArrivalRow[];
  pending_layovers: number;
  expiring_certs_30d: number;
  scoring_leaderboard: {
    top: DriverScoringLeaderboardEntry[];
    bottom: DriverScoringLeaderboardEntry[];
  };
  cooling_drivers: CoolingDriverRow[];
  computed_at: string;
}

type DbClient = {
  query: (sql: string, values?: unknown[]) => Promise<{ rows: Record<string, unknown>[] }>;
};

function num(v: unknown, fallback = 0): number {
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}

function severityRank(severity: DriverManagerAttentionSeverity): number {
  if (severity === "critical") return 0;
  if (severity === "error") return 1;
  if (severity === "warning") return 2;
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

async function columnExists(client: DbClient, relation: string, column: string): Promise<boolean> {
  try {
    const r = await client.query(
      `
        SELECT EXISTS (
          SELECT 1
          FROM information_schema.columns
          WHERE table_schema = split_part($1, '.', 1)
            AND table_name = split_part($1, '.', 2)
            AND column_name = $2
        ) AS ok
      `,
      [relation, column]
    );
    return Boolean(r.rows[0]?.ok);
  } catch {
    return false;
  }
}

async function countUnreadDriverComms(client: DbClient, ociId: string): Promise<number> {
  if (!(await tableExists(client, "mdata.driver_profile_messages"))) return 0;
  if (!(await tableExists(client, "mdata.drivers"))) return 0;

  const res = await client.query(
    `
      SELECT count(*)::int AS c
      FROM mdata.driver_profile_messages m
      JOIN mdata.drivers d ON d.id = m.driver_id
      WHERE m.operating_company_id = $1::uuid
        AND d.operating_company_id = $1::uuid
        AND d.deactivated_at IS NULL
        AND m.read_at IS NULL
        AND m.created_by IS NOT NULL
        AND m.created_by = d.identity_user_id
    `,
    [ociId]
  );
  return num(res.rows[0]?.c);
}

async function loadLateArrivals7d(
  client: DbClient,
  ociId: string
): Promise<{ total: number; byDriver: DriverLateArrivalRow[] }> {
  if (!(await tableExists(client, "dispatch.stop_arrivals"))) {
    return { total: 0, byDriver: [] };
  }

  const graceMinutes = lateArrivalGraceMinutes();
  const res = await client.query(
    `
      SELECT
        sa.driver_id::text AS driver_id,
        trim(concat(coalesce(d.first_name, ''), ' ', coalesce(d.last_name, ''))) AS driver_name,
        count(*)::int AS late_count
      FROM dispatch.stop_arrivals sa
      JOIN mdata.load_stops ls ON ls.id = sa.stop_id
      JOIN mdata.loads l ON l.id = ls.load_id
      LEFT JOIN mdata.drivers d ON d.id = sa.driver_id
      WHERE sa.operating_company_id = $1::uuid
        AND l.operating_company_id = $1::uuid
        AND l.soft_deleted_at IS NULL
        AND sa.driver_id IS NOT NULL
        AND sa.triggered_at >= (CURRENT_DATE - INTERVAL '7 days')
        AND sa.triggered_at >
          COALESCE(ls.appointment_end_at, ls.scheduled_arrival_at, ls.appointment_start_at)
          + ($2::int * interval '1 minute')
      GROUP BY sa.driver_id, d.first_name, d.last_name
      ORDER BY late_count DESC, driver_name ASC
      LIMIT 25
    `,
    [ociId, graceMinutes]
  );

  const byDriver = res.rows.map((row) => ({
    driver_id: String(row.driver_id ?? ""),
    driver_name: String(row.driver_name ?? "Unknown driver").trim() || "Unknown driver",
    late_count: num(row.late_count),
  }));
  const total = byDriver.reduce((sum, row) => sum + row.late_count, 0);
  return { total, byDriver };
}

async function countPendingLayovers(client: DbClient, ociId: string): Promise<number> {
  if (!(await tableExists(client, "dispatch.driver_layovers"))) return 0;

  const hasPerDiemExcluded = await columnExists(client, "dispatch.driver_layovers", "per_diem_excluded");
  const hasPerDiemExcludedAt = await columnExists(client, "dispatch.driver_layovers", "per_diem_excluded_at");
  const pendingClause = hasPerDiemExcluded
    ? "AND dl.per_diem_excluded IS NULL"
    : hasPerDiemExcludedAt
      ? "AND dl.per_diem_excluded_at IS NULL"
      : "AND dl.layover_ended_at IS NULL";

  const res = await client.query(
    `
      SELECT count(*)::int AS c
      FROM dispatch.driver_layovers dl
      WHERE dl.operating_company_id = $1::text
        AND dl.per_diem_eligible = true
        ${pendingClause}
    `,
    [ociId]
  );
  return num(res.rows[0]?.c);
}

async function countPendingSettlements(client: DbClient, ociId: string): Promise<number> {
  if (!(await tableExists(client, "driver_finance.driver_settlements"))) return 0;

  const res = await client.query(
    `
      SELECT count(*)::int AS c
      FROM driver_finance.driver_settlements s
      WHERE s.operating_company_id = $1::uuid
        AND s.status IN ('draft', 'submitted', 'pending_validation')
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

async function loadScoringLeaderboard(
  client: DbClient,
  ociId: string
): Promise<{ top: DriverScoringLeaderboardEntry[]; bottom: DriverScoringLeaderboardEntry[] }> {
  if (!(await tableExists(client, "safety.harsh_events"))) {
    return { top: [], bottom: [] };
  }

  const res = await client.query(
    `
      SELECT
        d.id::text AS driver_id,
        trim(concat(coalesce(d.first_name, ''), ' ', coalesce(d.last_name, ''))) AS driver_name,
        count(*)::int AS incidents,
        count(*) FILTER (WHERE e.severity = 'critical')::int AS critical_count,
        count(*) FILTER (WHERE e.severity = 'major')::int AS major_count,
        count(*) FILTER (WHERE e.severity = 'minor')::int AS minor_count
      FROM mdata.drivers d
      LEFT JOIN safety.harsh_events e
        ON e.driver_id = d.id
       AND e.operating_company_id = d.operating_company_id
       AND e.event_at >= (now() - interval '7 days')
      WHERE d.operating_company_id = $1::uuid
        AND d.active = true
      GROUP BY d.id, d.first_name, d.last_name
      HAVING count(e.id) > 0
    `,
    [ociId]
  );

  const scored = res.rows.map((row) => {
    const scoreResult = computeDriverScoreFromCounts({
      counts: {
        critical: num(row.critical_count),
        major: num(row.major_count),
        minor: num(row.minor_count),
      },
      periodMiles: null,
    });
    return {
      driver_id: String(row.driver_id ?? ""),
      driver_name: String(row.driver_name ?? "Unknown driver").trim() || "Unknown driver",
      score: scoreResult.score,
      incidents: num(row.incidents),
    };
  });

  const sorted = [...scored].sort((a, b) => b.score - a.score || a.driver_name.localeCompare(b.driver_name));
  return {
    top: sorted.slice(0, 3),
    bottom: [...sorted].reverse().slice(0, 3),
  };
}

async function loadCoolingDrivers(client: DbClient, ociId: string): Promise<CoolingDriverRow[]> {
  if (!(await tableExists(client, "mdata.drivers"))) return [];

  const res = await client.query(
    `
      SELECT
        cooling.driver_id,
        cooling.driver_name,
        cooling.days_idle
      FROM (
        SELECT
          d.id::text AS driver_id,
          trim(concat(coalesce(d.first_name, ''), ' ', coalesce(d.last_name, ''))) AS driver_name,
          GREATEST(
            0,
            EXTRACT(
              day FROM (
                now() - GREATEST(
                  COALESCE(load_activity.last_at, 'epoch'::timestamptz),
                  COALESCE(msg_activity.last_at, 'epoch'::timestamptz),
                  COALESCE(d.updated_at, d.created_at)
                )
              )
            )
          )::int AS days_idle
        FROM mdata.drivers d
        LEFT JOIN LATERAL (
          SELECT max(GREATEST(l.updated_at, l.created_at)) AS last_at
          FROM mdata.loads l
          WHERE l.operating_company_id = d.operating_company_id
            AND l.soft_deleted_at IS NULL
            AND (
              l.assigned_primary_driver_id = d.id
              OR l.assigned_secondary_driver_id = d.id
            )
        ) load_activity ON true
        LEFT JOIN LATERAL (
          SELECT max(m.created_at) AS last_at
          FROM mdata.driver_profile_messages m
          WHERE m.operating_company_id = d.operating_company_id
            AND m.driver_id = d.id
        ) msg_activity ON true
        WHERE d.operating_company_id = $1::uuid
          AND d.deactivated_at IS NULL
          AND d.active = true
      ) cooling
      WHERE cooling.days_idle >= 14
      ORDER BY cooling.days_idle DESC, cooling.driver_name ASC
      LIMIT 25
    `,
    [ociId]
  );

  return res.rows.map((row) => ({
    driver_id: String(row.driver_id ?? ""),
    driver_name: String(row.driver_name ?? "Unknown driver").trim() || "Unknown driver",
    days_idle: num(row.days_idle),
  }));
}

function buildAttentionItems(input: {
  unreadComms: number;
  lateArrivals: number;
  pendingLayovers: number;
  pendingSettlements: number;
  expiringCerts: number;
  coolingDrivers: CoolingDriverRow[];
  scoringBottom: DriverScoringLeaderboardEntry[];
}): DriverManagerAttentionItem[] {
  const items: DriverManagerAttentionItem[] = [];

  if (input.unreadComms > 0) {
    items.push({
      item_id: "unread_driver_comms",
      source: "driver_comms",
      severity: input.unreadComms >= 10 ? "error" : "warning",
      severity_rank: severityRank(input.unreadComms >= 10 ? "error" : "warning"),
      title: `${input.unreadComms} unread driver message${input.unreadComms === 1 ? "" : "s"}`,
      body: "Inbound driver communications await review in the comm center.",
      count: input.unreadComms,
      action_url: "/drivers/messages",
      action_label: "Open driver comms",
    });
  }

  if (input.lateArrivals > 0) {
    items.push({
      item_id: "late_arrivals_7d",
      source: "stop_arrivals",
      severity: input.lateArrivals >= 5 ? "error" : "warning",
      severity_rank: severityRank(input.lateArrivals >= 5 ? "error" : "warning"),
      title: `${input.lateArrivals} late arrival${input.lateArrivals === 1 ? "" : "s"} (7d)`,
      body: "Drivers missed scheduled stop windows in the last 7 days.",
      count: input.lateArrivals,
      action_url: "/dispatch",
      action_label: "Review dispatch board",
    });
  }

  if (input.pendingLayovers > 0) {
    items.push({
      item_id: "pending_layovers",
      source: "driver_layovers",
      severity: "warning",
      severity_rank: severityRank("warning"),
      title: `${input.pendingLayovers} layover${input.pendingLayovers === 1 ? "" : "s"} awaiting per-diem decision`,
      body: "Layover gaps need per-diem eligibility review before settlement.",
      count: input.pendingLayovers,
      action_url: "/drivers",
      action_label: "Review layovers",
    });
  }

  if (input.pendingSettlements > 0) {
    items.push({
      item_id: "pending_settlements",
      source: "driver_settlements",
      severity: input.pendingSettlements >= 5 ? "error" : "warning",
      severity_rank: severityRank(input.pendingSettlements >= 5 ? "error" : "warning"),
      title: `${input.pendingSettlements} settlement${input.pendingSettlements === 1 ? "" : "s"} pending validation`,
      body: "Draft or submitted settlements need manager review before lock.",
      count: input.pendingSettlements,
      action_url: "/driver-finance/settlements",
      action_label: "Open settlements",
    });
  }

  if (input.expiringCerts > 0) {
    items.push({
      item_id: "expiring_certs_30d",
      source: "cert_expiry",
      severity: input.expiringCerts >= 8 ? "error" : "warning",
      severity_rank: severityRank(input.expiringCerts >= 8 ? "error" : "warning"),
      title: `${input.expiringCerts} driver cert${input.expiringCerts === 1 ? "" : "s"} expiring within 30 days`,
      body: "CDL, medical, hazmat, or TWIC credentials need renewal tracking.",
      count: input.expiringCerts,
      action_url: "/drivers",
      action_label: "Review driver credentials",
    });
  }

  if (input.scoringBottom.length > 0) {
    const worst = input.scoringBottom[0]!;
    items.push({
      item_id: "scoring_bottom_performers",
      source: "driver_scoring",
      severity: worst.score < 70 ? "error" : "info",
      severity_rank: severityRank(worst.score < 70 ? "error" : "info"),
      title: `${input.scoringBottom.length} low-scoring driver${input.scoringBottom.length === 1 ? "" : "s"} this week`,
      body: `Lowest weekly score: ${worst.driver_name} (${worst.score}). Coaching may reduce retention risk.`,
      count: input.scoringBottom.length,
      action_url: "/safety/driver-scoring",
      action_label: "Open driver scoring",
    });
  }

  if (input.coolingDrivers.length > 0) {
    items.push({
      item_id: "cooling_drivers",
      source: "driver_activity",
      severity: input.coolingDrivers.length >= 5 ? "warning" : "info",
      severity_rank: severityRank(input.coolingDrivers.length >= 5 ? "warning" : "info"),
      title: `${input.coolingDrivers.length} cooling driver${input.coolingDrivers.length === 1 ? "" : "s"} (14d+ idle)`,
      body: "Drivers with no load or comm activity for 14+ days may need retention outreach.",
      count: input.coolingDrivers.length,
      action_url: "/drivers",
      action_label: "Review driver roster",
    });
  }

  return items.sort((a, b) => a.severity_rank - b.severity_rank || b.count - a.count);
}

export async function getDriverManagerHomeData(client: DbClient, operatingCompanyId: string): Promise<DriverManagerHomeData> {
  const [
    unreadComms,
    lateArrivals,
    pendingLayovers,
    pendingSettlements,
    expiringCerts,
    scoringLeaderboard,
    coolingDrivers,
  ] = await Promise.all([
    countUnreadDriverComms(client, operatingCompanyId),
    loadLateArrivals7d(client, operatingCompanyId),
    countPendingLayovers(client, operatingCompanyId),
    countPendingSettlements(client, operatingCompanyId),
    countExpiringCerts30d(client, operatingCompanyId),
    loadScoringLeaderboard(client, operatingCompanyId),
    loadCoolingDrivers(client, operatingCompanyId),
  ]);

  const kpis: DriverManagerHomeKpis = {
    unread_driver_comms: unreadComms,
    late_arrivals_7d: lateArrivals.total,
    pending_settlements: pendingSettlements,
  };

  const attention_items = buildAttentionItems({
    unreadComms,
    lateArrivals: lateArrivals.total,
    pendingLayovers,
    pendingSettlements,
    expiringCerts,
    coolingDrivers,
    scoringBottom: scoringLeaderboard.bottom,
  });

  return {
    kpis,
    attention_items,
    late_arrivals_by_driver: lateArrivals.byDriver,
    pending_layovers: pendingLayovers,
    expiring_certs_30d: expiringCerts,
    scoring_leaderboard: scoringLeaderboard,
    cooling_drivers: coolingDrivers,
    computed_at: new Date().toISOString(),
  };
}
