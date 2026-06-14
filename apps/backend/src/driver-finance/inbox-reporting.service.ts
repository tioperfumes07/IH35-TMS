// B7 — driver-inbox reporting (READ-ONLY). Aggregates request accountability from the
// B4 timeline view (views.driver_request_timeline) + cash_advance_requests. No mutations,
// no money path, no migration. advance-volume-by-TRIP is intentionally not computed here
// (driver_advances has no load FK — see B7 recon); we ship total + per-driver approved volume.

type DbClient = {
  query: <T = Record<string, unknown>>(sql: string, values?: unknown[]) => Promise<{ rows: T[] }>;
};

type JoinedRow = {
  request_id: string;
  driver_id: string;
  driver_name: string | null;
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
             car.status,
             car.requested_amount_cents::bigint        AS requested_amount_cents,
             t.seconds_requested_to_viewed,
             t.seconds_requested_to_decision
      FROM driver_finance.cash_advance_requests car
      LEFT JOIN views.driver_request_timeline t ON t.request_id = car.id
      JOIN mdata.drivers d ON d.id = car.driver_id
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
    // Per Jorge: ship what's computable, list what's missing.
    not_computed: [
      "advance-volume-by-trip: driver_advances has no load FK; shipped total + per-driver approved volume instead. Per-trip needs a load_id on the advance (a later migration).",
    ],
  };
}
