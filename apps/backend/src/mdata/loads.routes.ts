import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";
import { latchOnDeliveryEvidence } from "../dispatch/delivery-evidence-latch.js";
// ACCT-F166 — the settlement half of a delivery, wired here so the mdata fallback path is
// money-complete; see the call site below for why the FE can reach this route at all.
import { pingSettlementOnLoadEvent } from "../driver-finance/settlements-load-bookended.service.js";
import { appendCrudAudit, buildPatchChanges } from "../audit/crud-audit.js";
import { withCurrentUser } from "../auth/db.js";
import { requireAuth } from "../auth/session-middleware.js";
import { emitAutoProposedEscrowEvents } from "../driver-finance/escrow-deduction-pending.service.js";
import { computeProgressStatus } from "../telematics/load-progress.service.js";
import { enrichLoadsLiveEta } from "../telematics/dispatch-live-eta.service.js";
import { effectiveDeliverySelectSql } from "../dispatch/effective-delivery.js";
import { resolveOperatingCompanyId } from "../auth/operating-company-scope.js";
import { assertCompanyMembership } from "../_helpers/company-membership-guard.js";
import { companyBusinessDateCompact } from "../lib/company-business-date.js";
import { loadRefMatchSql, loadRefParamSchema } from "../lib/load-ref.js";
import { writeLoadCancellationRecord } from "../dispatch/cancellation.service.js";
import {
  loadStatusRequiresDeliveryDepartureStamp,
  stampFinalActiveDeliveryDeparture,
} from "../dispatch/stamp-final-delivery-departure.js";
import {
  ensureDriverBillArtifactsForLoad,
  resolveLoadTrailerEquipmentIdForInsert,
} from "../dispatch/book-load.service.js";
import {
  assertDriverQualifiedForLoad,
  DriverNotQualifiedError,
} from "../dispatch/driver-qualification.service.js";
import { resyncProformaInvoiceFromLoadRate } from "../accounting/resync-proforma-from-load-rate.js";
import type { PoolClient } from "pg";

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
const loadDetailQuerySchema = z.object({ operating_company_id: z.string().uuid() });

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
  include_live_eta: z.coerce.boolean().default(false),
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
  load_trailer_equipment_id: z.string().uuid().optional(),
  notes: z.string().trim().max(5000).optional(),
  // FAIL-T1 — this is the SECOND load-create path and it never tagged sample data. The Book wizard
  // (dispatch/book-load.service.ts, numbers from load-id-reservation.service.ts:74 => "L-<ymd>-<seq>")
  // has carried is_sample_data since FAIL-D6; THIS route numbers loads "L<COMPANY_TOKEN>-<ymd>-<seq>"
  // (nextLoadNumber, ~line 286) and its INSERT simply omitted the column, so every row it wrote took the
  // false default. Prod 2026-08-08: LUSMCAFREIGHT-20260808-0001..0004 plus two older ones were 0-for-6
  // tagged at INSERT while the "L-" path was 11-of-11. Untagged is not cosmetic — one Delivered step on
  // an untagged load fires revrec into REAL income.
  is_sample_data: z.coerce.boolean().default(false),
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
    dispatch_flag_color_id: z.string().uuid().optional(),
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

/** FAIL-DQF-GATE hole #1 — mdata POST/PATCH must run the same shared gate as book-load / quicksave / update-load. */
async function gateMdataLoadDriverAssignment(
  client: PoolClient,
  operatingCompanyId: string,
  driverIds: Array<string | null | undefined>,
  isHazmat: boolean
) {
  for (const driverId of driverIds) {
    if (!driverId) continue;
    const block = await assertDriverQualifiedForLoad(client, {
      driverId: String(driverId),
      operatingCompanyId,
      isHazmat,
    });
    if (block) throw new DriverNotQualifiedError(block);
  }
}

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
      WHERE operating_company_id = $1::uuid
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
              AND operating_company_id = $2::uuid
              AND deactivated_at IS NULL
            LIMIT 1
          `,
          [b.customer_id, b.operating_company_id]
        );
        if (customerRes.rows.length === 0) {
          return { error: "invalid_customer_for_company" as const };
        }

        if (b.assigned_primary_driver_id || b.assigned_secondary_driver_id) {
          await gateMdataLoadDriverAssignment(
            client,
            b.operating_company_id,
            [b.assigned_primary_driver_id, b.assigned_secondary_driver_id],
            false
          );
        }

        const loadTrailerEquipmentId = await resolveLoadTrailerEquipmentIdForInsert(
          client,
          b.operating_company_id,
          b.load_trailer_equipment_id
        );

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
                  dispatcher_user_id, notes, is_sample_data, load_trailer_equipment_id
                ) VALUES (
                  $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14
                )
                RETURNING
                  id, operating_company_id, load_number, customer_id, status, rate_total_cents, currency_code,
                  assigned_unit_id, assigned_primary_driver_id, assigned_secondary_driver_id, team_id,
                  dispatcher_user_id, notes, is_sample_data, load_trailer_equipment_id,
                  created_at, updated_at, soft_deleted_at, deleted_by_user_id
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
                b.is_sample_data ?? false,
                loadTrailerEquipmentId,
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

        // ACCT-F277 — this secondary creator can seat a driver but historically bypassed the
        // canonical driver-pay path. Converge immediately: mint from the configured rate when
        // inputs are complete, otherwise leave the same durable skipped_no_pay_rate audit used by
        // Book Load. Never derive driver wages from rate_total_cents (customer freight revenue).
        await ensureDriverBillArtifactsForLoad(client, {
          loadId: String(inserted.id),
          operatingCompanyId: b.operating_company_id,
          actorUserId: authUser.uuid,
        });

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
      if (err instanceof DriverNotQualifiedError) {
        return reply.code(422).send({
          error: err.code,
          message: err.message,
          details: {
            driver_id: err.block.driverId,
            reasons: err.block.reasons,
            cdl_expires_at: err.block.cdlExpiresAt,
            medical_expiry_date: err.block.medicalExpiryDate,
            hazmat_endorsement_expires_at: err.block.hazmatEndorsementExpiresAt,
          },
        });
      }
      const code = (err as { code?: string }).code;
      if (code === "23503") return reply.code(400).send({ error: "invalid_foreign_key" });
      if (code === "23505") return reply.code(409).send({ error: "mdata_load_conflict" });
      throw err;
    }
  });

  // Rate-limited (CodeQL js/missing-rate-limiting). Pre-existing gap surfaced because this PR touched
  // the file; the plugin is registered global:false, so an un-configured route has NO limit at all.
  app.get("/api/v1/mdata/loads", { config: { rateLimit: { max: 60, timeWindow: "1 minute" } } }, async (req, reply) => {
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
      include_live_eta,
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
        await client.query(`SELECT set_config('app.operating_company_id', $1::text, true)`, [scopedCompanyId]);
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
          JOIN LATERAL mdata.get_customer_same_company(
            l.customer_id,
            l.operating_company_id
          ) c ON true
          LEFT JOIN mdata.units u ON u.id = l.assigned_unit_id
                                 AND COALESCE(u.currently_leased_to_company_id, u.owner_company_id) = l.operating_company_id
          -- DISPATCH-DRIVER-LABEL-LOST-FOR-DEACTIVATED-DRIVERS — this join used to exclude the
          -- driver entirely once archived (AND d.archived_at IS NULL), turning a load's real,
          -- historical driver assignment into "Driver — not visible" the moment that driver was
          -- later archived/deactivated — same anti-pattern as the customer/vendor "historical
          -- reference" bug class fixed elsewhere in this file (see the customer LATERAL join
          -- above, LV-SYSTEM-AUDIT-LOAD-LINK-DEAD-END). The load's assignment is a fact of history
          -- and must stay visible; only "selectable for a NEW assignment" should exclude an
          -- archived driver, and this is a read of an EXISTING assignment, not a picker. Root
          -- cause was NOT RLS (mdata.drivers' own drivers_select policy does not filter
          -- deactivated_at at all, confirmed live) — it was this join's own extra filter.
          LEFT JOIN mdata.drivers d ON d.id = l.assigned_primary_driver_id
                                   AND (d.operating_company_id = l.operating_company_id OR EXISTS (
                                     SELECT 1 FROM mdata.driver_company_authorizations load_list_dca
                                     WHERE load_list_dca.driver_id = d.id AND load_list_dca.company_id = l.operating_company_id
                                       AND load_list_dca.is_authorized = true AND load_list_dca.deactivated_at IS NULL
                                   ))
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
            l.dispatcher_user_id, l.notes, l.dispatch_flag_color_id, l.created_at, l.updated_at, l.soft_deleted_at, l.deleted_by_user_id,
            c.customer_name AS customer_name,
            u.unit_number AS assigned_unit_number,
            tr.id AS trailer_id,
            tr.equipment_number AS trailer_number,
            CASE
              WHEN d.id IS NULL THEN NULL
              ELSE CONCAT_WS(' ', d.first_name, d.last_name)
            END AS assigned_primary_driver_name,
            sp.city AS first_pickup_city,
            sd.city AS first_delivery_city,
            ${effectiveDeliverySelectSql("l", "sd")},
            df.flag_code, df.display_name AS flag_display_name, df.hex_color AS flag_hex_color,
            EXISTS (
              SELECT 1
              FROM geo.geofences g
              WHERE g.operating_company_id = l.operating_company_id
                AND g.location_kind = 'customer_site'
                AND g.is_active = true
                AND g.location_ref_id = l.customer_id
            ) AS geofence_ready
          FROM mdata.loads l
          JOIN LATERAL mdata.get_customer_same_company(
            l.customer_id,
            l.operating_company_id
          ) c ON true
          LEFT JOIN mdata.units u ON u.id = l.assigned_unit_id
                                 AND COALESCE(u.currently_leased_to_company_id, u.owner_company_id) = l.operating_company_id
          -- DISPATCH-PRIMARY-TRAILER-REVERSE: mdata.loads has no trailer FK. Resolve the latest
          -- canonical assignment-history trailer and scope the equipment join to this load's entity;
          -- otherwise the mounted DispatchBoard receives neither the id nor human label it needs
          -- for the closed-state trailer reverse drill.
          LEFT JOIN LATERAL (
            SELECT eq.id, eq.equipment_number
            FROM dispatch.load_assignment_history lah
            JOIN mdata.equipment eq ON eq.id = lah.new_trailer_id
                                   AND COALESCE(eq.currently_leased_to_company_id, eq.owner_company_id) = l.operating_company_id
            WHERE lah.load_id = l.id
              AND lah.operating_company_id = l.operating_company_id
              AND lah.new_trailer_id IS NOT NULL
            ORDER BY lah.assigned_at DESC, lah.created_at DESC
            LIMIT 1
          ) tr ON true
          -- DISPATCH-DRIVER-LABEL-LOST-FOR-DEACTIVATED-DRIVERS — see the matching count-query join
          -- above for the full root-cause note; same fix, same reason (historical assignment, not
          -- an active-driver picker).
          LEFT JOIN mdata.drivers d ON d.id = l.assigned_primary_driver_id
                                   AND (d.operating_company_id = l.operating_company_id OR EXISTS (
                                     SELECT 1 FROM mdata.driver_company_authorizations load_list_rows_dca
                                      WHERE load_list_rows_dca.driver_id = d.id
                                        AND load_list_rows_dca.company_id = l.operating_company_id
                                        AND load_list_rows_dca.is_authorized = true
                                        AND load_list_rows_dca.deactivated_at IS NULL
                                   ))
          JOIN catalogs.dispatch_flag_colors df ON df.id = l.dispatch_flag_color_id
                                                AND df.operating_company_id = l.operating_company_id
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
      let enrichedRows = res.rows as Array<Record<string, unknown>>;

      if (include_progress) {
        enrichedRows = await Promise.all(
          enrichedRows.map(async (row) => {
            const progress = await computeProgressStatus(client, {
              operating_company_id: String(row.operating_company_id),
              load_id: String(row.id),
              assigned_unit_id: row.assigned_unit_id ? String(row.assigned_unit_id) : null,
            });
            return {
              ...row,
              progress_status: progress.progress_status,
              progress_eta_delta_minutes: progress.eta_delta_minutes,
            };
          })
        );
      }

      if (include_live_eta) {
        const etaByLoad = await enrichLoadsLiveEta(
          client,
          enrichedRows.map((row) => ({
            id: String(row.id),
            operating_company_id: String(row.operating_company_id),
            status: String(row.status),
            assigned_primary_driver_id: row.assigned_primary_driver_id ? String(row.assigned_primary_driver_id) : null,
            assigned_unit_id: row.assigned_unit_id ? String(row.assigned_unit_id) : null,
            delivery_scheduled_at: row.delivery_scheduled_at ? String(row.delivery_scheduled_at) : null,
          }))
        );
        enrichedRows = enrichedRows.map((row) => ({ ...row, ...(etaByLoad.get(String(row.id)) ?? {}) }));
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

  app.get("/api/v1/mdata/loads/:id", { config: { rateLimit: { max: 60, timeWindow: "1 minute" } } }, async (req, reply) => {
    const authUser = currentAuthUser(req, reply);
    if (!authUser) return;
    // LV-DOCS-LOAD-DISPLAY-ID-DEEPLINK: GET accepts UUID or human load_number (mutations stay UUID-only).
    const parsedParams = loadRefParamSchema.safeParse(req.params ?? {});
    if (!parsedParams.success) return sendValidationError(reply, parsedParams.error);
    const parsedQuery = loadDetailQuerySchema.safeParse(req.query ?? {});
    if (!parsedQuery.success) return sendValidationError(reply, parsedQuery.error);
    const scopedCompanyId = parsedQuery.data.operating_company_id;
    await assertCompanyMembership(authUser.uuid, scopedCompanyId);

    const detail = await withCurrentUser(authUser.uuid, async (client) => {
      const loadRes = await client.query(
        `
          SELECT
            l.id, l.operating_company_id, l.load_number, l.customer_id, l.status, l.rate_total_cents, l.currency_code,
            l.assigned_unit_id, l.assigned_primary_driver_id, l.assigned_secondary_driver_id, l.team_id,
            l.dispatcher_user_id, l.notes, l.created_at, l.updated_at, l.soft_deleted_at, l.deleted_by_user_id,
            -- LV-TXN-002 (name resolution). This by-id read returned the three assignment UUIDs and NOTHING
            -- else, so every consumer of GET /api/v1/mdata/loads/:id had to render an id. LoadDetailDrawer
            -- falls back to exactly this endpoint whenever it has no operatingCompanyId
            -- (LoadDetailDrawer.tsx:147 useLoad(operatingCompanyId ? null : loadId)), and FactoringTab /
            -- FinesDeductionsCard read it unconditionally — so on that path the drawer showed
            -- "Driver 3f2a…" / "Unit 91c7…" for a load that HAS both. The sibling
            -- GET /api/v1/dispatch/loads/:id already resolves these (see the dispatch loads route file,
            -- lines 709-715); the file name is spelled out rather than dotted because
            -- verify-sql-read-targets parses comment text and reads a dotted name as <table>.<column>;
            -- this endpoint was simply never given the same joins, which is what makes the two paths
            -- disagree about the same load. Read-only enrichment: no new column, no fabricated field.
            -- PROD-VERIFIED 2026-08-10 (bypass, existence only, 34/34 loads visible == n_live_tup):
            -- L-20260810-0003 resolves to "Rafael Rogelio Rivero Reynoso" / unit "T149".
            NULLIF(TRIM(CONCAT(COALESCE(pd.first_name, ''), ' ', COALESCE(pd.last_name, ''))), '') AS assigned_primary_driver_name,
            NULLIF(TRIM(CONCAT(COALESCE(sd.first_name, ''), ' ', COALESCE(sd.last_name, ''))), '') AS assigned_secondary_driver_name,
            u.unit_number AS assigned_unit_number,
            -- Block 7 (full-edit prefill): editable columns the book-load INSERT actually writes, so the
            -- Edit wizard can round-trip them. Read-only enrichment; every column verified present in
            -- book-load.service.ts INSERT + accepted by the PATCH schema (no fabricated fields).
            l.customer_wo_number, l.pickup_number, l.border_routing, l.driver_instructions_text,
            -- FAIL-B4 completion: the Edit wizard prefills the sample checkbox from this field, and the
            -- book-load INSERT has written it since FAIL-D6 — but this SELECT never returned it, so the
            -- box rendered UNCHECKED on every edit of a sample load no matter what the row held. Verified
            -- live on prod: GET /api/v1/mdata/loads/:id answered 200 for a known sample load with the key
            -- entirely ABSENT from the payload. Column verified present (migration 0403), not fabricated.
            l.is_sample_data,
            l.requires_tarps, l.tarp_type, l.lumper_amount_cents,
            l.customer_chargeback_requested, l.customer_chargeback_reason, l.live_load_number,
            l.anticipated_chargeback_cents, l.anticipated_chargeback_reason,
            l.detention_expected_y_n, l.detention_expected_hours,
            l.detention_bill_customer_per_hour_cents, l.detention_driver_pay_per_hour_cents,
            l.late_delivery_risk_y_n, l.late_delivery_est_deduction_cents, l.late_delivery_reason,
            l.miles_practical, l.miles_shortest, l.miles_deadhead,
            -- CLS-SCHEMA-DRIFT / PHANTOM COLUMN — verified against the PROD branch 2026-08-07:
            -- mdata.loads had NO commodity, NO cargo_weight_lbs and NO reefer_setpoint_temp_f at that
            -- time (the comment above asserted those names; information_schema did not). This SELECT
            -- made GET /api/v1/mdata/loads/:id return 500 (42703, commodity does not exist) for EVERY
            -- load, while the list and dispatch endpoints — which did not select them — returned 200.
            -- RESTORED (ACCT-F9508, migration 202613220000): commodity + cargo_weight_lbs are real
            -- columns now. reefer_setpoint_temp_f stays excluded — that name was never real; the
            -- reefer setpoint that DOES exist is reefer_temp_f, already selected below.
            l.commodity, l.cargo_weight_lbs,
            l.trip_type,
            -- Block 7 (migration 202606221000, Jorge-approved): pieces + customer PO round-trip in Edit.
            l.piece_count, l.customer_po_number,
            -- render-v6 §B reefer/tarp detail (migration 202606231400).
            l.reefer_temp_f, l.reefer_mode, l.pre_cool, l.tarp_qty, l.tarp_size
          FROM mdata.loads l
          -- Entity predicates copied verbatim from the already-correct sibling
          -- (the dispatch loads route file, lines 747-750): drivers scope on operating_company_id, but mdata.units
          -- has NO such column (§4) — it is scoped by the owner/leased PAIR, and the live case that
          -- exposed this is exactly a TRK-owned unit LEASED to USMCA, which a bare owner_company_id
          -- predicate would silently drop back to a raw id.
          -- DISPATCH-DRIVER-LABEL-LOST-FOR-DEACTIVATED-DRIVERS — same root cause and fix as the
          -- list-query joins above: dropped the "AND pd/sd.archived_at IS NULL" exclusion so a
          -- load's historical driver assignment (primary or secondary) stays labeled after the
          -- driver is later archived/deactivated. Not RLS (drivers_select does not filter
          -- deactivated_at at all) — this join's own extra filter was the actual defect. The
          -- SEPARATE driver-self-access EXISTS check below (mdata.drivers d, "AND d.archived_at IS
          -- NULL") is intentionally UNCHANGED — that gate decides whether a live driver session may
          -- read this load at all, a real access-control question, not a label-display one.
          LEFT JOIN mdata.drivers pd ON pd.id = l.assigned_primary_driver_id
                                    AND (pd.operating_company_id = l.operating_company_id OR EXISTS (
                                      SELECT 1 FROM mdata.driver_company_authorizations load_detail_primary_dca
                                      WHERE load_detail_primary_dca.driver_id = pd.id AND load_detail_primary_dca.company_id = l.operating_company_id
                                        AND load_detail_primary_dca.is_authorized = true AND load_detail_primary_dca.deactivated_at IS NULL
                                    ))
          LEFT JOIN mdata.drivers sd ON sd.id = l.assigned_secondary_driver_id
                                    AND (sd.operating_company_id = l.operating_company_id OR EXISTS (
                                      SELECT 1 FROM mdata.driver_company_authorizations load_detail_secondary_dca
                                      WHERE load_detail_secondary_dca.driver_id = sd.id AND load_detail_secondary_dca.company_id = l.operating_company_id
                                        AND load_detail_secondary_dca.is_authorized = true AND load_detail_secondary_dca.deactivated_at IS NULL
                                    ))
          LEFT JOIN mdata.units u ON u.id = l.assigned_unit_id
                                 AND COALESCE(u.currently_leased_to_company_id, u.owner_company_id) = l.operating_company_id
          WHERE ${loadRefMatchSql("l", 1)}
            AND l.operating_company_id = $2::uuid
            -- Tier-1 entity-scope (money by-id IDOR): rate_total_cents is GROSS customer revenue.
            -- Defense-in-depth mirror of the two SELECT RLS policies (loads_select_office +
            -- loads_select_driver) so an office user only reads loads of their accessible companies
            -- (Owner = all) while an assigned driver still reads their own load. Without this, a
            -- bypass/unforced-RLS regression would leak cross-entity revenue/customer/detention.
            AND (
              l.operating_company_id IN (SELECT org.user_accessible_company_ids())
              OR EXISTS (
                SELECT 1 FROM mdata.drivers d
                WHERE d.identity_user_id = NULLIF(current_setting('app.current_user_id', true), '')::uuid
                  AND d.archived_at IS NULL
                  AND (d.operating_company_id = l.operating_company_id OR EXISTS (
                    SELECT 1 FROM mdata.driver_company_authorizations load_access_dca
                    WHERE load_access_dca.driver_id = d.id AND load_access_dca.company_id = l.operating_company_id
                      AND load_access_dca.is_authorized = true AND load_access_dca.deactivated_at IS NULL
                  ))
                  AND (d.id = l.assigned_primary_driver_id OR d.id = l.assigned_secondary_driver_id)
              )
            )
          LIMIT 1
        `,
        [parsedParams.data.id, scopedCompanyId]
      );
      const load = loadRes.rows[0] ?? null;
      if (!load) return null;

      // LV-DOCS-LOAD-DEEPLINK-44FCB11: path may be load_number; stop FK is UUID — bind resolved id.
      const resolvedLoadId = String(load.id);

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
          WHERE load_id = $1::uuid
          ORDER BY sequence_number ASC, created_at ASC
        `,
        [resolvedLoadId]
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
    const parsedQuery = loadDetailQuerySchema.safeParse(req.query ?? {});
    if (!parsedQuery.success) return sendValidationError(reply, parsedQuery.error);
    const scopedCompanyId = parsedQuery.data.operating_company_id;
    await assertCompanyMembership(authUser.uuid, scopedCompanyId);

    const result = await withCurrentUser(authUser.uuid, async (client) => {
      const ownedLoad = await client.query(
        `SELECT id FROM mdata.loads WHERE id = $1::uuid AND operating_company_id = $2::uuid LIMIT 1`,
        [parsedParams.data.id, scopedCompanyId],
      );
      if (!ownedLoad.rows[0]) return null;
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
      return { events: res.rows };
    });

    if (!result) return reply.code(404).send({ error: "mdata_load_not_found" });
    return result;
  });

  app.patch("/api/v1/mdata/loads/:id/status", { config: { rateLimit: { max: 60, timeWindow: "1 minute" } } }, async (req, reply) => {
    const authUser = currentAuthUser(req, reply);
    if (!authUser) return;
    if (!isOfficeWriteRole(authUser.role)) return reply.code(403).send({ error: "forbidden" });

    const parsedParams = loadIdParamSchema.safeParse(req.params ?? {});
    if (!parsedParams.success) return sendValidationError(reply, parsedParams.error);
    const parsedBody = loadStatusTransitionBodySchema.safeParse(req.body ?? {});
    if (!parsedBody.success) return sendValidationError(reply, parsedBody.error);
    const parsedQuery = loadDetailQuerySchema.safeParse(req.query ?? {});
    if (!parsedQuery.success) return sendValidationError(reply, parsedQuery.error);
    const scopedCompanyId = parsedQuery.data.operating_company_id;
    await assertCompanyMembership(authUser.uuid, scopedCompanyId);
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
           AND operating_company_id = $2::uuid
         LIMIT 1`,
        [parsedParams.data.id, scopedCompanyId]
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
              AND operating_company_id = $2::uuid
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
            AND operating_company_id = $3::uuid
          RETURNING
            id, operating_company_id, load_number, customer_id, status, rate_total_cents, currency_code,
            assigned_unit_id, assigned_primary_driver_id, assigned_secondary_driver_id, team_id,
            dispatcher_user_id, notes, created_at, updated_at, soft_deleted_at, deleted_by_user_id
        `,
        [parsedParams.data.id, newStatus, scopedCompanyId]
      );
      const row = updateRes.rows[0] ?? null;
      if (!row) return { error: "mdata_load_not_found" as const };

      // CLS-DISP-WIRE-07 — dual-path kill: this route used to flip status with zero stop evidence.
      // Same stamp as dispatch transition + bulk set_status (never overwrite driver departure).
      if (loadStatusRequiresDeliveryDepartureStamp(String(row.status))) {
        await stampFinalActiveDeliveryDeparture(client, row.id, null);
      }

      // ACCT-F277 — delivery is the final idempotent backstop. A Book-created bill is a no-op;
      // a load created through a secondary path is minted now if its configured pay inputs exist;
      // missing per-mile mileage/rate remains a durable, queryable skip rather than silent $0 pay.
      if (loadStatusRequiresDeliveryDepartureStamp(String(row.status))) {
        await ensureDriverBillArtifactsForLoad(client, {
          loadId: String(row.id),
          operatingCompanyId: String(row.operating_company_id),
          actorUserId: authUser.uuid,
        });
      }

      // CLS-DISP-WIRE-07 — this route STAMPED the departure but never LATCHED revenue, so a load
      // delivered via the mdata status PATCH recorded evidence the ledger never heard about. Found
      // by verify-delivery-evidence-latch-wired while fixing the two driver paths — the guard caught
      // a site I had not been asked to look at, which is the point of scanning for the shape rather
      // than patching the three known files.
      await latchOnDeliveryEvidence(client, {
        operatingCompanyId: String(row.operating_company_id),
        loadId: String(row.id),
        targetStatus: String(row.status),
        actorUserId: req.user!.uuid,
      });

      // ACCT-F166 — this route recognised revenue and opened NO settlement.
      //
      // THE GAP: `updateLoadStatus` (apps/frontend/src/api/loads.ts) sends the office status change to
      // PATCH /api/v1/dispatch/loads/:id/transition ONLY when an operating company is known AND the
      // target maps to a dispatch transition status. Every other status change — and every drop on a
      // lane the mapper does not handle — FALLS BACK here. The latch above was wired to this route,
      // so revenue recognition fired; `pingSettlementOnLoadEvent` was not, so the driver's settlement
      // was never opened. Revenue on the books, nothing to pay the driver from: the two halves of the
      // same delivery disagreed depending on which endpoint the FE happened to choose.
      //
      // main's own LAW-2026-08-06-KANBAN-DROPSTATUS-CONTRACT already names this shape — "a lane the
      // mapper does not handle silently falls back to the non-money mdata path, stamping no departure
      // and opening no settlement". This closes the settlement half on the route itself, so the
      // fallback is money-complete no matter what the FE picks.
      //
      // Non-fatal by design, matching the dispatch route: a settlement-ping failure must never 500 an
      // office status change. Losing the status write is worse than deferring the settlement, which
      // the twice-daily reconcile surfaces.
      try {
        await pingSettlementOnLoadEvent(client, {
          loadId: String(row.id),
          operatingCompanyId: String(row.operating_company_id),
          dispatchTargetStatus: String(row.status),
          actorUserId: req.user!.uuid,
        });
      } catch (err) {
        console.warn({ err, load_id: String(row.id) }, "mdata_load_settlement_ping_failed");
      }

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
            // ACT-F5412: this path always writes status='approved' — stamp the same actor as approver
            // of record, matching the standalone approveCancellation() flow's provenance.
            approved_by_user_id: authUser.uuid,
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

  app.patch("/api/v1/mdata/loads/:id", { config: { rateLimit: { max: 60, timeWindow: "1 minute" } } }, async (req, reply) => {
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

    if ("dispatch_flag_color_id" in b) add("dispatch_flag_color_id", b.dispatch_flag_color_id);
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

        const primaryChanged =
          "assigned_primary_driver_id" in b &&
          String(b.assigned_primary_driver_id ?? "") !== String(oldRow.assigned_primary_driver_id ?? "");
        const secondaryChanged =
          "assigned_secondary_driver_id" in b &&
          String(b.assigned_secondary_driver_id ?? "") !== String(oldRow.assigned_secondary_driver_id ?? "");
        if (primaryChanged || secondaryChanged) {
          const hazmatRes = await client.query<{ is_hazmat: boolean }>(
            `
              SELECT COALESCE((quicksave_pending_fields->>'hazmat')::boolean, false) AS is_hazmat
              FROM mdata.loads
              WHERE id = $1::uuid
                AND operating_company_id = $2::uuid
              LIMIT 1
            `,
            [parsedParams.data.id, oldRow.operating_company_id]
          );
          const isHazmat = Boolean(hazmatRes.rows[0]?.is_hazmat);
          await gateMdataLoadDriverAssignment(
            client,
            String(oldRow.operating_company_id),
            [
              primaryChanged ? (b.assigned_primary_driver_id ?? null) : null,
              secondaryChanged ? (b.assigned_secondary_driver_id ?? null) : null,
            ],
            isHazmat
          );
        }

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

        // FAIL-I1 dual-path: mdata PATCH was updating rate_total_cents without refreshing the
        // draft/proforma from-load invoice (dispatch updateDispatchLoad already did). Same helper.
        const oldRate = Number((oldRow as { rate_total_cents?: unknown }).rate_total_cents ?? 0);
        const newRate = Number((row as { rate_total_cents?: unknown }).rate_total_cents ?? 0);
        if ("rate_total_cents" in b && oldRate !== newRate) {
          await resyncProformaInvoiceFromLoadRate(client, {
            loadId: String((row as { id: string }).id),
            operatingCompanyId: String((row as { operating_company_id: string }).operating_company_id),
            newRateTotalCents: newRate,
            userId: authUser.uuid,
          });
        }

        return row;
      });

      if (!updated) return reply.code(404).send({ error: "mdata_load_not_found" });
      return updated;
    } catch (err) {
      if (err instanceof DriverNotQualifiedError) {
        return reply.code(422).send({
          error: err.code,
          message: err.message,
          details: {
            driver_id: err.block.driverId,
            reasons: err.block.reasons,
            cdl_expires_at: err.block.cdlExpiresAt,
            medical_expiry_date: err.block.medicalExpiryDate,
            hazmat_endorsement_expires_at: err.block.hazmatEndorsementExpiresAt,
          },
        });
      }
      const code = (err as { code?: string }).code;
      if (code === "23505") return reply.code(409).send({ error: "mdata_load_conflict" });
      if (code === "23503") return reply.code(400).send({ error: "invalid_foreign_key" });
      throw err;
    }
  });

  app.post("/api/v1/mdata/loads/:id/stops", { config: { rateLimit: { max: 60, timeWindow: "1 minute" } } }, async (req, reply) => {
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
          `SELECT id FROM mdata.loads WHERE id = $1 AND operating_company_id = $2::uuid LIMIT 1`,
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

  app.patch("/api/v1/mdata/loads/:id/stops/:stopId", { config: { rateLimit: { max: 60, timeWindow: "1 minute" } } }, async (req, reply) => {
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
          `SELECT 1 FROM mdata.loads WHERE id = $1 AND operating_company_id = $2::uuid LIMIT 1`,
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

  app.delete("/api/v1/mdata/loads/:id/stops/:stopId", { config: { rateLimit: { max: 60, timeWindow: "1 minute" } } }, async (req, reply) => {
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
        `SELECT 1 FROM mdata.loads WHERE id = $1 AND operating_company_id = $2::uuid LIMIT 1`,
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
      await client.query(`SELECT set_config('app.operating_company_id', $1::text, true)`, [scopedId]);

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
                                AND c.operating_company_id = l.operating_company_id
          LEFT JOIN mdata.units u ON u.id = l.assigned_unit_id
                                 AND COALESCE(u.currently_leased_to_company_id, u.owner_company_id) = l.operating_company_id
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
