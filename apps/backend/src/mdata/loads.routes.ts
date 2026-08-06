import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";
import { latchOnDeliveryEvidence } from "../dispatch/delivery-evidence-latch.js";
import { appendCrudAudit, buildPatchChanges } from "../audit/crud-audit.js";
import { withCurrentUser } from "../auth/db.js";
import { requireAuth } from "../auth/session-middleware.js";
import { emitAutoProposedEscrowEvents } from "../driver-finance/escrow-deduction-pending.service.js";
import { computeProgressStatus } from "../telematics/load-progress.service.js";
import { effectiveDeliverySelectSql } from "../dispatch/effective-delivery.js";
import { resolveOperatingCompanyId } from "../auth/operating-company-scope.js";
import { assertCompanyMembership } from "../_helpers/company-membership-guard.js";
import { companyBusinessDateCompact } from "../lib/company-business-date.js";
import { writeLoadCancellationRecord } from "../dispatch/cancellation.service.js";
import {
  loadStatusRequiresDeliveryDepartureStamp,
  stampFinalActiveDeliveryDeparture,
} from "../dispatch/stamp-final-delivery-departure.js";

const loadStatusSchema = z.enum([
  "draft",
  "booked",
  "planned",
  "unassigned",
  "assigned",
  "assigned_not_dispatched",
  "dispatched",
  "at_pickup",
  "in_transit",
  "at_delivery",
  "delivered",
  "delivered_pending_docs",
  "completed_docs_received",
  "invoiced",
  "paid",
  "closed",
  "cancelled",
  "abandoned",
  "driver_walkoff",
  "driver_no_show",
]);

const stopTypeSchema = z.enum(["pickup", "delivery", "fuel", "rest", "border"]);
const stopStatusSchema = z.enum(["pending", "arrived", "departed", "cancelled"]);
const isoDatetimeSchema = z.string().datetime({ offset: true });
const isoDateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

const optionalUuidQueryFilter = z.preprocess((value) => (value === "" ? undefined : value), z.string().uuid().optional());

function normalizeLoadSort(value: unknown) {
  if (typeof value !== "string") return value;
  const normalized = value.trim().toLowerCase();
  if (normalized === "pickup_date") return "pickup_date:asc";
  if (normalized === "-pickup_date") return "pickup_date:desc";
  return normalized;
}

const statusFilterSchema = z
  .preprocess((value) => {
    if (Array.isArray(value)) return value;
    if (typeof value === "string") return value.split(",").map((entry) => entry.trim()).filter(Boolean);
    return undefined;
  }, z.array(loadStatusSchema).max(20).optional())
  .optional();

const listLoadsQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(200).default(50),
  offset: z.coerce.number().int().min(0).default(0),
  status: statusFilterSchema,
  statuses: statusFilterSchema,
  customer_id: optionalUuidQueryFilter,
  driver_id: optionalUuidQueryFilter,
  operating_company_id: z
    .preprocess((value) => {
      if (Array.isArray(value)) {
        const entries = value
          .map((entry) => (entry === "" ? undefined : entry))
          .filter((entry): entry is string => typeof entry === "string")
          .map((entry) => entry.trim())
          .filter(Boolean);
        return entries.length > 0 ? entries : undefined;
      }
      if (typeof value === "string") {
        const entries = value.split(",").map((entry) => entry.trim()).filter(Boolean);
        return entries.length > 0 ? entries : undefined;
      }
      return undefined;
    }, z.array(z.string().uuid()).max(20).optional())
    .optional(),
  pickup_date_from: isoDateSchema.optional(),
  pickup_date_to: isoDateSchema.optional(),
  delivery_date_from: isoDateSchema.optional(),
  delivery_date_to: isoDateSchema.optional(),
  from_date: isoDateSchema.optional(),
  to_date: isoDateSchema.optional(),
  search: z.string().trim().min(1).max(120).optional(),
  // BUG3: invoice-from-load uses the established dash-prefix convention. Normalize its canonical
  // pickup aliases before applying the fixed allowlist; never masquerade pickup sorting as created_at.
  // Truly invalid sorts retain the documented fail-soft contract and use created_at:desc.
  sort: z.preprocess(
    normalizeLoadSort,
    z
      .string()
      .regex(/^(created_at|load_number|status|rate_total_cents|pickup_date):(asc|desc)$/)
      .default("created_at:desc")
      .catch("created_at:desc")
  ),
  include_progress: z.coerce.boolean().default(false),
});

const loadStatusTransitionBodySchema = z.object({
  new_status: loadStatusSchema,
  cancellation_reason_code: z.string().trim().min(2).max(80).optional(),
  cancellation_notes: z.string().trim().max(2000).optional(),
});

const loadIdParamSchema = z.object({ id: z.string().uuid() });
const loadStopParamsSchema = z.object({
  id: z.string().uuid(),
  stopId: z.string().uuid(),
});

const createLoadBodySchema = z.object({
  operating_company_id: z.string().uuid(),
  customer_id: z.string().uuid(),
  status: loadStatusSchema.default("draft"),
  rate_total_cents: z.coerce.number().int().min(0).default(0),
  currency_code: z.enum(["USD", "MXN"]).default("USD"),
  assigned_unit_id: z.string().uuid().optional(),
  assigned_primary_driver_id: z.string().uuid().optional(),
  assigned_secondary_driver_id: z.string().uuid().optional(),
  team_id: z.string().uuid().optional(),
  notes: z.string().trim().max(5000).optional(),
  pickup: z.object({
    location_id: z.string().uuid().optional(),
    address_line1: z.string().trim().max(300).optional(),
    city: z.string().trim().min(1).max(120),
    state: z.string().trim().min(1).max(120),
    country: z.string().trim().min(1).max(120),
    scheduled_arrival_at: isoDatetimeSchema,
  }).optional(),
  delivery: z.object({
    location_id: z.string().uuid().optional(),
    address_line1: z.string().trim().max(300).optional(),
    city: z.string().trim().min(1).max(120),
    state: z.string().trim().min(1).max(120),
    country: z.string().trim().min(1).max(120),
    scheduled_arrival_at: isoDatetimeSchema,
  }).optional(),
});

const updateLoadBodySchema = z
  .object({
    customer_id: z.string().uuid().optional(),
    status: loadStatusSchema.optional(),
    rate_total_cents: z.coerce.number().int().min(0).optional(),
    currency_code: z.enum(["USD", "MXN"]).optional(),
    assigned_unit_id: z.string().uuid().nullable().optional(),
    assigned_primary_driver_id: z.string().uuid().nullable().optional(),
    assigned_secondary_driver_id: z.string().uuid().nullable().optional(),
    team_id: z.string().uuid().nullable().optional(),
    notes: z.string().trim().max(5000).nullable().optional(),
    soft_deleted_at: isoDatetimeSchema.nullable().optional(),
  })
  .refine((v) => Object.keys(v).length > 0, { message: "at least one field is required" });

const createStopBodySchema = z.object({
  sequence_number: z.coerce.number().int().min(1),
  stop_type: stopTypeSchema,
  location_id: z.string().uuid().optional(),
  address_line1: z.string().trim().max(300).optional(),
  city: z.string().trim().max(120).optional(),
  state: z.string().trim().max(120).optional(),
  country: z.string().trim().max(120).optional(),
  scheduled_arrival_at: isoDatetimeSchema.optional(),
  scheduled_departure_at: isoDatetimeSchema.optional(),
  actual_arrival_at: isoDatetimeSchema.optional(),
  actual_departure_at: isoDatetimeSchema.optional(),
  status: stopStatusSchema.default("pending"),
  notes: z.string().trim().max(5000).optional(),
});

const updateStopBodySchema = z
  .object({
    sequence_number: z.coerce.number().int().min(1).optional(),
    stop_type: stopTypeSchema.optional(),
    location_id: z.string().uuid().nullable().optional(),
    address_line1: z.string().trim().max(300).nullable().optional(),
    city: z.string().trim().max(120).nullable().optional(),
    state: z.string().trim().max(120).nullable().optional(),
    country: z.string().trim().max(120).nullable().optional(),
    scheduled_arrival_at: isoDatetimeSchema.nullable().optional(),
    scheduled_departure_at: isoDatetimeSchema.nullable().optional(),
    actual_arrival_at: isoDatetimeSchema.nullable().optional(),
    actual_departure_at: isoDatetimeSchema.nullable().optional(),
    status: stopStatusSchema.optional(),
    notes: z.string().trim().max(5000).nullable().optional(),
  })
  .refine((v) => Object.keys(v).length > 0, { message: "at least one field is required" });

function currentAuthUser(req: FastifyRequest, reply: FastifyReply) {
  if (!requireAuth(req, reply)) return null;
  return req.user;
}

function sendValidationError(reply: FastifyReply, error: z.ZodError) {
  return reply.code(400).send({ error: "validation_error", details: error.flatten() });
}

function isOfficeWriteRole(role: string): boolean {
  return role === "Owner" || role === "Administrator" || role === "Manager" || role === "Dispatcher";
}

function isOwnerRole(role: string): boolean {
  return role === "Owner";
}

function toCompanyLoadToken(input: string | null | undefined): string {
  const cleaned = String(input ?? "")
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "");
  return cleaned || "COMP";
}

function statusToFlagCode(status: z.infer<typeof loadStatusSchema>): string {
  if (status === "cancelled") return "RED";
  if (status === "abandoned" || status === "driver_walkoff" || status === "driver_no_show") return "RED";
  if (status === "closed" || status === "paid" || status === "invoiced" || status === "completed_docs_received") {
    return "BLACK";
  }
  if (status === "delivered" || status === "delivered_pending_docs") return "GREEN";
  if (status === "at_pickup" || status === "in_transit" || status === "at_delivery") return "BLUE";
  if (status === "assigned" || status === "assigned_not_dispatched" || status === "dispatched") return "YELLOW";
  return "GRAY";
}

const allowedStatusTransitions: Record<z.infer<typeof loadStatusSchema>, z.infer<typeof loadStatusSchema>[]> = {
  draft: ["booked", "planned", "unassigned", "cancelled"],
  booked: ["planned", "unassigned", "assigned", "assigned_not_dispatched", "driver_no_show", "cancelled"],
  planned: ["unassigned", "assigned", "assigned_not_dispatched", "driver_no_show", "cancelled"],
  unassigned: ["booked", "planned", "assigned", "assigned_not_dispatched", "cancelled"],
  assigned: ["assigned_not_dispatched", "dispatched", "driver_no_show", "cancelled"],
  assigned_not_dispatched: ["dispatched", "driver_no_show", "cancelled"],
  dispatched: ["at_pickup", "driver_no_show", "driver_walkoff", "cancelled"],
  at_pickup: ["in_transit", "driver_walkoff", "cancelled"],
  in_transit: ["at_delivery", "abandoned", "driver_walkoff", "cancelled"],
  at_delivery: ["delivered", "delivered_pending_docs", "cancelled"],
  delivered: ["delivered_pending_docs", "completed_docs_received", "invoiced", "cancelled"],
  delivered_pending_docs: ["completed_docs_received", "invoiced", "cancelled"],
  completed_docs_received: ["invoiced", "closed"],
  invoiced: ["paid", "closed"],
  paid: ["closed"],
  closed: [],
  cancelled: [],
  abandoned: [],
  driver_walkoff: [],
  driver_no_show: [],
};

async function nextLoadNumber(
  client: {
    query: <T extends Record<string, unknown> = Record<string, unknown>>(
      sql: string,
      values?: unknown[]
    ) => Promise<{ rows: T[] }>;
  },
  operatingCompanyId: string
): Promise<string> {
  const companyRes = await client.query<{ code: string | null; short_name: string | null }>(
    `
      SELECT code, short_name
      FROM org.companies
      WHERE id = $1
      LIMIT 1
    `,
    [operatingCompanyId]
  );
  const company = companyRes.rows[0];
  if (!company) throw new Error("operating_company_not_found");
  const token = toCompanyLoadToken(company.short_name ?? company.code);
  // Company-timezone business date — NOT UTC — so the persisted Load Number date matches the
  // booking day in Central (see lib/company-business-date).
  const datePart = companyBusinessDateCompact();
  const prefix = `L${token}-${datePart}-`;

  const seqRes = await client.query<{ next_seq: number }>(
    `
      SELECT COALESCE(MAX(COALESCE(NULLIF(substring(load_number FROM '([0-9]{4})$'), ''), '0')::int), 0) + 1 AS next_seq
      FROM mdata.loads
      WHERE operating_company_id = $1
        AND load_number LIKE $2
    `,
    [operatingCompanyId, `${prefix}%`]
  );
  const nextSeq = Number(seqRes.rows[0]?.next_seq ?? 1);
  return `${prefix}${String(nextSeq).padStart(4, "0")}`;
}

export async function registerLoadRoutes(app: FastifyInstance) {
  app.post("/api/v1/mdata/loads", async (req, reply) => {
    const authUser = currentAuthUser(req, reply);
    if (!authUser) return;
    if (!isOfficeWriteRole(authUser.role)) return reply.code(403).send({ error: "forbidden" });

    const parsedBody = createLoadBodySchema.safeParse(req.body ?? {});
    if (!parsedBody.success) return sendValidationError(reply, parsedBody.error);
    const b = parsedBody.data;

    if ((b.pickup && !b.delivery) || (!b.pickup && b.delivery)) {
      return reply.code(400).send({ error: "pickup_and_delivery_required_together" });
    }
    if (b.assigned_primary_driver_id && b.team_id) {
      return reply.code(400).send({ error: "solo_or_team_assignment_required_not_both" });
    }

    await assertCompanyMembership(authUser.uuid, b.operating_company_id);

    try {
      const created = await withCurrentUser(authUser.uuid, async (client) => {
        const customerRes = await client.query<{ id: string }>(
          `
            SELECT id
            FROM mdata.customers
            WHERE id = $1
              AND operating_company_id = $2
              AND deactivated_at IS NULL
            LIMIT 1
          `,
          [b.customer_id, b.operating_company_id]
        );
        if (customerRes.rows.length === 0) {
          return { error: "invalid_customer_for_company" as const };
        }

        let loadNumber = "";
        let inserted: Record<string, unknown> | null = null;
        for (let attempt = 0; attempt < 3; attempt += 1) {
          loadNumber = await nextLoadNumber(client, b.operating_company_id);
          // SAVEPOINT so a concurrent-booking unique collision (23505 on load_number) can be rolled back
          // in isolation. Without it the failed INSERT aborts the whole transaction and the retry's own
          // nextLoadNumber SELECT throws "current transaction is aborted" — i.e. the retry never worked
          // and the caller still got a 500. (Load-number collision 500 — G9-M.)
          await client.query(`SAVEPOINT create_load`);
          try {
            const res = await client.query(
              `
                INSERT INTO mdata.loads (
                  operating_company_id, load_number, customer_id, status, rate_total_cents, currency_code,
                  assigned_unit_id, assigned_primary_driver_id, assigned_secondary_driver_id, team_id,
                  dispatcher_user_id, notes
                ) VALUES (
                  $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12
                )
                RETURNING
                  id, operating_company_id, load_number, customer_id, status, rate_total_cents, currency_code,
                  assigned_unit_id, assigned_primary_driver_id, assigned_secondary_driver_id, team_id,
                  dispatcher_user_id, notes, created_at, updated_at, soft_deleted_at, deleted_by_user_id
              `,
              [
                b.operating_company_id,
                loadNumber,
                b.customer_id,
                b.status,
                b.rate_total_cents,
                b.currency_code,
                b.assigned_unit_id ?? null,
                b.assigned_primary_driver_id ?? null,
                b.assigned_secondary_driver_id ?? null,
                b.team_id ?? null,
                authUser.uuid,
                b.notes ?? null,
              ]
            );
            await client.query(`RELEASE SAVEPOINT create_load`);
            inserted = res.rows[0] ?? null;
            break;
          } catch (err) {
            await client.query(`ROLLBACK TO SAVEPOINT create_load`).catch(() => undefined);
            if ((err as { code?: string }).code !== "23505") throw err;
            if (attempt === 2) throw err;
          }
        }
        if (!inserted) throw new Error("load_insert_failed");

        const createdStops: Array<Record<string, unknown>> = [];
        if (b.pickup && b.delivery) {
          const stopDefs = [
            { sequence_number: 1, stop_type: "pickup" as const, stop: b.pickup },
            { sequence_number: 2, stop_type: "delivery" as const, stop: b.delivery },
          ];
          for (const stopDef of stopDefs) {
            const stopRes = await client.query(
              `
                INSERT INTO mdata.load_stops (
                  load_id, sequence_number, stop_type, location_id, address_line1, city, state, country, scheduled_arrival_at, status
                ) VALUES (
                  $1,$2,$3,$4,$5,$6,$7,$8,$9,'pending'
                )
                RETURNING
                  id, load_id, sequence_number, stop_type, location_id, address_line1, city, state, country,
                  scheduled_arrival_at, scheduled_departure_at, actual_arrival_at, actual_departure_at,
                  status, notes, created_at, updated_at
              `,
              [
                inserted.id,
                stopDef.sequence_number,
                stopDef.stop_type,
                stopDef.stop.location_id ?? null,
                stopDef.stop.address_line1 ?? null,
                stopDef.stop.city,
                stopDef.stop.state,
                stopDef.stop.country,
                stopDef.stop.scheduled_arrival_at,
              ]
            );
            const stopRow = stopRes.rows[0] ?? null;
            if (stopRow) createdStops.push(stopRow);
          }
        }

        await appendCrudAudit(
          client,
          authUser.uuid,
          "mdata.loads.created",
          {
            resource_id: inserted.id,
            resource_type: "mdata.loads",
            entity_type: "load",
            entity_id: inserted.id,
            load_number: inserted.load_number,
            operating_company_id: inserted.operating_company_id,
            customer_id: inserted.customer_id,
            status: inserted.status,
          },
          "info",
          "BT-3-DISPATCH-BOARD"
        );

        for (const stopRow of createdStops) {
          await appendCrudAudit(
            client,
            authUser.uuid,
            "mdata.load_stops.created",
            {
              resource_id: stopRow.id,
              resource_type: "mdata.load_stops",
              entity_type: "load",
              entity_id: inserted.id,
              load_id: inserted.id,
              sequence_number: stopRow.sequence_number,
              stop_type: stopRow.stop_type,
              status: stopRow.status,
            },
            "info",
            "BT-3-DISPATCH-BOARD"
          );
        }

        if (inserted.assigned_unit_id || inserted.assigned_primary_driver_id || inserted.assigned_secondary_driver_id || inserted.team_id) {
          await appendCrudAudit(
            client,
            authUser.uuid,
            "mdata.loads.assigned",
            {
              resource_id: inserted.id,
              resource_type: "mdata.loads",
              entity_type: "load",
              entity_id: inserted.id,
              assigned_unit_id: inserted.assigned_unit_id,
              assigned_primary_driver_id: inserted.assigned_primary_driver_id,
              assigned_secondary_driver_id: inserted.assigned_secondary_driver_id,
              team_id: inserted.team_id,
            },
            "info",
            "BT-3-DISPATCH-BOARD"
          );
        }

        if (createdStops.length === 0) {
          return inserted;
        }
        return { ...inserted, stops: createdStops };
      });

      if (created && typeof created === "object" && "error" in created) {
        if (created.error === "invalid_customer_for_company") return reply.code(400).send({ error: created.error });
      }

      return reply.code(201).send(created);
    } catch (err) {
      const code = (err as { code?: string }).code;
      if (code === "23503") return reply.code(400).send({ error: "invalid_foreign_key" });
      if (code === "23505") return reply.code(409).send({ error: "mdata_load_conflict" });
      throw err;
    }
  });

  app.get("/api/v1/mdata/loads", async (req, reply) => {
    const authUser = currentAuthUser(req, reply);
    if (!authUser) return;
    const parsedQuery = listLoadsQuerySchema.safeParse(req.query ?? {});
    if (!parsedQuery.success) return sendValidationError(reply, parsedQuery.error);
    const {
      limit,
      offset,
      status: statusParam,
      statuses: statusesParam,
      customer_id,
      driver_id,
      operating_company_id,
      pickup_date_from,
      pickup_date_to,
      delivery_date_from,
      delivery_date_to,
      from_date,
      to_date,
      search,
      sort,
      include_progress,
    } = parsedQuery.data;
    // DISP-FILTER-01: FE URL uses `statuses=` (plural); API historically only documented `status=`.
    // Accept both and merge (dedupe) so pending-docs filters do not 400 or no-op.
    const status = Array.from(new Set([...(statusParam ?? []), ...(statusesParam ?? [])]));
    const [sortField, sortDir] = sort.toLowerCase().split(":") as [string, "asc" | "desc"];
    const sortColumnMap: Record<string, string> = {
      created_at: "l.created_at",
      load_number: "l.load_number",
      status: "l.status",
      rate_total_cents: "l.rate_total_cents",
      // Canonical pickup date is the first active pickup stop's scheduled timestamp. There is no
      // mdata.loads.pickup_date column; the lateral `sp` relation is already the list/filter source.
      pickup_date: "sp.scheduled_arrival_at",
    };
    const sortColumn = sortColumnMap[sortField] ?? "l.created_at";
    const sortDirection = sortDir === "asc" ? "ASC" : "DESC";
    const sortOrderSql =
      sortField === "created_at"
        ? `${sortColumn} ${sortDirection}, l.id ASC`
        : `${sortColumn} ${sortDirection} NULLS LAST, l.created_at DESC, l.id ASC`;

    const listResult = await withCurrentUser(authUser.uuid, async (client) => {
      const values: unknown[] = [];
      let scopedCompanyIds: string[];
      if (operating_company_id && operating_company_id.length > 0) {
        scopedCompanyIds = operating_company_id;
      } else {
        const scopedCompanyId = await resolveOperatingCompanyId(client, authUser.uuid);
        if (!scopedCompanyId) return { rows: [], totalCount: 0 };
        // membership-scope-exempt: transaction-resolved-user-company
        await client.query(`SELECT set_config('app.operating_company_id', $1, true)`, [scopedCompanyId]);
        scopedCompanyIds = [scopedCompanyId];
      }
      // Keep the company scope as parameter 1 so both SQL literals carry a visible, fail-closed
      // entity predicate while preserving the requested-company-set and resolved-company behavior.
      values.push(scopedCompanyIds);
      const filters: string[] = ["l.soft_deleted_at IS NULL"];

      if (status && status.length > 0) {
        values.push(status);
        filters.push(`l.status = ANY($${values.length}::mdata.load_status_enum[])`);
      }
      if (customer_id) {
        values.push(customer_id);
        filters.push(`l.customer_id = $${values.length}`);
      }
      if (driver_id) {
        values.push(driver_id);
        filters.push(`(l.assigned_primary_driver_id = $${values.length} OR l.assigned_secondary_driver_id = $${values.length})`);
      }
      const pickupFrom = pickup_date_from ?? from_date;
      const pickupTo = pickup_date_to ?? to_date;
      if (pickupFrom) {
        values.push(pickupFrom);
        filters.push(`sp.scheduled_arrival_at::date >= $${values.length}::date`);
      }
      if (pickupTo) {
        values.push(pickupTo);
        filters.push(`sp.scheduled_arrival_at::date <= $${values.length}::date`);
      }
      if (delivery_date_from) {
        values.push(delivery_date_from);
        filters.push(`sd.scheduled_arrival_at::date >= $${values.length}::date`);
      }
      if (delivery_date_to) {
        values.push(delivery_date_to);
        filters.push(`sd.scheduled_arrival_at::date <= $${values.length}::date`);
      }
      if (search) {
        values.push(`%${search}%`);
        const idx = values.length;
        filters.push(
          `(l.load_number ILIKE $${idx} OR c.customer_name ILIKE $${idx} OR COALESCE(sp.city, '') ILIKE $${idx} OR COALESCE(sd.city, '') ILIKE $${idx})`
        );
      }

      const whereClause = `AND ${filters.join(" AND ")}`;
      const countRes = await client.query<{ total_count: number }>(
        `
          SELECT COUNT(*)::int AS total_count
          FROM mdata.loads l
          JOIN mdata.customers c ON c.id = l.customer_id
          LEFT JOIN mdata.units u ON u.id = l.assigned_unit_id
          LEFT JOIN mdata.drivers d ON d.id = l.assigned_primary_driver_id
          LEFT JOIN LATERAL (
            SELECT city, scheduled_arrival_at
            FROM mdata.load_stops
            WHERE load_id = l.id
              AND stop_type = 'pickup'
              AND soft_deleted_at IS NULL
            ORDER BY sequence_number ASC
            LIMIT 1
          ) sp ON true
          LEFT JOIN LATERAL (
            SELECT city, scheduled_arrival_at
            FROM mdata.load_stops
            WHERE load_id = l.id
              AND stop_type = 'delivery'
              AND soft_deleted_at IS NULL
            ORDER BY sequence_number DESC
            LIMIT 1
          ) sd ON true
          WHERE l.operating_company_id = ANY($1::uuid[])
          ${whereClause}
        `,
        values
      );

      values.push(limit);
      values.push(offset);
      const limitIdx = values.length - 1;
      const offsetIdx = values.length;

      const res = await client.query(
        `
          SELECT
            l.id, l.operating_company_id, l.load_number, l.customer_id, l.status, l.rate_total_cents, l.currency_code,
            l.assigned_unit_id, l.assigned_primary_driver_id, l.assigned_secondary_driver_id, l.team_id,
            l.dispatcher_user_id, l.notes, l.created_at, l.updated_at, l.soft_deleted_at, l.deleted_by_user_id,
            c.customer_name AS customer_name,
            u.unit_number AS assigned_unit_number,
            CASE
              WHEN d.id IS NULL THEN NULL
              ELSE CONCAT_WS(' ', d.first_name, d.last_name)
            END AS assigned_primary_driver_name,
            sp.city AS first_pickup_city,
            sd.city AS first_delivery_city,
            ${effectiveDeliverySelectSql("l", "sd")},
            EXISTS (
              SELECT 1
              FROM geo.geofences g
              WHERE g.operating_company_id = l.operating_company_id
                AND g.location_kind = 'customer_site'
                AND g.is_active = true
                AND g.location_ref_id = l.customer_id
            ) AS geofence_ready
          FROM mdata.loads l
          JOIN mdata.customers c ON c.id = l.customer_id
          LEFT JOIN mdata.units u ON u.id = l.assigned_unit_id
          LEFT JOIN mdata.drivers d ON d.id = l.assigned_primary_driver_id
          LEFT JOIN LATERAL (
            SELECT city, scheduled_arrival_at
            FROM mdata.load_stops
            WHERE load_id = l.id
              AND stop_type = 'pickup'
              AND soft_deleted_at IS NULL
            ORDER BY sequence_number ASC
            LIMIT 1
          ) sp ON true
          LEFT JOIN LATERAL (
            SELECT city, scheduled_arrival_at
            FROM mdata.load_stops
            WHERE load_id = l.id
              AND stop_type = 'delivery'
              AND soft_deleted_at IS NULL
            ORDER BY sequence_number DESC
            LIMIT 1
          ) sd ON true
          WHERE l.operating_company_id = ANY($1::uuid[])
          ${whereClause}
          ORDER BY ${sortOrderSql}
          LIMIT $${limitIdx}
          OFFSET $${offsetIdx}
        `,
        values
      );
      const rows = res.rows.map((row) => ({
        ...row,
        flag_code: statusToFlagCode(row.status as z.infer<typeof loadStatusSchema>),
      }));

      if (!include_progress) {
        return { rows, totalCount: Number(countRes.rows[0]?.total_count ?? 0) };
      }

      const enrichedRows = [];
      for (const row of rows as Array<Record<string, unknown>>) {
        const progress = await computeProgressStatus(client, {
          operating_company_id: String(row.operating_company_id),
          load_id: String(row.id),
          assigned_unit_id: row.assigned_unit_id ? String(row.assigned_unit_id) : null,
        });
        enrichedRows.push({
          ...row,
          progress_status: progress.progress_status,
          progress_eta_delta_minutes: progress.eta_delta_minutes,
        });
      }

      return {
        rows: enrichedRows,
        totalCount: Number(countRes.rows[0]?.total_count ?? 0),
      };
    });

    return {
      loads: listResult.rows,
      total_count: listResult.totalCount,
      has_more: offset + limit < listResult.totalCount,
    };
  });

  app.get("/api/v1/mdata/loads/:id", async (req, reply) => {
    const authUser = currentAuthUser(req, reply);
    if (!authUser) return;
    const parsedParams = loadIdParamSchema.safeParse(req.params ?? {});
    if (!parsedParams.success) return sendValidationError(reply, parsedParams.error);

    const detail = await withCurrentUser(authUser.uuid, async (client) => {
      const loadRes = await client.query(
        `
          SELECT
            id, operating_company_id, load_number, customer_id, status, rate_total_cents, currency_code,
            assigned_unit_id, assigned_primary_driver_id, assigned_secondary_driver_id, team_id,
            dispatcher_user_id, notes, created_at, updated_at, soft_deleted_at, deleted_by_user_id,
            -- Block 7 (full-edit prefill): editable columns the book-load INSERT actually writes, so the
            -- Edit wizard can round-trip them. Read-only enrichment; every column verified present in
            -- book-load.service.ts INSERT + accepted by the PATCH schema (no fabricated fields).
            customer_wo_number, pickup_number, border_routing, driver_instructions_text,
            requires_tarps, tarp_type, lumper_amount_cents,
            customer_chargeback_requested, customer_chargeback_reason, live_load_number,
            anticipated_chargeback_cents, anticipated_chargeback_reason,
            detention_expected_y_n, detention_expected_hours,
            detention_bill_customer_per_hour_cents, detention_driver_pay_per_hour_cents,
            late_delivery_risk_y_n, late_delivery_est_deduction_cents, late_delivery_reason,
            miles_practical, miles_shortest, miles_deadhead,
            -- Block 7 (Jorge-approved, no migration): freight attributes that round-trip in the Edit wizard.
            -- weight column is cargo_weight_lbs; reefer setpoint is reefer_setpoint_temp_f (numeric).
            commodity, cargo_weight_lbs, reefer_setpoint_temp_f, trip_type,
            -- Block 7 (migration 202606221000, Jorge-approved): pieces + customer PO round-trip in Edit.
            piece_count, customer_po_number,
            -- render-v6 §B reefer/tarp detail (migration 202606231400).
            reefer_temp_f, reefer_mode, pre_cool, tarp_qty, tarp_size
          FROM mdata.loads
          WHERE id = $1
            -- Tier-1 entity-scope (money by-id IDOR): rate_total_cents is GROSS customer revenue.
            -- Defense-in-depth mirror of the two SELECT RLS policies (loads_select_office +
            -- loads_select_driver) so an office user only reads loads of their accessible companies
            -- (Owner = all) while an assigned driver still reads their own load. Without this, a
            -- bypass/unforced-RLS regression would leak cross-entity revenue/customer/detention.
            AND (
              operating_company_id IN (SELECT org.user_accessible_company_ids())
              OR EXISTS (
                SELECT 1 FROM mdata.drivers d
                WHERE d.identity_user_id = NULLIF(current_setting('app.current_user_id', true), '')::uuid
                  AND (d.id = mdata.loads.assigned_primary_driver_id OR d.id = mdata.loads.assigned_secondary_driver_id)
              )
            )
          LIMIT 1
        `,
        [parsedParams.data.id]
      );
      const load = loadRes.rows[0] ?? null;
      if (!load) return null;

      const stopsRes = await client.query(
        `
          SELECT
            id, load_id, sequence_number, stop_type, location_id, address_line1, city, state, country,
            scheduled_arrival_at, scheduled_departure_at, actual_arrival_at, actual_departure_at,
            status, notes, created_at, updated_at,
            -- Block 7 full-edit: the editable stop columns the book-load INSERT writes, so an edited
            -- stop round-trips without wiping appointment window / lumper / tarp / contacts / dock.
            time_window_type, appointment_start_at, appointment_end_at,
            lumper_required, lumper_paid_by, lumper_amount_cents, is_tarp_stop, tarp_count, stop_notes,
            site_contact_name, site_contact_phone, gate_dock_text, postal_code
          FROM mdata.load_stops
          WHERE load_id = $1
          ORDER BY sequence_number ASC, created_at ASC
        `,
        [parsedParams.data.id]
      );
      return { ...load, stops: stopsRes.rows };
    });

    if (!detail) return reply.code(404).send({ error: "mdata_load_not_found" });
    return detail;
  });

  app.get("/api/v1/mdata/loads/:id/audit", async (req, reply) => {
    const authUser = currentAuthUser(req, reply);
    if (!authUser) return;
    const parsedParams = loadIdParamSchema.safeParse(req.params ?? {});
    if (!parsedParams.success) return sendValidationError(reply, parsedParams.error);

    const rows = await withCurrentUser(authUser.uuid, async (client) => {
      const res = await client.query(
        `
          SELECT uuid, created_at, event_class, severity, payload, actor_user_uuid, source
          FROM audit.audit_events
          WHERE
            (
              payload->>'entity_type' = 'load'
              AND payload->>'entity_id' = $1
            )
            OR (
              payload->>'resource_type' = 'mdata.loads'
              AND payload->>'resource_id' = $1
            )
          ORDER BY created_at DESC
          LIMIT 200
        `,
        [parsedParams.data.id]
      );
      return res.rows;
    });

    return { events: rows };
  });

  app.patch("/api/v1/mdata/loads/:id/status", { config: { rateLimit: { max: 60, timeWindow: "1 minute" } } }, async (req, reply) => {
    const authUser = currentAuthUser(req, reply);
    if (!authUser) return;
    if (!isOfficeWriteRole(authUser.role)) return reply.code(403).send({ error: "forbidden" });

    const parsedParams = loadIdParamSchema.safeParse(req.params ?? {});
    if (!parsedParams.success) return sendValidationError(reply, parsedParams.error);
    const parsedBody = loadStatusTransitionBodySchema.safeParse(req.body ?? {});
    if (!parsedBody.success) return sendValidationError(reply, parsedBody.error);
    const { new_status: newStatus, cancellation_reason_code: cancellationReasonCode, cancellation_notes: cancellationNotes } = parsedBody.data;

    const result = await withCurrentUser(authUser.uuid, async (client) => {
      // Tier-1 entity-scope (money by-id IDOR): the loads_update_office RLS policy is role-only
      // (no operating_company_id predicate) so a non-Owner office user could mutate ANOTHER
      // entity's load (reassign customer/rate, emit escrow events). This route is office-role
      // gated (isOfficeWriteRole), so membership-scope is the correct guard: Owner = all companies,
      // others = only their accessible companies.
      const currentRes = await client.query<{
        id: string;
        status: z.infer<typeof loadStatusSchema>;
        operating_company_id: string;
      }>(
        `SELECT id, status, operating_company_id FROM mdata.loads
         WHERE id = $1 AND soft_deleted_at IS NULL
           AND operating_company_id IN (SELECT org.user_accessible_company_ids())
         LIMIT 1`,
        [parsedParams.data.id]
      );
      const current = currentRes.rows[0] ?? null;
      if (!current) return { error: "mdata_load_not_found" as const };
      if (current.status === newStatus) return { ok: true as const, no_change: true, status: current.status };

      const allowed = allowedStatusTransitions[current.status] ?? [];
      if (!allowed.includes(newStatus)) {
        return { error: "invalid_status_transition" as const, from_status: current.status, to_status: newStatus };
      }

      if (newStatus === "cancelled" && !cancellationReasonCode) {
        return { error: "cancellation_reason_required" as const };
      }

      // OWNER DECISION 4 (2026-07-25): this route is the SECOND cancel path — the Dispatch Kanban's
      // "Cancelled" drop column calls it. It used to validate the reason, flip mdata.loads.status, and record
      // the reason only inside an audit-log JSON string: NO dispatch.load_cancellations row, no
      // reason_code_id, nothing for the reverse surface or the cancellation reports to read. A
      // status->cancelled with no record is a silent failure and an audit gap (Rule 21). The owner ruled it
      // must WRITE A REAL CANCELLATION RECORD through the same canonical flow rather than be blocked.
      //
      // `dispatch.load_cancellations.cancellation_notes` is NOT NULL with no default on prod, so a cancel
      // without notes cannot produce a record. Notes are therefore required here exactly as the canonical
      // cancelLoad() requires them (>= 20 chars) — "no silent status flip, no reason-less cancel".
      let resolvedReason: { id: string; reason_code: string; billable_to_customer_default: boolean } | null = null;
      if (newStatus === "cancelled" && cancellationReasonCode) {
        const reasonRes = await client.query<{
          id: string;
          reason_code: string;
          requires_owner_approval: boolean;
          billable_to_customer_default: boolean;
        }>(
          `
            SELECT id, reason_code, requires_owner_approval, billable_to_customer_default
            FROM catalogs.load_cancellation_reasons
            WHERE reason_code = $1
              AND operating_company_id = $2
              AND is_active = true
            LIMIT 1
          `,
          [cancellationReasonCode, current.operating_company_id]
        );
        const reason = reasonRes.rows[0];
        if (!reason) return { error: "cancellation_reason_invalid" as const };
        if (reason.requires_owner_approval && !isOwnerRole(authUser.role)) {
          return { error: "owner_approval_required" as const };
        }
        if (!cancellationNotes || cancellationNotes.trim().length < 20) {
          return { error: "cancellation_notes_min_20" as const };
        }
        resolvedReason = {
          id: reason.id,
          reason_code: reason.reason_code,
          billable_to_customer_default: reason.billable_to_customer_default,
        };
      }

      const updateRes = await client.query(
        `
          UPDATE mdata.loads
          SET status = $2
          WHERE id = $1
            AND operating_company_id IN (SELECT org.user_accessible_company_ids())
          RETURNING
            id, operating_company_id, load_number, customer_id, status, rate_total_cents, currency_code,
            assigned_unit_id, assigned_primary_driver_id, assigned_secondary_driver_id, team_id,
            dispatcher_user_id, notes, created_at, updated_at, soft_deleted_at, deleted_by_user_id
        `,
        [parsedParams.data.id, newStatus]
      );
      const row = updateRes.rows[0] ?? null;
      if (!row) return { error: "mdata_load_not_found" as const };

      // CLS-DISP-WIRE-07 — dual-path kill: this route used to flip status with zero stop evidence.
      // Same stamp as dispatch transition + bulk set_status (never overwrite driver departure).
      if (loadStatusRequiresDeliveryDepartureStamp(String(row.status))) {
        await stampFinalActiveDeliveryDeparture(client, row.id, null);
      }

      // CLS-DISP-WIRE-07 — this route STAMPED the departure but never LATCHED revenue, so a load
      // delivered via the mdata status PATCH recorded evidence the ledger never heard about. Found
      // by verify-delivery-evidence-latch-wired while fixing the two driver paths — the guard caught
      // a site I had not been asked to look at, which is the point of scanning for the shape rather
      // than patching the three known files.
      await latchOnDeliveryEvidence({
        operatingCompanyId: String(row.operating_company_id),
        loadId: String(row.id),
        targetStatus: String(row.status),
        actorUserId: req.user!.uuid,
      });

      await appendCrudAudit(
        client,
        authUser.uuid,
        "mdata.loads.status_changed",
        {
          resource_id: row.id,
          resource_type: "mdata.loads",
          entity_type: "load",
          entity_id: row.id,
          from_status: current.status,
          to_status: row.status,
        },
        "info",
        "BT-3-DISPATCH-BOARD"
      );

      if (row.status === "cancelled") {
        // OWNER DECISION 4: write the canonical cancellation record through the SAME single writer the
        // dispatch cancel route uses, so this path can never again flip a status without one.
        let cancellationRecordId: string | null = null;
        if (resolvedReason) {
          const rec = await writeLoadCancellationRecord(client, {
            operating_company_id: current.operating_company_id,
            load_id: row.id,
            reason_code: resolvedReason.reason_code,
            reason_code_id: resolvedReason.id,
            cancellation_notes: (cancellationNotes ?? "").trim(),
            billable_to_customer: resolvedReason.billable_to_customer_default,
            cancellation_charge_cents: null,
            // Owner-approval-required reasons are refused above for non-Owners, so anything reaching here
            // is approved.
            status: "approved",
            cancelled_by_user_id: authUser.uuid,
          });
          cancellationRecordId = rec.rows[0]?.id ?? null;
        }

        await appendCrudAudit(
          client,
          authUser.uuid,
          "mdata.loads.cancelled",
          {
            resource_id: row.id,
            resource_type: "mdata.loads",
            entity_type: "load",
            entity_id: row.id,
            from_status: current.status,
            to_status: row.status,
            reason_code: cancellationReasonCode ?? null,
            // The canonical FK, not just a memo string — this is what makes the audit row traceable to the
            // catalog entry and the cancellation record (Rule 14 both-way linkage).
            reason_code_id: resolvedReason?.id ?? null,
            load_cancellation_id: cancellationRecordId,
            notes: cancellationNotes ?? null,
          },
          "warning",
          "BT-3-DISPATCH-BOARD"
        );
      }

      if (row.status === "abandoned" || row.status === "driver_walkoff" || row.status === "driver_no_show") {
        await emitAutoProposedEscrowEvents({
          client,
          actor_user_id: authUser.uuid,
          operating_company_id: String((row as { operating_company_id?: string }).operating_company_id ?? ""),
          load_id: row.id,
          load_status: row.status,
        });
      }

      return { ok: true as const, row };
    });

    if ("error" in result) {
      if (result.error === "mdata_load_not_found") return reply.code(404).send({ error: "mdata_load_not_found" });
      if (result.error === "invalid_status_transition") {
        return reply.code(400).send({
          error: "invalid_status_transition",
          from_status: result.from_status,
          to_status: result.to_status,
        });
      }
      if (result.error === "cancellation_reason_required") {
        return reply.code(400).send({ error: "cancellation_reason_required" });
      }
      if (result.error === "cancellation_reason_invalid") {
        return reply.code(400).send({ error: "cancellation_reason_invalid" });
      }
      // OWNER DECISION 4: notes are required on this path too, because
      // dispatch.load_cancellations.cancellation_notes is NOT NULL on prod — without them no cancellation
      // record can be written, which is the silent-status-flip the decision forbids.
      if (result.error === "cancellation_notes_min_20") {
        return reply.code(400).send({ error: "cancellation_notes_min_20" });
      }
      if (result.error === "owner_approval_required") {
        return reply.code(403).send({ error: "owner_approval_required" });
      }
    }

    if ("no_change" in result && result.no_change) {
      return { ok: true, status: result.status };
    }
    return result.row;
  });

  app.patch("/api/v1/mdata/loads/:id", async (req, reply) => {
    const authUser = currentAuthUser(req, reply);
    if (!authUser) return;
    if (!isOfficeWriteRole(authUser.role)) return reply.code(403).send({ error: "forbidden" });

    const parsedParams = loadIdParamSchema.safeParse(req.params ?? {});
    if (!parsedParams.success) return sendValidationError(reply, parsedParams.error);
    const parsedBody = updateLoadBodySchema.safeParse(req.body ?? {});
    if (!parsedBody.success) return sendValidationError(reply, parsedBody.error);
    const b = parsedBody.data;
    if (b.assigned_primary_driver_id && b.team_id) {
      return reply.code(400).send({ error: "solo_or_team_assignment_required_not_both" });
    }

    const setParts: string[] = [];
    const values: unknown[] = [];
    const add = (col: string, val: unknown) => {
      values.push(val);
      setParts.push(`${col} = $${values.length}`);
    };

    if ("customer_id" in b) add("customer_id", b.customer_id);
    if ("status" in b) add("status", b.status);
    if ("rate_total_cents" in b) add("rate_total_cents", b.rate_total_cents);
    if ("currency_code" in b) add("currency_code", b.currency_code);
    if ("assigned_unit_id" in b) add("assigned_unit_id", b.assigned_unit_id ?? null);
    if ("assigned_primary_driver_id" in b) add("assigned_primary_driver_id", b.assigned_primary_driver_id ?? null);
    if ("assigned_secondary_driver_id" in b) add("assigned_secondary_driver_id", b.assigned_secondary_driver_id ?? null);
    if ("team_id" in b) add("team_id", b.team_id ?? null);
    if ("notes" in b) add("notes", b.notes ?? null);
    if ("soft_deleted_at" in b) {
      add("soft_deleted_at", b.soft_deleted_at ?? null);
      if (b.soft_deleted_at) {
        add("deleted_by_user_id", authUser.uuid);
      } else {
        add("deleted_by_user_id", null);
      }
    }

    values.push(parsedParams.data.id);
    const idIdx = values.length;

    try {
      const updated = await withCurrentUser(authUser.uuid, async (client) => {
        const oldRes = await client.query(
          `
            SELECT
              id, operating_company_id, load_number, customer_id, status, rate_total_cents, currency_code,
              assigned_unit_id, assigned_primary_driver_id, assigned_secondary_driver_id, team_id,
              dispatcher_user_id, notes, created_at, updated_at, soft_deleted_at, deleted_by_user_id
            FROM mdata.loads
            WHERE id = $1
              -- Tier-1 entity-scope (money by-id IDOR): same loads_update_office role-only RLS gap.
              -- Office-role gated route → membership-scope guard (Owner = all, others = accessible).
              AND operating_company_id IN (SELECT org.user_accessible_company_ids())
            LIMIT 1
          `,
          [parsedParams.data.id]
        );
        const oldRow = oldRes.rows[0] ?? null;
        if (!oldRow) return null;

        const res = await client.query(
          `
            UPDATE mdata.loads
            SET ${setParts.join(", ")}
            WHERE id = $${idIdx}
              AND operating_company_id IN (SELECT org.user_accessible_company_ids())
            RETURNING
              id, operating_company_id, load_number, customer_id, status, rate_total_cents, currency_code,
              assigned_unit_id, assigned_primary_driver_id, assigned_secondary_driver_id, team_id,
              dispatcher_user_id, notes, created_at, updated_at, soft_deleted_at, deleted_by_user_id
          `,
          values
        );
        const row = res.rows[0] ?? null;
        if (!row) return null;

        const changes = buildPatchChanges(
          b as unknown as Record<string, unknown>,
          oldRow as Record<string, unknown>,
          row as Record<string, unknown>
        );
        await appendCrudAudit(
          client,
          authUser.uuid,
          "mdata.loads.updated",
          {
            resource_id: row.id,
            resource_type: "mdata.loads",
            changes,
          },
          "info",
          "BT-3-LOADS-SCHEMA"
        );

        if (String(oldRow.status) !== String(row.status)) {
          await appendCrudAudit(
            client,
            authUser.uuid,
            "mdata.loads.status_changed",
            {
              resource_id: row.id,
              resource_type: "mdata.loads",
              from_status: oldRow.status,
              to_status: row.status,
            },
            "info",
            "BT-3-LOADS-SCHEMA"
          );
          if (row.status === "cancelled") {
            await appendCrudAudit(
              client,
              authUser.uuid,
              "mdata.loads.cancelled",
              {
                resource_id: row.id,
                resource_type: "mdata.loads",
                from_status: oldRow.status,
                to_status: row.status,
              },
              "warning",
              "BT-3-LOADS-SCHEMA"
            );
          }
          if (row.status === "abandoned" || row.status === "driver_walkoff" || row.status === "driver_no_show") {
            await emitAutoProposedEscrowEvents({
              client,
              actor_user_id: authUser.uuid,
              operating_company_id: String((row as { operating_company_id?: string }).operating_company_id ?? ""),
              load_id: row.id,
              load_status: row.status,
            });
          }
        }

        if (
          oldRow.assigned_unit_id !== row.assigned_unit_id ||
          oldRow.assigned_primary_driver_id !== row.assigned_primary_driver_id ||
          oldRow.assigned_secondary_driver_id !== row.assigned_secondary_driver_id ||
          oldRow.team_id !== row.team_id
        ) {
          await appendCrudAudit(
            client,
            authUser.uuid,
            "mdata.loads.assigned",
            {
              resource_id: row.id,
              resource_type: "mdata.loads",
              assigned_unit_id: row.assigned_unit_id,
              assigned_primary_driver_id: row.assigned_primary_driver_id,
              assigned_secondary_driver_id: row.assigned_secondary_driver_id,
              team_id: row.team_id,
            },
            "info",
            "BT-3-LOADS-SCHEMA"
          );
        }

        if (!oldRow.soft_deleted_at && row.soft_deleted_at) {
          await appendCrudAudit(
            client,
            authUser.uuid,
            "mdata.loads.deleted",
            {
              resource_id: row.id,
              resource_type: "mdata.loads",
              soft_deleted_at: row.soft_deleted_at,
            },
            "warning",
            "BT-3-LOADS-SCHEMA"
          );
        }

        return row;
      });

      if (!updated) return reply.code(404).send({ error: "mdata_load_not_found" });
      return updated;
    } catch (err) {
      const code = (err as { code?: string }).code;
      if (code === "23505") return reply.code(409).send({ error: "mdata_load_conflict" });
      if (code === "23503") return reply.code(400).send({ error: "invalid_foreign_key" });
      throw err;
    }
  });

  app.post("/api/v1/mdata/loads/:id/stops", async (req, reply) => {
    const authUser = currentAuthUser(req, reply);
    if (!authUser) return;
    if (!isOfficeWriteRole(authUser.role)) return reply.code(403).send({ error: "forbidden" });
    const parsedParams = loadIdParamSchema.safeParse(req.params ?? {});
    if (!parsedParams.success) return sendValidationError(reply, parsedParams.error);
    const parsedBody = createStopBodySchema.safeParse(req.body ?? {});
    if (!parsedBody.success) return sendValidationError(reply, parsedBody.error);
    const b = parsedBody.data;

    try {
      const created = await withCurrentUser(authUser.uuid, async (client) => {
        // Entity scope (USMCA cross-entity leak fix): only create a stop under a load owned by the
        // caller's operating company. mdata RLS is role-scoped, so a bare load-id lookup reaches any
        // entity's load — mirror the operating_company_id predicate the loads GET/PATCH already use.
        const scopedCompanyId = await resolveOperatingCompanyId(client, authUser.uuid);
        const loadRes = await client.query(
          `SELECT id FROM mdata.loads WHERE id = $1 AND operating_company_id = $2 LIMIT 1`,
          [parsedParams.data.id, scopedCompanyId]
        );
        if (loadRes.rows.length === 0) return null;

        const res = await client.query(
          `
            INSERT INTO mdata.load_stops (
              load_id, sequence_number, stop_type, location_id, address_line1, city, state, country,
              scheduled_arrival_at, scheduled_departure_at, actual_arrival_at, actual_departure_at, status, notes
            ) VALUES (
              $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14
            )
            RETURNING
              id, load_id, sequence_number, stop_type, location_id, address_line1, city, state, country,
              scheduled_arrival_at, scheduled_departure_at, actual_arrival_at, actual_departure_at, status, notes, created_at, updated_at
          `,
          [
            parsedParams.data.id,
            b.sequence_number,
            b.stop_type,
            b.location_id ?? null,
            b.address_line1 ?? null,
            b.city ?? null,
            b.state ?? null,
            b.country ?? null,
            b.scheduled_arrival_at ?? null,
            b.scheduled_departure_at ?? null,
            b.actual_arrival_at ?? null,
            b.actual_departure_at ?? null,
            b.status,
            b.notes ?? null,
          ]
        );
        const row = res.rows[0];
        await appendCrudAudit(
          client,
          authUser.uuid,
          "mdata.load_stops.created",
          {
            resource_id: row.id,
            resource_type: "mdata.load_stops",
            load_id: row.load_id,
            sequence_number: row.sequence_number,
            stop_type: row.stop_type,
            status: row.status,
          },
          "info",
          "BT-3-LOADS-SCHEMA"
        );
        return row;
      });

      if (!created) return reply.code(404).send({ error: "mdata_load_not_found" });
      return reply.code(201).send(created);
    } catch (err) {
      const code = (err as { code?: string }).code;
      if (code === "23505") return reply.code(409).send({ error: "mdata_load_stop_conflict" });
      if (code === "23503") return reply.code(400).send({ error: "invalid_foreign_key" });
      throw err;
    }
  });

  app.patch("/api/v1/mdata/loads/:id/stops/:stopId", async (req, reply) => {
    const authUser = currentAuthUser(req, reply);
    if (!authUser) return;
    if (!isOfficeWriteRole(authUser.role)) return reply.code(403).send({ error: "forbidden" });
    const parsedParams = loadStopParamsSchema.safeParse(req.params ?? {});
    if (!parsedParams.success) return sendValidationError(reply, parsedParams.error);
    const parsedBody = updateStopBodySchema.safeParse(req.body ?? {});
    if (!parsedBody.success) return sendValidationError(reply, parsedBody.error);
    const b = parsedBody.data;

    const setParts: string[] = [];
    const values: unknown[] = [];
    const add = (col: string, val: unknown) => {
      values.push(val);
      setParts.push(`${col} = $${values.length}`);
    };

    if ("sequence_number" in b) add("sequence_number", b.sequence_number);
    if ("stop_type" in b) add("stop_type", b.stop_type);
    if ("location_id" in b) add("location_id", b.location_id ?? null);
    if ("address_line1" in b) add("address_line1", b.address_line1 ?? null);
    if ("city" in b) add("city", b.city ?? null);
    if ("state" in b) add("state", b.state ?? null);
    if ("country" in b) add("country", b.country ?? null);
    if ("scheduled_arrival_at" in b) add("scheduled_arrival_at", b.scheduled_arrival_at ?? null);
    if ("scheduled_departure_at" in b) add("scheduled_departure_at", b.scheduled_departure_at ?? null);
    if ("actual_arrival_at" in b) add("actual_arrival_at", b.actual_arrival_at ?? null);
    if ("actual_departure_at" in b) add("actual_departure_at", b.actual_departure_at ?? null);
    if ("status" in b) add("status", b.status);
    if ("notes" in b) add("notes", b.notes ?? null);

    values.push(parsedParams.data.id);
    const loadIdx = values.length;
    values.push(parsedParams.data.stopId);
    const stopIdx = values.length;

    try {
      const updated = await withCurrentUser(authUser.uuid, async (client) => {
        // Entity scope (USMCA cross-entity leak fix): gate the whole stop mutation on the parent load
        // belonging to the caller's operating company (load_stops has no own operating_company_id).
        const scopedCompanyId = await resolveOperatingCompanyId(client, authUser.uuid);
        const loadOwnRes = await client.query(
          `SELECT 1 FROM mdata.loads WHERE id = $1 AND operating_company_id = $2 LIMIT 1`,
          [parsedParams.data.id, scopedCompanyId]
        );
        if (loadOwnRes.rows.length === 0) return null;

        const oldRes = await client.query(
          `
            SELECT
              id, load_id, sequence_number, stop_type, location_id, address_line1, city, state, country,
              scheduled_arrival_at, scheduled_departure_at, actual_arrival_at, actual_departure_at, status, notes, created_at, updated_at
            FROM mdata.load_stops
            WHERE load_id = $1
              AND id = $2
            LIMIT 1
          `,
          [parsedParams.data.id, parsedParams.data.stopId]
        );
        const oldRow = oldRes.rows[0] ?? null;
        if (!oldRow) return null;

        const res = await client.query(
          `
            UPDATE mdata.load_stops
            SET ${setParts.join(", ")}
            WHERE load_id = $${loadIdx}
              AND id = $${stopIdx}
            RETURNING
              id, load_id, sequence_number, stop_type, location_id, address_line1, city, state, country,
              scheduled_arrival_at, scheduled_departure_at, actual_arrival_at, actual_departure_at, status, notes, created_at, updated_at
          `,
          values
        );
        const row = res.rows[0] ?? null;
        if (!row) return null;

        const changes = buildPatchChanges(
          b as unknown as Record<string, unknown>,
          oldRow as Record<string, unknown>,
          row as Record<string, unknown>
        );
        await appendCrudAudit(
          client,
          authUser.uuid,
          "mdata.load_stops.updated",
          {
            resource_id: row.id,
            resource_type: "mdata.load_stops",
            load_id: row.load_id,
            changes,
          },
          "info",
          "BT-3-LOADS-SCHEMA"
        );

        if (String(oldRow.status) !== String(row.status)) {
          await appendCrudAudit(
            client,
            authUser.uuid,
            "mdata.load_stops.status_changed",
            {
              resource_id: row.id,
              resource_type: "mdata.load_stops",
              load_id: row.load_id,
              from_status: oldRow.status,
              to_status: row.status,
            },
            "info",
            "BT-3-LOADS-SCHEMA"
          );
        }

        return row;
      });

      if (!updated) return reply.code(404).send({ error: "mdata_load_stop_not_found" });
      return updated;
    } catch (err) {
      const code = (err as { code?: string }).code;
      if (code === "23505") return reply.code(409).send({ error: "mdata_load_stop_conflict" });
      if (code === "23503") return reply.code(400).send({ error: "invalid_foreign_key" });
      throw err;
    }
  });

  app.delete("/api/v1/mdata/loads/:id/stops/:stopId", async (req, reply) => {
    const authUser = currentAuthUser(req, reply);
    if (!authUser) return;
    if (!isOfficeWriteRole(authUser.role)) return reply.code(403).send({ error: "forbidden" });
    const parsedParams = loadStopParamsSchema.safeParse(req.params ?? {});
    if (!parsedParams.success) return sendValidationError(reply, parsedParams.error);

    const removed = await withCurrentUser(authUser.uuid, async (client) => {
      // Entity scope (USMCA cross-entity leak fix): only soft-delete a stop under a load owned by the
      // caller's operating company (load_stops has no own operating_company_id).
      const scopedCompanyId = await resolveOperatingCompanyId(client, authUser.uuid);
      const loadOwnRes = await client.query(
        `SELECT 1 FROM mdata.loads WHERE id = $1 AND operating_company_id = $2 LIMIT 1`,
        [parsedParams.data.id, scopedCompanyId]
      );
      if (loadOwnRes.rows.length === 0) return null;

      // INV-1: void-never-delete — soft-delete, never hard-delete POD/stop evidence.
      const res = await client.query(
        `
          UPDATE mdata.load_stops
          SET soft_deleted_at = now()
          WHERE load_id = $1
            AND id = $2
            AND soft_deleted_at IS NULL
          RETURNING id, load_id, sequence_number, stop_type, status
        `,
        [parsedParams.data.id, parsedParams.data.stopId]
      );
      const row = res.rows[0] ?? null;
      if (!row) return null;
      await appendCrudAudit(
        client,
        authUser.uuid,
        "mdata.load_stops.updated",
        {
          resource_id: row.id,
          resource_type: "mdata.load_stops",
          load_id: row.load_id,
          action: "soft_deleted",
          sequence_number: row.sequence_number,
          stop_type: row.stop_type,
          prior_status: row.status,
        },
        "warning",
        "BT-3-LOADS-SCHEMA"
      );
      return row;
    });

    if (!removed) return reply.code(404).send({ error: "mdata_load_stop_not_found" });
    return { ok: true };
  });

  // Reverse drill-through: list loads assigned to a specific driver (primary OR secondary).
  // Read-only SELECT, company-scoped. Powers the Driver detail "Loads" tab.
  const driverLoadsParamSchema = z.object({ id: z.string().uuid() });
  const driverLoadsQuerySchema = z.object({
    operating_company_id: z.string().uuid().optional(),
    status: z.preprocess(
      (v) => (typeof v === "string" ? v.split(",").map((s) => s.trim()).filter(Boolean) : v),
      z.array(loadStatusSchema).optional()
    ),
    limit: z.coerce.number().int().min(1).max(200).default(50),
    offset: z.coerce.number().int().min(0).default(0),
  });
  app.get("/api/v1/drivers/:id/loads", { config: { rateLimit: { max: 120, timeWindow: "1 minute" } } }, async (req, reply) => {
    const authUser = currentAuthUser(req, reply);
    if (!authUser) return;
    const params = driverLoadsParamSchema.safeParse(req.params ?? {});
    if (!params.success) return sendValidationError(reply, params.error);
    const parsedQuery = driverLoadsQuerySchema.safeParse(req.query ?? {});
    if (!parsedQuery.success) return sendValidationError(reply, parsedQuery.error);
    const { status, limit, offset, operating_company_id } = parsedQuery.data;

    const result = await withCurrentUser(authUser.uuid, async (client) => {
      // Resolve operating company upfront so the predicate is a static literal in every query
      // (the verify-mdata-entity-scope guard does static template-literal scanning).
      const scopedId = await resolveOperatingCompanyId(client, authUser.uuid, operating_company_id);
      if (!scopedId) return { rows: [], totalCount: 0 };
      // membership-scope-exempt: transaction-resolved-user-company
      await client.query(`SELECT set_config('app.operating_company_id', $1, true)`, [scopedId]);

      // $1 = driver uuid, $2 = operating_company_id uuid (always present)
      const values: unknown[] = [params.data.id, scopedId];
      const extraFilters: string[] = [];
      if (status && status.length > 0) {
        values.push(status);
        extraFilters.push(`l.status = ANY($${values.length}::mdata.load_status_enum[])`);
      }
      const extraWhere = extraFilters.length > 0 ? `AND ${extraFilters.join(" AND ")}` : "";

      const countRes = await client.query(
        `SELECT count(*)::int AS cnt
         FROM mdata.loads l
         WHERE l.operating_company_id = $2::uuid
           AND l.soft_deleted_at IS NULL
           AND (l.assigned_primary_driver_id = $1::uuid OR l.assigned_secondary_driver_id = $1::uuid)
           ${extraWhere}`,
        values
      );
      values.push(limit, offset);
      const rowsRes = await client.query(
        `
          SELECT
            l.id, l.operating_company_id, l.load_number, l.customer_id, l.status, l.rate_total_cents, l.currency_code,
            l.assigned_unit_id, l.assigned_primary_driver_id, l.assigned_secondary_driver_id,
            l.notes, l.created_at, l.updated_at,
            c.customer_name AS customer_name,
            u.unit_number AS assigned_unit_number,
            sp.city AS first_pickup_city,
            sp.scheduled_arrival_at AS pickup_scheduled_at,
            sd.city AS first_delivery_city,
            sd.scheduled_arrival_at AS delivery_scheduled_at
          FROM mdata.loads l
          JOIN mdata.customers c ON c.id = l.customer_id
          LEFT JOIN mdata.units u ON u.id = l.assigned_unit_id
          LEFT JOIN LATERAL (
            SELECT city, scheduled_arrival_at FROM mdata.load_stops
            WHERE load_id = l.id AND stop_type = 'pickup'
            ORDER BY sequence_number ASC LIMIT 1
          ) sp ON true
          LEFT JOIN LATERAL (
            SELECT city, scheduled_arrival_at FROM mdata.load_stops
            WHERE load_id = l.id AND stop_type = 'delivery'
            ORDER BY sequence_number DESC LIMIT 1
          ) sd ON true
          WHERE l.operating_company_id = $2::uuid
            AND l.soft_deleted_at IS NULL
            AND (l.assigned_primary_driver_id = $1::uuid OR l.assigned_secondary_driver_id = $1::uuid)
            ${extraWhere}
          ORDER BY l.created_at DESC
          LIMIT $${values.length - 1} OFFSET $${values.length}
        `,
        values
      );
      return { rows: rowsRes.rows, totalCount: Number((countRes.rows[0] as { cnt?: number } | undefined)?.cnt ?? 0) };
    });
    return { loads: result.rows, total_count: result.totalCount };
  });
}
