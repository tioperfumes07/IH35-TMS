import { withCurrentUser } from "../../auth/db.js";
import { resolveOperatingCompanyId } from "../../auth/operating-company-scope.js";

type Queryable = {
  query: <R = Record<string, unknown>>(sql: string, values?: unknown[]) => Promise<{ rows: R[] }>;
};

type DispatcherHomeOptions = {
  operatingCompanyId?: string;
};

export type DispatcherHomeKpis = {
  active_loads: number;
  late_loads: number;
  today_pickups: number;
  today_deliveries: number;
};

export type DispatcherHomeActiveLoad = {
  id: string;
  load_number: string;
  status: string;
  customer_name: string;
  pickup_city: string | null;
  delivery_city: string | null;
  is_late: boolean;
  detention_expected: boolean;
};

export type DispatcherHomePendingActions = {
  detention_approvals: number;
  incoming_message_queue: number;
  booking_gap_open: number;
};

export type DispatcherHomeBookingGapAnalytics = {
  loads_booked_7d: number;
  unresolved_dispatch_gaps_7d: number;
  exception_loads_7d: number;
  gap_rate_pct: number;
};

export type DispatcherHomeData = {
  generated_at: string;
  kpis: DispatcherHomeKpis;
  active_loads: DispatcherHomeActiveLoad[];
  pending_actions: DispatcherHomePendingActions;
  booking_gap_analytics: DispatcherHomeBookingGapAnalytics;
};

const ACTIVE_STATUSES = ["assigned_not_dispatched", "dispatched", "in_transit", "delivered_pending_docs"];

const GAP_OPEN_STATUSES = ["unassigned", "assigned_not_dispatched"];

const EXCEPTION_STATUSES = ["cancelled", "driver_no_show", "driver_walkoff", "abandoned"];

function num(raw: unknown): number {
  const value = Number(raw ?? 0);
  return Number.isFinite(value) ? value : 0;
}

function bool(raw: unknown): boolean {
  return Boolean(raw);
}

function buildCompanyFilter(column = "l.operating_company_id", value?: string) {
  if (!value) return { sql: "", values: [] as unknown[] };
  return { sql: ` AND ${column} = $2::uuid`, values: [value] as unknown[] };
}

async function relationExists(client: Queryable, relation: string): Promise<boolean> {
  const res = await client.query<{ ok: string | null }>(`SELECT to_regclass($1) AS ok`, [relation]);
  return Boolean(res.rows[0]?.ok);
}

async function loadKpis(
  client: Queryable,
  userId: string,
  operatingCompanyId?: string
): Promise<DispatcherHomeKpis> {
  const company = buildCompanyFilter("l.operating_company_id", operatingCompanyId);
  const res = await client.query<{
    active_loads: number;
    late_loads: number;
    today_pickups: number;
    today_deliveries: number;
  }>(
    `
      SELECT
        COUNT(*) FILTER (
          WHERE l.status IN ('assigned_not_dispatched', 'dispatched', 'in_transit', 'delivered_pending_docs')
        )::int AS active_loads,
        COUNT(*) FILTER (
          WHERE l.status IN ('assigned_not_dispatched', 'dispatched', 'in_transit')
            AND (
              COALESCE(next_pickup.scheduled_arrival_at, next_delivery.scheduled_arrival_at) < now()
            )
        )::int AS late_loads,
        COUNT(*) FILTER (
          WHERE pickup_today.c > 0
        )::int AS today_pickups,
        COUNT(*) FILTER (
          WHERE delivery_today.c > 0
        )::int AS today_deliveries
      FROM mdata.loads l
      LEFT JOIN LATERAL (
        SELECT ls.scheduled_arrival_at
        FROM mdata.load_stops ls
        WHERE ls.load_id = l.id
          AND ls.stop_type = 'pickup'
        ORDER BY ls.sequence_number ASC
        LIMIT 1
      ) next_pickup ON true
      LEFT JOIN LATERAL (
        SELECT ls.scheduled_arrival_at
        FROM mdata.load_stops ls
        WHERE ls.load_id = l.id
          AND ls.stop_type = 'delivery'
        ORDER BY ls.sequence_number DESC
        LIMIT 1
      ) next_delivery ON true
      LEFT JOIN LATERAL (
        SELECT COUNT(*)::int AS c
        FROM mdata.load_stops ls
        WHERE ls.load_id = l.id
          AND ls.stop_type = 'pickup'
          AND ls.scheduled_arrival_at::date = CURRENT_DATE
      ) pickup_today ON true
      LEFT JOIN LATERAL (
        SELECT COUNT(*)::int AS c
        FROM mdata.load_stops ls
        WHERE ls.load_id = l.id
          AND ls.stop_type = 'delivery'
          AND ls.scheduled_arrival_at::date = CURRENT_DATE
      ) delivery_today ON true
      WHERE l.soft_deleted_at IS NULL
        AND l.dispatcher_user_id = $1::uuid
        ${company.sql}
    `,
    [userId, ...company.values]
  );
  const row = res.rows[0] ?? {
    active_loads: 0,
    late_loads: 0,
    today_pickups: 0,
    today_deliveries: 0,
  };
  return {
    active_loads: num(row.active_loads),
    late_loads: num(row.late_loads),
    today_pickups: num(row.today_pickups),
    today_deliveries: num(row.today_deliveries),
  };
}

async function loadActiveLoads(
  client: Queryable,
  userId: string,
  operatingCompanyId?: string
): Promise<DispatcherHomeActiveLoad[]> {
  const company = buildCompanyFilter("l.operating_company_id", operatingCompanyId);
  const res = await client.query<Record<string, unknown>>(
    `
      SELECT
        l.id::text,
        l.load_number::text,
        l.status::text,
        c.customer_name::text,
        pickup.city::text AS pickup_city,
        delivery.city::text AS delivery_city,
        (
          l.status IN ('assigned_not_dispatched', 'dispatched', 'in_transit')
          AND COALESCE(pickup.scheduled_arrival_at, delivery.scheduled_arrival_at) < now()
        ) AS is_late,
        COALESCE(l.detention_expected_y_n, false) AS detention_expected
      FROM mdata.loads l
      JOIN mdata.customers c ON c.id = l.customer_id
      LEFT JOIN LATERAL (
        SELECT ls.city, ls.scheduled_arrival_at
        FROM mdata.load_stops ls
        WHERE ls.load_id = l.id
          AND ls.stop_type = 'pickup'
        ORDER BY ls.sequence_number ASC
        LIMIT 1
      ) pickup ON true
      LEFT JOIN LATERAL (
        SELECT ls.city, ls.scheduled_arrival_at
        FROM mdata.load_stops ls
        WHERE ls.load_id = l.id
          AND ls.stop_type = 'delivery'
        ORDER BY ls.sequence_number DESC
        LIMIT 1
      ) delivery ON true
      WHERE l.soft_deleted_at IS NULL
        AND l.dispatcher_user_id = $1::uuid
        AND l.status::text = ANY($${company.values.length > 0 ? "3" : "2"}::text[])
        ${company.sql}
      ORDER BY is_late DESC, l.updated_at DESC
      LIMIT 25
    `,
    company.values.length > 0 ? [userId, operatingCompanyId, ACTIVE_STATUSES] : [userId, ACTIVE_STATUSES]
  );
  return res.rows.map((row) => ({
    id: String(row.id ?? ""),
    load_number: String(row.load_number ?? ""),
    status: String(row.status ?? ""),
    customer_name: String(row.customer_name ?? ""),
    pickup_city: row.pickup_city ? String(row.pickup_city) : null,
    delivery_city: row.delivery_city ? String(row.delivery_city) : null,
    is_late: bool(row.is_late),
    detention_expected: bool(row.detention_expected),
  }));
}

async function loadBookingGap(
  client: Queryable,
  userId: string,
  operatingCompanyId?: string
): Promise<DispatcherHomeBookingGapAnalytics> {
  const company = buildCompanyFilter("l.operating_company_id", operatingCompanyId);
  const res = await client.query<{
    loads_booked_7d: number;
    unresolved_dispatch_gaps_7d: number;
    exception_loads_7d: number;
  }>(
    `
      SELECT
        COUNT(*)::int AS loads_booked_7d,
        COUNT(*) FILTER (WHERE l.status::text = ANY($${company.values.length > 0 ? "4" : "3"}::text[]))::int AS unresolved_dispatch_gaps_7d,
        COUNT(*) FILTER (WHERE l.status::text = ANY($${company.values.length > 0 ? "5" : "4"}::text[]))::int AS exception_loads_7d
      FROM mdata.loads l
      WHERE l.soft_deleted_at IS NULL
        AND l.dispatcher_user_id = $1::uuid
        AND l.created_at >= (now() - interval '7 days')
        ${company.sql}
    `,
    company.values.length > 0
      ? [userId, operatingCompanyId, GAP_OPEN_STATUSES, EXCEPTION_STATUSES]
      : [userId, GAP_OPEN_STATUSES, EXCEPTION_STATUSES]
  );
  const row = res.rows[0] ?? {
    loads_booked_7d: 0,
    unresolved_dispatch_gaps_7d: 0,
    exception_loads_7d: 0,
  };
  const loadsBooked = num(row.loads_booked_7d);
  const gapOpen = num(row.unresolved_dispatch_gaps_7d);
  return {
    loads_booked_7d: loadsBooked,
    unresolved_dispatch_gaps_7d: gapOpen,
    exception_loads_7d: num(row.exception_loads_7d),
    gap_rate_pct: loadsBooked > 0 ? Number(((gapOpen / loadsBooked) * 100).toFixed(1)) : 0,
  };
}

async function loadPendingDetentionApprovals(
  client: Queryable,
  userId: string,
  operatingCompanyId?: string
): Promise<number> {
  // Canonical detention table is dispatch.detention_requests (NOT mdata.detention_requests, which does
  // not exist). "Pending owner approval" = status = 'pending_review' (set by detention-approval.service.ts;
  // approved→'approved'/'invoiced', rejected→'rejected'). Scope to this dispatcher via the load.
  if (!(await relationExists(client, "dispatch.detention_requests"))) return 0;

  const values: unknown[] = [userId];
  let companyFilter = "";
  if (operatingCompanyId) {
    values.push(operatingCompanyId);
    companyFilter = "AND dr.operating_company_id = $2::uuid";
  }

  const res = await client.query<{ c: number }>(
    `
      SELECT COUNT(*)::int AS c
      FROM dispatch.detention_requests dr
      LEFT JOIN mdata.loads l ON l.id = dr.load_id
      WHERE dr.status = 'pending_review'
        AND l.dispatcher_user_id = $1::uuid
        ${companyFilter}
    `,
    values
  );
  return num(res.rows[0]?.c);
}

async function loadIncomingMessageQueue(
  client: Queryable,
  userId: string,
  operatingCompanyId?: string
): Promise<number> {
  if (!(await relationExists(client, "mdata.driver_profile_messages"))) return 0;

  const values: unknown[] = [userId];
  let companyFilter = "";
  if (operatingCompanyId) {
    values.push(operatingCompanyId);
    companyFilter = "AND l.operating_company_id = $2::uuid";
  }

  const res = await client.query<{ c: number }>(
    `
      SELECT COUNT(DISTINCT m.id)::int AS c
      FROM mdata.driver_profile_messages m
      JOIN mdata.drivers d ON d.id = m.driver_id
      JOIN mdata.loads l
        ON (
          l.assigned_primary_driver_id = m.driver_id
          OR l.assigned_secondary_driver_id = m.driver_id
        )
      WHERE l.soft_deleted_at IS NULL
        AND l.dispatcher_user_id = $1::uuid
        AND m.read_at IS NULL
        AND m.created_by IS NOT NULL
        AND m.created_by = d.identity_user_id
        ${companyFilter}
    `,
    values
  );
  return num(res.rows[0]?.c);
}

export async function getDispatcherHomeData(
  userId: string,
  options: DispatcherHomeOptions = {}
): Promise<DispatcherHomeData> {
  return withCurrentUser(userId, async (client) => {
    // Entity scope (USMCA cross-entity leak fix): the dispatcher home blends mdata.loads across
    // entities (these queries scope by dispatcher_user_id but NOT by operating company). ALWAYS
    // resolve the operating company so every one of the five queries binds the company predicate.
    const operatingCompanyId =
      options.operatingCompanyId ?? (await resolveOperatingCompanyId(client, userId)) ?? undefined;
    const [kpis, activeLoads, bookingGap, detentionApprovals, incomingQueue] = await Promise.all([
      loadKpis(client, userId, operatingCompanyId),
      loadActiveLoads(client, userId, operatingCompanyId),
      loadBookingGap(client, userId, operatingCompanyId),
      loadPendingDetentionApprovals(client, userId, operatingCompanyId),
      loadIncomingMessageQueue(client, userId, operatingCompanyId),
    ]);

    return {
      generated_at: new Date().toISOString(),
      kpis,
      active_loads: activeLoads,
      pending_actions: {
        detention_approvals: detentionApprovals,
        incoming_message_queue: incomingQueue,
        booking_gap_open: bookingGap.unresolved_dispatch_gaps_7d,
      },
      booking_gap_analytics: bookingGap,
    };
  });
}
