/** B31: Unified service history timeline for vehicle (unit_id) and trailer (equipment_id). */
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";
import { withCurrentUser } from "../auth/db.js";
import { requireAuth } from "../auth/session-middleware.js";
import { assertCompanyMembership } from "../_helpers/company-membership-guard.js";

export const SERVICE_TIMELINE_EVENT_TYPES = [
  "work_order",
  "inspection",
  "pm",
  "fuel",
  "accident",
] as const;

export type ServiceTimelineEventType = (typeof SERVICE_TIMELINE_EVENT_TYPES)[number];

export type ServiceTimelineEvent = {
  id: string;
  event_type: ServiceTimelineEventType;
  occurred_at: string;
  title: string;
  subtitle: string | null;
  status: string | null;
  detail_path: string;
};

type DbClient = {
  query: <T = Record<string, unknown>>(sql: string, values?: unknown[]) => Promise<{ rows: T[] }>;
};

const timelineQuerySchema = z
  .object({
    operating_company_id: z.string().uuid(),
    unit_id: z.string().uuid().optional(),
    equipment_id: z.string().uuid().optional(),
    event_types: z.string().optional(),
    from_date: z.string().date().optional(),
    to_date: z.string().date().optional(),
    limit: z.coerce.number().int().min(1).max(200).default(50),
  })
  .refine((v) => Boolean(v.unit_id) !== Boolean(v.equipment_id), {
    message: "exactly one of unit_id or equipment_id is required",
  });

function authed(req: FastifyRequest, reply: FastifyReply) {
  if (!requireAuth(req, reply)) return null;
  return req.user;
}

function validationError(reply: FastifyReply, err: z.ZodError) {
  return reply.code(400).send({ error: "validation_error", details: err.flatten() });
}

async function withCompany<T>(userId: string, companyId: string, fn: (client: DbClient) => Promise<T>) {
  await assertCompanyMembership(userId, companyId);
  return withCurrentUser(userId, async (client) => {
    await client.query(`SELECT set_config('app.operating_company_id', $1, true)`, [companyId]);
    return fn(client as DbClient);
  });
}

async function relationExists(client: DbClient, relation: string): Promise<boolean> {
  const res = await client.query<{ ok: boolean }>(`SELECT to_regclass($1) IS NOT NULL AS ok`, [relation]);
  return Boolean(res.rows[0]?.ok);
}

export function parseServiceTimelineEventTypes(raw: string | undefined): ServiceTimelineEventType[] {
  if (!raw?.trim()) return [...SERVICE_TIMELINE_EVENT_TYPES];
  const allowed = new Set<string>(SERVICE_TIMELINE_EVENT_TYPES);
  const parsed = raw
    .split(",")
    .map((part) => part.trim())
    .filter((part): part is ServiceTimelineEventType => allowed.has(part));
  return parsed.length ? parsed : [...SERVICE_TIMELINE_EVENT_TYPES];
}

export function filterServiceTimelineByDateRange(
  events: ServiceTimelineEvent[],
  fromDate?: string,
  toDate?: string
): ServiceTimelineEvent[] {
  const fromMs = fromDate ? Date.parse(`${fromDate}T00:00:00.000Z`) : null;
  const toMs = toDate ? Date.parse(`${toDate}T23:59:59.999Z`) : null;
  return events.filter((event) => {
    const ms = Date.parse(event.occurred_at);
    if (Number.isNaN(ms)) return true;
    if (fromMs != null && ms < fromMs) return false;
    if (toMs != null && ms > toMs) return false;
    return true;
  });
}

export function mergeServiceTimelineEvents(events: ServiceTimelineEvent[], limit: number): ServiceTimelineEvent[] {
  return [...events]
    .sort((a, b) => Date.parse(b.occurred_at) - Date.parse(a.occurred_at))
    .slice(0, limit);
}

export function resolveServiceTimelineDetailPath(
  eventType: ServiceTimelineEventType,
  id: string,
  workOrderId?: string | null
): string {
  switch (eventType) {
    case "work_order":
      return `/maintenance/work-orders/${id}`;
    case "inspection":
      return `/maintenance/inspections?inspection_id=${encodeURIComponent(id)}`;
    case "pm":
      return workOrderId
        ? `/maintenance/work-orders/${workOrderId}`
        : "/maintenance/pm-auto-engine";
    case "fuel":
      return `/fuel/planner?transaction_id=${encodeURIComponent(id)}`;
    case "accident":
      return `/safety/accidents?accident_id=${encodeURIComponent(id)}`;
    default:
      return "/maintenance";
  }
}

async function fetchWorkOrderEvents(
  client: DbClient,
  input: { operating_company_id: string; unit_id?: string; equipment_id?: string }
): Promise<ServiceTimelineEvent[]> {
  if (!(await relationExists(client, "maintenance.work_orders"))) return [];
  const values: unknown[] = [input.operating_company_id];
  const where = ["w.operating_company_id = $1", "w.status <> 'cancelled'"];
  if (input.unit_id) {
    values.push(input.unit_id);
    where.push(`w.unit_id = $${values.length}`);
  } else if (input.equipment_id) {
    values.push(input.equipment_id);
    where.push(`w.equipment_id = $${values.length}`);
  }
  const res = await client.query<{
    id: string;
    display_id: string | null;
    wo_type: string;
    status: string;
    description: string | null;
    opened_at: string | null;
    updated_at: string | null;
  }>(
    `
      SELECT
        w.id::text,
        w.display_id,
        w.wo_type,
        w.status,
        w.description,
        w.opened_at::text,
        w.updated_at::text
      FROM maintenance.work_orders w
      WHERE ${where.join(" AND ")}
      ORDER BY COALESCE(w.opened_at, w.updated_at, w.created_at) DESC NULLS LAST
      LIMIT 200
    `,
    values
  );
  return res.rows.map((row) => ({
    id: row.id,
    event_type: "work_order" as const,
    occurred_at: row.opened_at ?? row.updated_at ?? new Date(0).toISOString(),
    title: row.display_id ? `WO ${row.display_id}` : `Work order ${row.wo_type}`,
    subtitle: row.description,
    status: row.status,
    detail_path: resolveServiceTimelineDetailPath("work_order", row.id),
  }));
}

async function fetchInspectionEvents(
  client: DbClient,
  input: { operating_company_id: string; unit_id: string }
): Promise<ServiceTimelineEvent[]> {
  if (!(await relationExists(client, "maintenance.inspections"))) return [];
  const res = await client.query<{
    id: string;
    inspection_type: string;
    status: string;
    inspection_date: string | null;
    scheduled_date: string | null;
    updated_at: string | null;
  }>(
    `
      SELECT
        i.id::text,
        i.inspection_type,
        i.status,
        i.inspection_date::text,
        i.scheduled_date::text,
        i.updated_at::text
      FROM maintenance.inspections i
      WHERE i.operating_company_id = $1
        AND i.unit_id = $2
        AND i.archived_at IS NULL
      ORDER BY COALESCE(i.inspection_date, i.scheduled_date, i.updated_at) DESC NULLS LAST
      LIMIT 200
    `,
    [input.operating_company_id, input.unit_id]
  );
  return res.rows.map((row) => ({
    id: row.id,
    event_type: "inspection" as const,
    occurred_at:
      row.inspection_date ?? row.scheduled_date ?? row.updated_at ?? new Date(0).toISOString(),
    title: `Inspection · ${row.inspection_type.replace(/_/g, " ")}`,
    subtitle: null,
    status: row.status,
    detail_path: resolveServiceTimelineDetailPath("inspection", row.id),
  }));
}

async function fetchPmEvents(
  client: DbClient,
  input: { operating_company_id: string; unit_id: string }
): Promise<ServiceTimelineEvent[]> {
  if (!(await relationExists(client, "maintenance.pm_auto_wo_log"))) return [];
  const res = await client.query<{
    id: string;
    action: string;
    work_order_id: string | null;
    detail: Record<string, unknown> | null;
    created_at: string;
    schedule_label: string | null;
  }>(
    `
      SELECT
        l.id::text,
        l.action,
        l.work_order_id::text,
        l.detail,
        l.created_at::text,
        ps.label AS schedule_label
      FROM maintenance.pm_auto_wo_log l
      LEFT JOIN maintenance.pm_schedules ps ON ps.id = l.pm_schedule_id
      WHERE l.operating_company_id = $1
        AND l.unit_id = $2
      ORDER BY l.created_at DESC
      LIMIT 200
    `,
    [input.operating_company_id, input.unit_id]
  );
  return res.rows.map((row) => ({
    id: row.id,
    event_type: "pm" as const,
    occurred_at: row.created_at,
    title: row.schedule_label ? `PM · ${row.schedule_label}` : `PM · ${row.action.replace(/_/g, " ")}`,
    subtitle: typeof row.detail?.reason === "string" ? row.detail.reason : null,
    status: row.action,
    detail_path: resolveServiceTimelineDetailPath("pm", row.id, row.work_order_id),
  }));
}

async function fetchFuelEvents(
  client: DbClient,
  input: { operating_company_id: string; unit_id: string }
): Promise<ServiceTimelineEvent[]> {
  if (!(await relationExists(client, "fuel.fuel_transactions"))) return [];
  const res = await client.query<{
    id: string;
    transaction_at: string;
    fuel_type: string;
    gallons: string | null;
    total_cost: string;
    location_city: string | null;
    location_state: string | null;
  }>(
    `
      SELECT
        ft.id::text,
        ft.transaction_at::text,
        ft.fuel_type,
        ft.gallons::text,
        ft.total_cost::text,
        ft.location_city,
        ft.location_state
      FROM fuel.fuel_transactions ft
      WHERE ft.operating_company_id = $1
        AND ft.unit_id = $2
        AND ft.archived_at IS NULL
      ORDER BY ft.transaction_at DESC
      LIMIT 200
    `,
    [input.operating_company_id, input.unit_id]
  );
  return res.rows.map((row) => {
    const location = [row.location_city, row.location_state].filter(Boolean).join(", ");
    return {
      id: row.id,
      event_type: "fuel" as const,
      occurred_at: row.transaction_at,
      title: `Fuel · ${row.fuel_type.replace(/_/g, " ")}`,
      subtitle: location || (row.gallons ? `${row.gallons} gal · $${row.total_cost}` : `$${row.total_cost}`),
      status: null,
      detail_path: resolveServiceTimelineDetailPath("fuel", row.id),
    };
  });
}

async function fetchAccidentEvents(
  client: DbClient,
  input: { operating_company_id: string; unit_id: string }
): Promise<ServiceTimelineEvent[]> {
  if (!(await relationExists(client, "safety.accident_reports"))) return [];
  try {
    const res = await client.query<{
      id: string;
      status: string | null;
      accident_at: string | null;
      description: string | null;
    }>(
      `
        SELECT
          ar.id::text,
          ar.status,
          ar.accident_at::text,
          ar.description
        FROM safety.accident_reports ar
        WHERE ar.operating_company_id = $1
          AND ar.unit_id = $2
        ORDER BY ar.accident_at DESC NULLS LAST
        LIMIT 200
      `,
      [input.operating_company_id, input.unit_id]
    );
    return res.rows.map((row) => ({
      id: row.id,
      event_type: "accident" as const,
      occurred_at: row.accident_at ?? new Date(0).toISOString(),
      title: "Accident report",
      subtitle: row.description,
      status: row.status,
      detail_path: resolveServiceTimelineDetailPath("accident", row.id),
    }));
  } catch {
    return [];
  }
}

export async function aggregateServiceTimeline(
  client: DbClient,
  input: {
    operating_company_id: string;
    unit_id?: string;
    equipment_id?: string;
    event_types?: ServiceTimelineEventType[];
    from_date?: string;
    to_date?: string;
    limit?: number;
  }
): Promise<ServiceTimelineEvent[]> {
  const types = new Set(input.event_types?.length ? input.event_types : SERVICE_TIMELINE_EVENT_TYPES);
  const collected: ServiceTimelineEvent[] = [];

  if (types.has("work_order")) {
    collected.push(
      ...(await fetchWorkOrderEvents(client, {
        operating_company_id: input.operating_company_id,
        unit_id: input.unit_id,
        equipment_id: input.equipment_id,
      }))
    );
  }

  if (input.unit_id) {
    if (types.has("inspection")) {
      collected.push(
        ...(await fetchInspectionEvents(client, {
          operating_company_id: input.operating_company_id,
          unit_id: input.unit_id,
        }))
      );
    }
    if (types.has("pm")) {
      collected.push(
        ...(await fetchPmEvents(client, {
          operating_company_id: input.operating_company_id,
          unit_id: input.unit_id,
        }))
      );
    }
    if (types.has("fuel")) {
      collected.push(
        ...(await fetchFuelEvents(client, {
          operating_company_id: input.operating_company_id,
          unit_id: input.unit_id,
        }))
      );
    }
    if (types.has("accident")) {
      collected.push(
        ...(await fetchAccidentEvents(client, {
          operating_company_id: input.operating_company_id,
          unit_id: input.unit_id,
        }))
      );
    }
  }

  const filtered = filterServiceTimelineByDateRange(collected, input.from_date, input.to_date);
  return mergeServiceTimelineEvents(filtered, input.limit ?? 50);
}

export async function registerMaintenanceServiceTimelineRoutes(app: FastifyInstance) {
  // ARCHIVE-not-DELETE Sunset: profile recent-activity stubs remain; ServiceTimeline (B31) is canonical drill-down surface.
  app.get("/api/v1/maintenance/service-timeline", async (req, reply) => {
    const user = authed(req, reply);
    if (!user) return;
    const parsed = timelineQuerySchema.safeParse(req.query ?? {});
    if (!parsed.success) return validationError(reply, parsed.error);
    const q = parsed.data;
    const eventTypes = parseServiceTimelineEventTypes(q.event_types);

    const events = await withCompany(user.uuid, q.operating_company_id, async (client) =>
      aggregateServiceTimeline(client, {
        operating_company_id: q.operating_company_id,
        unit_id: q.unit_id,
        equipment_id: q.equipment_id,
        event_types: eventTypes,
        from_date: q.from_date,
        to_date: q.to_date,
        limit: q.limit,
      })
    );

    return {
      events,
      filters: {
        event_types: eventTypes,
        from_date: q.from_date ?? null,
        to_date: q.to_date ?? null,
        unit_id: q.unit_id ?? null,
        equipment_id: q.equipment_id ?? null,
      },
    };
  });
}
