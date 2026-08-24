// B7 — driver-inbox reporting (READ-ONLY). Aggregates request accountability from the
// B4 timeline view (views.driver_request_timeline) + cash_advance_requests. No mutations,
// no money path, no migration.
//
// CASH-ADVANCE-REPORTING-F4583-SAMPLE-DATA-IN-KPIS — live-walked /driver-hub/reporting on prod
// (2026-08-23): driver_finance.cash_advance_requests has exactly ONE row system-wide for USMCA,
// and it belongs to a driver correctly tagged mdata.drivers.is_sample_data=true ("SAMPLE
// Cascade-2042"). This query's JOIN mdata.drivers d had no is_sample_data exclusion, so the page's
// "Request accountability (read-only)" KPI tiles (Total Requests/Approved/Approval Rate/Approved
// Volume) were 100% derived from that one fixture row and presented as real business metrics with
// no disclosure. Same defect class already fixed for the sibling driver list/picker read
// (LV-DRIVER-HUB-SCHEDULER-TEST-FIXTURES-IN-PROD-PICKER-2026-08-23, #14909) and for units
// (DISPATCH-4) — this reporting aggregation query was not covered by either fix. Excluded below
// using the same `IS NOT TRUE` predicate (is_sample_data is NOT NULL DEFAULT false).
//
// LV-DRIVER-HUB-REPORTING-STALE-NO-LOAD-FK — this file used to hardcode "advance-volume-by-trip:
// driver_advances has no load FK" as a permanent not_computed limitation. That was true when B7
// shipped but has been stale since migration 202606251600_load_cash_advance_link.sql added a
// nullable load_id to BOTH driver_finance.cash_advance_requests (set at request time) AND
// driver_advances ("forwarded from cash_advance_requests.load_id on owner approval" — the
// migration's own column comment). This report's data source is cash_advance_requests, so
// car.load_id is read directly — no join to driver_advances needed. Per-trip volume is only
// reported for genuinely load-linked requests; a request with no load_id is simply excluded from
// by_load, exactly as the finding asked ("report only genuinely load-linked advances").

type DbClient = {
  query: <T = Record<string, unknown>>(sql: string, values?: unknown[]) => Promise<{ rows: T[] }>;
};

type JoinedRow = {
  request_id: string;
  driver_id: string;
  driver_name: string | null;
  load_id: string | null;
  load_number: string | null;
  status: string;
  requested_amount_cents: string | number;
  seconds_requested_to_viewed: string | number | null;
  seconds_requested_to_decision: string | number | null;
};

const toNum = (v: string | number | null | undefined): number | null => (v == null ? null : Number(v));
const avg = (xs: number[]): number | null => (xs.length ? Math.round(xs.reduce((a, b) => a + b, 0) / xs.length) : null);
const isApproved = (s: string) => s === "approved";
const isDecided = (s: string) => s === "approved" || s === "denied";

export async function getInboxReportingData(
  client: DbClient,
  operatingCompanyId: string,
  from: string,
  to: string
) {
  const res = await client.query<JoinedRow>(
    `
      SELECT car.id::text                              AS request_id,
             car.driver_id::text                       AS driver_id,
             NULLIF(concat_ws(' ', d.first_name, d.last_name), '') AS driver_name,
             car.load_id::text                         AS load_id,
             l.load_number                             AS load_number,
             car.status,
             car.requested_amount_cents::bigint        AS requested_amount_cents,
             t.seconds_requested_to_viewed,
             t.seconds_requested_to_decision
      FROM driver_finance.cash_advance_requests car
      LEFT JOIN views.driver_request_timeline t ON t.request_id = car.id
      LEFT JOIN mdata.loads l ON l.id = car.load_id AND l.operating_company_id = car.operating_company_id
      JOIN mdata.drivers d ON d.id = car.driver_id AND d.operating_company_id = car.operating_company_id
        AND d.is_sample_data IS NOT TRUE
      WHERE car.operating_company_id = $1::uuid
        AND car.submitted_at::date BETWEEN $2::date AND $3::date
      ORDER BY car.submitted_at DESC
    `,
    [operatingCompanyId, from, to]
  );
  const rows = res.rows;

  type DriverAgg = {
    driver_id: string;
    driver_name: string;
    total: number;
    approved: number;
    denied: number;
    ttv: number[];
    tta: number[];
    approvedCents: number;
  };
  const byDriver = new Map<string, DriverAgg>();

  type LoadAgg = {
    load_id: string;
    load_number: string;
    total: number;
    approved: number;
    approvedCents: number;
  };
  const byLoad = new Map<string, LoadAgg>();

  for (const r of rows) {
    let g = byDriver.get(r.driver_id);
    if (!g) {
      g = { driver_id: r.driver_id, driver_name: r.driver_name ?? r.driver_id, total: 0, approved: 0, denied: 0, ttv: [], tta: [], approvedCents: 0 };
      byDriver.set(r.driver_id, g);
    }
    g.total += 1;
    if (isApproved(r.status)) {
      g.approved += 1;
      g.approvedCents += Number(r.requested_amount_cents);
    }
    if (r.status === "denied") g.denied += 1;
    const ttv = toNum(r.seconds_requested_to_viewed);
    if (ttv != null) g.ttv.push(ttv);
    const tta = toNum(r.seconds_requested_to_decision);
    if (tta != null && isDecided(r.status)) g.tta.push(tta);

    // Genuinely load-linked requests only — a request with no load_id contributes to driver/summary
    // totals above but is intentionally excluded here, matching the finding's own scope.
    if (r.load_id) {
      let lg = byLoad.get(r.load_id);
      if (!lg) {
        lg = { load_id: r.load_id, load_number: r.load_number ?? r.load_id, total: 0, approved: 0, approvedCents: 0 };
        byLoad.set(r.load_id, lg);
      }
      lg.total += 1;
      if (isApproved(r.status)) {
        lg.approved += 1;
        lg.approvedCents += Number(r.requested_amount_cents);
      }
    }
  }

  const by_driver = [...byDriver.values()]
    .map((g) => ({
      driver_id: g.driver_id,
      driver_name: g.driver_name,
      total_requests: g.total,
      approved: g.approved,
      denied: g.denied,
      approval_rate_pct: g.approved + g.denied ? Math.round((g.approved / (g.approved + g.denied)) * 100) : null,
      avg_time_to_view_seconds: avg(g.ttv),
      avg_time_to_approve_seconds: avg(g.tta),
      approved_advance_cents: g.approvedCents,
    }))
    .sort((a, b) => b.total_requests - a.total_requests);

  const by_load = [...byLoad.values()]
    .map((g) => ({
      load_id: g.load_id,
      load_number: g.load_number,
      total_requests: g.total,
      approved: g.approved,
      approved_advance_cents: g.approvedCents,
    }))
    .sort((a, b) => b.approved_advance_cents - a.approved_advance_cents);

  const approved = rows.filter((r) => isApproved(r.status)).length;
  const denied = rows.filter((r) => r.status === "denied").length;
  const allTtv = rows.map((r) => toNum(r.seconds_requested_to_viewed)).filter((x): x is number => x != null);
  const allTta = rows.filter((r) => isDecided(r.status)).map((r) => toNum(r.seconds_requested_to_decision)).filter((x): x is number => x != null);
  const approvedCents = rows.filter((r) => isApproved(r.status)).reduce((s, r) => s + Number(r.requested_amount_cents), 0);

  return {
    from,
    to,
    summary: {
      total_requests: rows.length,
      approved,
      denied,
      approval_rate_pct: approved + denied ? Math.round((approved / (approved + denied)) * 100) : null,
      avg_time_to_view_seconds: avg(allTtv),
      avg_time_to_approve_seconds: avg(allTta),
      total_approved_advance_cents: approvedCents,
    },
    by_driver,
    by_load,
    // LV-DRIVER-HUB-REPORTING-STALE-NO-LOAD-FK — the "no load FK" limitation this array used to
    // hardcode is fixed above (by_load); nothing else is currently unshippable, so this stays empty
    // rather than being deleted, preserving the honest-reporting contract for any future gap.
    not_computed: [] as string[],
  };
}
