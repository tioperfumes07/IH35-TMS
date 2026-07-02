import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { randomUUID } from "crypto";
import { z } from "zod";
import { withCurrentUser } from "../auth/db.js";
import { requireAuth } from "../auth/session-middleware.js";
import { appendCrudAudit } from "../audit/crud-audit.js";
import { bookLoad } from "./book-load.service.js";
import {
  updateDispatchLoad,
  LoadNotFoundError,
  LoadEditLockedError,
  type UpdateDispatchLoadFields,
} from "./update-load.service.js";
import { distributeLoadInstructions } from "./load-distribution.service.js";
import { cancelLoadIdReservation, reserveNextLoadId } from "./load-id-reservation.service.js";
import { emitAutoProposedEscrowEvents } from "../driver-finance/escrow-deduction-pending.service.js";
import { pingSettlementOnLoadEvent } from "../driver-finance/settlements-load-bookended.service.js";
import { notifyAbandonedLoadStakeholders } from "../notifications/dispatcher.js";
import { isR2Configured, putObjectBytes } from "../storage/r2-client.js";
import { getCurrentClocks } from "../telematics/hos-clocks.service.js";
import { autoCreateGeofencesForLoad } from "../telematics/auto-geofence.service.js";
import { detectAssetCoverageGap } from "../insurance/coverage-gap.service.js";
import { countActiveDispatchLoads, countInTransitDispatchLoads } from "./active-loads-count.js";
import { emitDispatchSpineEvent } from "./dispatch-spine-emit.js";

// Book Load §C relocates several stop fields to hidden, react-hook-form-registered <input>s
// (BookLoadStopsSection.tsx). RHF reads a hidden input's value as a STRING ("" when empty), so
// boolean / number / datetime stop fields arrive on the wire as strings and a bare z.boolean() /
// z.number() / z.string().datetime() rejects them with a 400 — the `is_tarp_stop: ""` booking blocker.
// These tolerant wrappers accept the wire string and coerce to the real type. IMPORTANT: NOT
// z.coerce.boolean() — Boolean("false") === true would invert the value; we map the literal strings.
export const stopBooleanish = z.preprocess(
  (v) => (v === "" || v == null ? undefined : v === "true" || v === true ? true : v === "false" || v === false ? false : v),
  z.boolean().optional()
);
export const stopIntish = z.preprocess(
  (v) => (v === "" || v == null ? undefined : typeof v === "string" ? Number(v) : v),
  z.number().int().min(0).optional()
);
export const stopDatetimeish = z.preprocess(
  (v) => (v === "" || v == null ? undefined : v),
  z.string().datetime({ offset: true }).optional()
);

const dispatchStatusSchema = z.enum([
  "unassigned",
  "assigned_not_dispatched",
  "dispatched",
  "in_transit",
  "delivered_pending_docs",
  "completed_docs_received",
  "cancelled",
  "abandoned",
  "driver_walkoff",
  "driver_no_show",
]);

const listDispatchLoadsQuerySchema = z.object({
  operating_company_id: z.string().uuid(),
  limit: z.coerce.number().int().min(1).max(200).default(50),
  offset: z.coerce.number().int().min(0).default(0),
  status: z
    .preprocess((value) => {
      if (Array.isArray(value)) return value;
      if (typeof value === "string") return value.split(",").map((entry) => entry.trim()).filter(Boolean);
      return undefined;
    }, z.array(dispatchStatusSchema).optional())
    .optional(),
  customer: z.string().uuid().optional(),
  driver: z.string().uuid().optional(),
  from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  search: z.string().trim().max(120).optional(),
  view: z.enum(["home", "loads"]).optional(),
});

const dispatchLoadIdParamsSchema = z.object({
  id: z.string().uuid(),
});
const dispatchUnitIdParamsSchema = z.object({
  unit_id: z.string().uuid(),
});
const dispatchDriverIdParamsSchema = z.object({
  driver_id: z.string().uuid(),
});
const dispatchUnitInsuranceQuerySchema = z.object({
  operating_company_id: z.string().uuid(),
  as_of_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
});

const dispatchPreferenceBodySchema = z.object({
  dispatch_default_view: z.enum(["home", "loads"]),
});

const transitionBodySchema = z.object({
  new_status: dispatchStatusSchema,
  cancellation_reason_code: z.string().trim().max(80).optional(),
});

const dispatchLoadReservationParamsSchema = z.object({
  reservation_uuid: z.string().uuid(),
});

const stopTimeWindowSchema = z.preprocess(
  (value) => {
    if (value === "first_come_first_serve") return "open_window";
    if (value === "drop_window") return "select_hours";
    return value;
  },
  z.enum(["appointment", "open_window", "select_hours", "refused"]).optional()
);

const createDispatchLoadBodySchema = z.object({
  operating_company_id: z.string().uuid(),
  customer_id: z.string().uuid(),
  status: dispatchStatusSchema.default("assigned_not_dispatched"),
  customer_wo_number: z.string().trim().max(120).optional(),
  customer_po_number: z.string().trim().max(120).optional(),
  commodity: z.string().trim().max(120).optional(),
  weight_lbs: z.number().int().min(0).optional(),
  piece_count: z.number().int().min(0).optional(),
  // [HOLD-FOR-JORGE — TIER 1] Booked advances (cents). CASH → pending owner-approval cash-advance request
  // (recovered from settlement). FUEL → truck cost, deferred (never a driver deduction). No money on mdata.loads.
  cash_advance_cents: z.number().int().min(0).optional(),
  fuel_advance_cents: z.number().int().min(0).optional(),
  cash_advance_recovery_mode: z.enum(["full", "amortize"]).optional(),
  cash_advance_recovery_cents: z.number().int().positive().optional(),
  hazmat: z.boolean().optional(),
  driver_instructions_text: z.string().trim().max(5000).optional(),
  notes: z.string().trim().max(5000).optional(),
  booking_mode: z.enum(["single_popup", "legacy_form"]).default("single_popup"),
  requires_tarps: z.boolean().default(false),
  tarp_type: z.string().trim().max(60).optional(),
  // render-v6 §B reefer/tarp detail (migration 202606231400).
  reefer_temp_f: z.number().optional(),
  reefer_mode: z.string().trim().max(40).optional(),
  pre_cool: z.boolean().optional(),
  tarp_qty: z.number().int().min(0).optional(),
  tarp_size: z.string().trim().max(40).optional(),
  lumper_amount_cents: z.number().int().min(0).default(0),
  customer_chargeback_requested: z.boolean().default(false),
  customer_chargeback_reason: z.string().trim().max(1000).optional(),
  live_load_number: z.string().trim().max(60).optional(),
  addToOpenPresettlement: z.boolean().optional(),
  reservation_uuid: z.string().uuid().optional(),
  anticipated_chargeback_cents: z.number().int().min(0).optional(),
  anticipated_chargeback_reason: z.string().trim().max(1000).optional(),
  detention_expected_y_n: z.boolean().optional(),
  detention_expected_hours: z.number().min(0).max(999.99).optional(),
  detention_bill_customer_per_hour_cents: z.number().int().min(0).optional(),
  detention_driver_pay_per_hour_cents: z.number().int().min(0).optional(),
  late_delivery_risk_y_n: z.boolean().optional(),
  late_delivery_est_deduction_cents: z.number().int().min(0).optional(),
  late_delivery_reason: z.string().trim().max(1000).optional(),
  ocr_source_pdf_r2_key: z.string().trim().max(512).optional(),
  miles_practical: z.number().int().min(0).optional(),
  miles_shortest: z.number().int().min(0).optional(),
  miles_deadhead: z.number().int().min(0).optional(),
  pickup_number: z.string().trim().max(120).optional(),
  border_routing: z.string().trim().max(120).optional(),
  trailer_type: z.enum(["refrigerated_van", "dry_van", "flatbed", "lowboy", "power_only_no_trailer", "power_only_customer_trailer"]).optional(),
  // Trip Pairing (Block 04): optional at the API for now (Phase 1, additive — no break for in-flight
  // clients); the wizard makes it REQUIRED on the UI, and a follow-up flips this to required once the
  // selector ships on all clients. NB starts a tour; TR/SB pass the tour_id to join.
  trip_type: z.enum(["NB", "TR", "SB"]).optional(),
  tour_id: z.string().uuid().optional(),
  assigned_unit_id: z.string().uuid().optional(),
  assigned_trailer_unit_id: z.string().uuid().optional(), // W-FIX-3b: persisted to mdata.loads.trailer_id
  temperature_type: z.enum(["frozen", "fresh"]).optional(), // W-FIX-1: reefer Frozen/Fresh → loads.temperature_type
  assigned_primary_driver_id: z.string().uuid().optional(),
  assigned_secondary_driver_id: z.string().uuid().optional(),
  team_id: z.string().uuid().optional(),
  temp_fahrenheit: z.number().int().optional(),
  charges: z
    .array(
      z.object({
        code: z.string().trim().min(1).max(60),
        amount_cents: z.number().int().min(0),
      })
    )
    .default([]),
  stops: z
    .array(
      z.object({
        stop_type: z.enum(["pickup", "delivery"]),
        sequence_number: z.number().int().min(1),
        location_id: z.string().uuid().optional(),
        company_name: z.string().trim().max(200).optional(),
        city: z.string().trim().max(120).optional(),
        state: z.string().trim().max(120).optional(),
        country: z.string().trim().max(120).optional(),
        address_line1: z.string().trim().max(300).optional(),
        scheduled_arrival_at: z.string().datetime({ offset: true }).optional(),
        time_window_type: stopTimeWindowSchema,
        appointment_start_at: stopDatetimeish,
        appointment_end_at: stopDatetimeish,
        lumper_required: stopBooleanish,
        lumper_paid_by: z.enum(["carrier", "shipper", "broker", "receiver", "unknown"]).optional(),
        lumper_amount_cents: z.number().int().min(0).optional(),
        is_tarp_stop: stopBooleanish,
        tarp_count: stopIntish,
        stop_notes: z.string().trim().max(1000).optional(),
        site_contact_name: z.string().trim().max(200).optional(),
        site_contact_phone: z.string().trim().max(40).optional(),
        gate_dock_text: z.string().trim().max(200).optional(),
        postal_code: z.string().trim().max(20).optional(),
      })
    )
    .min(2),
  save_mode: z.enum(["draft", "book_dispatch"]).default("book_dispatch"),
  override_token: z.string().uuid().optional(),
  override_reason: z.string().trim().min(10).max(1000).optional(),
});

// Block 06 (Inc 2) — full load edit. All fields optional (PATCH semantics); only present keys update.
// Excludes status (uses /transition) and immutable booking provenance. Charges -> rate_total_cents;
// stops (>=2 when provided) are replaced evidence-safely in the service.
const updateDispatchLoadBodySchema = z.object({
  operating_company_id: z.string().uuid(),
  customer_id: z.string().uuid().optional(),
  customer_wo_number: z.string().trim().max(120).nullable().optional(),
  pickup_number: z.string().trim().max(120).nullable().optional(),
  border_routing: z.string().trim().max(120).nullable().optional(),
  driver_instructions_text: z.string().trim().max(5000).nullable().optional(),
  notes: z.string().trim().max(5000).nullable().optional(),
  requires_tarps: z.boolean().optional(),
  tarp_type: z.string().trim().max(60).nullable().optional(),
  lumper_amount_cents: z.number().int().min(0).optional(),
  customer_chargeback_requested: z.boolean().optional(),
  customer_chargeback_reason: z.string().trim().max(1000).nullable().optional(),
  live_load_number: z.string().trim().max(60).nullable().optional(),
  anticipated_chargeback_cents: z.number().int().min(0).nullable().optional(),
  anticipated_chargeback_reason: z.string().trim().max(1000).nullable().optional(),
  detention_expected_y_n: z.boolean().optional(),
  detention_expected_hours: z.number().min(0).max(999.99).nullable().optional(),
  detention_bill_customer_per_hour_cents: z.number().int().min(0).nullable().optional(),
  detention_driver_pay_per_hour_cents: z.number().int().min(0).nullable().optional(),
  late_delivery_risk_y_n: z.boolean().optional(),
  late_delivery_est_deduction_cents: z.number().int().min(0).nullable().optional(),
  late_delivery_reason: z.string().trim().max(1000).nullable().optional(),
  miles_practical: z.number().int().min(0).nullable().optional(),
  miles_shortest: z.number().int().min(0).nullable().optional(),
  miles_deadhead: z.number().int().min(0).nullable().optional(),
  trip_type: z.enum(["NB", "TR", "SB"]).optional(),
  // Block 7 (Jorge-approved, no migration): commodity/weight/reefer setpoint round-trip in the Edit wizard.
  commodity: z.string().trim().max(120).nullable().optional(),
  cargo_weight_lbs: z.number().int().min(0).nullable().optional(),
  reefer_setpoint_temp_f: z.number().nullable().optional(),
  // Block 7 (migration 202606221000, Jorge-approved): pieces + customer PO round-trip in Edit.
  piece_count: z.number().int().min(0).nullable().optional(),
  customer_po_number: z.string().trim().max(120).nullable().optional(),
  // render-v6 §B reefer/tarp detail (migration 202606231400).
  reefer_temp_f: z.number().nullable().optional(),
  reefer_mode: z.string().trim().max(40).nullable().optional(),
  pre_cool: z.boolean().nullable().optional(),
  temperature_type: z.enum(["frozen", "fresh"]).nullable().optional(), // W-FIX-1
  tarp_qty: z.number().int().min(0).nullable().optional(),
  tarp_size: z.string().trim().max(40).nullable().optional(),
  tour_id: z.string().uuid().nullable().optional(),
  assigned_unit_id: z.string().uuid().nullable().optional(),
  assigned_primary_driver_id: z.string().uuid().nullable().optional(),
  assigned_secondary_driver_id: z.string().uuid().nullable().optional(),
  team_id: z.string().uuid().nullable().optional(),
  charges: z
    .array(z.object({ code: z.string().trim().min(1).max(60), amount_cents: z.number().int().min(0) }))
    .optional(),
  stops: z
    .array(
      z.object({
        stop_type: z.enum(["pickup", "delivery"]),
        location_id: z.string().uuid().optional(),
        city: z.string().trim().max(120).optional(),
        state: z.string().trim().max(120).optional(),
        country: z.string().trim().max(120).optional(),
        address_line1: z.string().trim().max(300).optional(),
        scheduled_arrival_at: z.string().datetime({ offset: true }).optional(),
        time_window_type: stopTimeWindowSchema.optional(),
        appointment_start_at: stopDatetimeish,
        appointment_end_at: stopDatetimeish,
        lumper_required: stopBooleanish,
        lumper_paid_by: z.enum(["carrier", "shipper", "broker", "receiver", "unknown"]).optional(),
        lumper_amount_cents: z.number().int().min(0).optional(),
        is_tarp_stop: stopBooleanish,
        tarp_count: stopIntish,
        stop_notes: z.string().trim().max(1000).optional(),
        site_contact_name: z.string().trim().max(200).optional(),
        site_contact_phone: z.string().trim().max(40).optional(),
        gate_dock_text: z.string().trim().max(200).optional(),
        postal_code: z.string().trim().max(20).optional(),
      })
    )
    .min(2)
    .optional(),
});

const reserveLoadIdBodySchema = z.object({
  operating_company_id: z.string().uuid(),
});

const anticipatedChargebackBodySchema = z.object({
  operating_company_id: z.string().uuid(),
  customer_chargeback_requested: z.boolean(),
  customer_chargeback_reason: z.string().trim().max(1000).nullable().optional(),
});

function currentAuthUser(req: FastifyRequest, reply: FastifyReply) {
  if (!requireAuth(req, reply)) return null;
  return req.user;
}

function sendValidationError(reply: FastifyReply, error: z.ZodError) {
  return reply.code(400).send({ error: "validation_error", details: error.flatten() });
}

async function withCompanyScope<T>(
  userId: string,
  operatingCompanyId: string,
  fn: (client: {
    query: <R = Record<string, unknown>>(sql: string, values?: unknown[]) => Promise<{ rows: R[] }>;
  }) => Promise<T>
) {
  return withCurrentUser(userId, async (client) => {
    await client.query("SELECT set_config('app.operating_company_id', $1, true)", [operatingCompanyId]);
    return fn(client);
  });
}

function fromMdataStatus(status: string): z.infer<typeof dispatchStatusSchema> {
  if (status === "assigned") return "assigned_not_dispatched";
  if (status === "at_pickup") return "dispatched";
  if (status === "at_delivery") return "in_transit";
  if (status === "delivered") return "delivered_pending_docs";
  if (status === "invoiced" || status === "paid" || status === "closed") return "completed_docs_received";
  if (status === "cancelled") return "cancelled";
  if (status === "unassigned") return "unassigned";
  if (status === "assigned_not_dispatched") return "assigned_not_dispatched";
  if (status === "dispatched") return "dispatched";
  if (status === "in_transit") return "in_transit";
  if (status === "delivered_pending_docs") return "delivered_pending_docs";
  if (status === "completed_docs_received") return "completed_docs_received";
  if (status === "abandoned") return "abandoned";
  if (status === "driver_walkoff") return "driver_walkoff";
  if (status === "driver_no_show") return "driver_no_show";
  return "unassigned";
}

function toMdataStatus(status: z.infer<typeof dispatchStatusSchema>): string {
  if (status === "unassigned") return "draft";
  if (status === "assigned_not_dispatched") return "assigned_not_dispatched";
  if (status === "dispatched") return "dispatched";
  if (status === "in_transit") return "in_transit";
  if (status === "delivered_pending_docs") return "delivered_pending_docs";
  if (status === "completed_docs_received") return "completed_docs_received";
  if (status === "abandoned") return "abandoned";
  if (status === "driver_walkoff") return "driver_walkoff";
  if (status === "driver_no_show") return "driver_no_show";
  return "cancelled";
}

const allowedTransitions: Record<z.infer<typeof dispatchStatusSchema>, z.infer<typeof dispatchStatusSchema>[]> = {
  unassigned: ["assigned_not_dispatched", "cancelled"],
  assigned_not_dispatched: ["dispatched", "driver_no_show", "cancelled"],
  dispatched: ["in_transit", "driver_no_show", "driver_walkoff", "cancelled"],
  in_transit: ["delivered_pending_docs", "abandoned", "driver_walkoff", "cancelled"],
  delivered_pending_docs: ["completed_docs_received", "cancelled"],
  completed_docs_received: [],
  cancelled: [],
  abandoned: [],
  driver_walkoff: [],
  driver_no_show: [],
};

export async function registerDispatchLoadRoutes(app: FastifyInstance) {
  app.post("/api/v1/dispatch/loads/reserve-id", async (req, reply) => {
    const authUser = currentAuthUser(req, reply);
    if (!authUser) return;
    if (!["Owner", "Administrator", "Manager", "Dispatcher"].includes(authUser.role)) {
      return reply.code(403).send({ error: "forbidden" });
    }
    const body = reserveLoadIdBodySchema.safeParse(req.body ?? {});
    if (!body.success) return sendValidationError(reply, body.error);

    const payload = await withCompanyScope(authUser.uuid, body.data.operating_company_id, async (client) => {
      return reserveNextLoadId(client, {
        operatingCompanyId: body.data.operating_company_id,
        reservedByUserId: authUser.uuid,
      });
    });
    return {
      reservation_uuid: payload.reservationId,
      load_number: payload.loadNumber,
      reserved_until: payload.reservedUntilIso,
      ttl_seconds: payload.ttlSeconds,
    };
  });

  app.delete("/api/v1/dispatch/loads/reserve-id/:reservation_uuid", async (req, reply) => {
    const authUser = currentAuthUser(req, reply);
    if (!authUser) return;
    if (!["Owner", "Administrator", "Manager", "Dispatcher"].includes(authUser.role)) {
      return reply.code(403).send({ error: "forbidden" });
    }
    const params = dispatchLoadReservationParamsSchema.safeParse(req.params ?? {});
    if (!params.success) return sendValidationError(reply, params.error);
    const q = z.object({ operating_company_id: z.string().uuid() }).safeParse(req.query ?? {});
    if (!q.success) return sendValidationError(reply, q.error);

    const released = await withCompanyScope(authUser.uuid, q.data.operating_company_id, async (client) =>
      cancelLoadIdReservation(client, {
        operatingCompanyId: q.data.operating_company_id,
        reservationId: params.data.reservation_uuid,
        reservedByUserId: authUser.uuid,
      })
    );
    return { released };
  });

  app.post("/api/v1/dispatch/loads/ocr-upload", async (req, reply) => {
    const authUser = currentAuthUser(req, reply);
    if (!authUser) return;
    if (!["Owner", "Administrator", "Manager", "Dispatcher"].includes(authUser.role)) {
      return reply.code(403).send({ error: "forbidden" });
    }
    if (!isR2Configured()) {
      return reply.code(503).send({ error: "r2_not_configured" });
    }
    let operatingCompanyId = "";
    let buffer: Buffer | null = null;
    let contentType = "application/pdf";
    const parts = req.parts();
    for await (const part of parts) {
      if (part.type === "file") {
        buffer = await part.toBuffer();
        contentType = part.mimetype || contentType;
      } else if (part.type === "field" && part.fieldname === "operating_company_id") {
        operatingCompanyId = String(part.value ?? "").trim();
      }
    }
    const ocParsed = z.string().uuid().safeParse(operatingCompanyId);
    if (!ocParsed.success) return reply.code(400).send({ error: "operating_company_id_required" });
    if (!buffer || buffer.length < 1) return reply.code(400).send({ error: "file_required" });

    const r2Key = `dispatch/ocr/${ocParsed.data}/${randomUUID()}.pdf`;
    try {
      await withCompanyScope(authUser.uuid, ocParsed.data, async () => {
        await putObjectBytes(r2Key, buffer!, contentType);
      });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "";
      if (msg.includes("r2_not_configured")) return reply.code(503).send({ error: "r2_not_configured" });
      throw err;
    }
    return reply.code(201).send({ ocr_source_pdf_r2_key: r2Key });
  });

  app.get("/api/v1/dispatch/preferences", async (req, reply) => {
    const authUser = currentAuthUser(req, reply);
    if (!authUser) return;

    const preferences = await withCurrentUser(authUser.uuid, async (client) => {
      const res = await client.query<{ dispatch_default_view: "home" | "loads" }>(
        `
          SELECT dispatch_default_view
          FROM identity.user_preferences
          WHERE user_id = $1
          LIMIT 1
        `,
        [authUser.uuid]
      );
      return res.rows[0] ?? { dispatch_default_view: "home" as const };
    });
    return preferences;
  });

  app.patch("/api/v1/dispatch/preferences", async (req, reply) => {
    const authUser = currentAuthUser(req, reply);
    if (!authUser) return;
    const body = dispatchPreferenceBodySchema.safeParse(req.body ?? {});
    if (!body.success) return sendValidationError(reply, body.error);

    const updated = await withCurrentUser(authUser.uuid, async (client) => {
      const res = await client.query<{ dispatch_default_view: "home" | "loads" }>(
        `
          INSERT INTO identity.user_preferences (user_id, dispatch_default_view)
          VALUES ($1, $2)
          ON CONFLICT (user_id)
          DO UPDATE SET dispatch_default_view = EXCLUDED.dispatch_default_view
          RETURNING dispatch_default_view
        `,
        [authUser.uuid, body.data.dispatch_default_view]
      );
      return res.rows[0];
    });

    return updated;
  });

  app.get("/api/v1/dispatch/loads", async (req, reply) => {
    const authUser = currentAuthUser(req, reply);
    if (!authUser) return;
    const parsed = listDispatchLoadsQuerySchema.safeParse(req.query ?? {});
    if (!parsed.success) return sendValidationError(reply, parsed.error);
    const query = parsed.data;

    const values: unknown[] = [query.operating_company_id];
    const filters: string[] = [`l.operating_company_id = $1`, `l.soft_deleted_at IS NULL`];
    if (query.status && query.status.length > 0) {
      const mappedStatuses = query.status.map((status) => toMdataStatus(status));
      values.push(mappedStatuses);
      filters.push(`l.status = ANY($${values.length}::mdata.load_status_enum[])`);
    }
    if (query.customer) {
      values.push(query.customer);
      filters.push(`l.customer_id = $${values.length}`);
    }
    if (query.driver) {
      values.push(query.driver);
      filters.push(`(l.assigned_primary_driver_id = $${values.length} OR l.assigned_secondary_driver_id = $${values.length})`);
    }
    if (query.from) {
      values.push(query.from);
      filters.push(`sp.scheduled_arrival_at::date >= $${values.length}::date`);
    }
    if (query.to) {
      values.push(query.to);
      filters.push(`sd.scheduled_arrival_at::date <= $${values.length}::date`);
    }
    if (query.search) {
      values.push(`%${query.search}%`);
      const idx = values.length;
      filters.push(
        `(l.load_number ILIKE $${idx} OR c.customer_name ILIKE $${idx} OR COALESCE(sp.city, '') ILIKE $${idx} OR COALESCE(sd.city, '') ILIKE $${idx})`
      );
    }

    const whereClause = `WHERE ${filters.join(" AND ")}`;

    const payload = await withCompanyScope(authUser.uuid, query.operating_company_id, async (client) => {
      const countRes = await client.query<{ total: number }>(
        `
          SELECT count(*)::int AS total
          FROM views.dispatch_load_with_driver_status l
          JOIN mdata.customers c ON c.id = l.customer_id
          LEFT JOIN LATERAL (
            SELECT city, state, scheduled_arrival_at
            FROM mdata.load_stops
            WHERE load_id = l.id AND stop_type = 'pickup'
            ORDER BY sequence_number ASC
            LIMIT 1
          ) sp ON true
          LEFT JOIN LATERAL (
            SELECT city, state, scheduled_arrival_at
            FROM mdata.load_stops
            WHERE load_id = l.id AND stop_type = 'delivery'
            ORDER BY sequence_number DESC
            LIMIT 1
          ) sd ON true
          ${whereClause}
        `,
        values
      );

      values.push(query.limit);
      values.push(query.offset);
      const limitIdx = values.length - 1;
      const offsetIdx = values.length;

      const rowsRes = await client.query(
        `
          SELECT
            l.*,
            c.customer_name,
            u.unit_number,
            tr.unit_number AS trailer_number,
            CASE WHEN d.id IS NULL THEN NULL ELSE CONCAT(LEFT(d.first_name, 1), '. ', d.last_name) END AS driver_short_name,
            COALESCE(uds.has_open_pm_due_wo, false) AS has_open_pm_due_wo,
            COALESCE(uds.is_dispatch_blocked, false) AS is_dispatch_blocked,
            uds.dispatch_block_reason,
            COALESCE(uds.open_wo_count, 0) AS open_wo_count,
            dhs.hos_badge_color,
            COALESCE(dhs.is_in_violation, false) AS hos_is_in_violation,
            COALESCE(dhs.minutes_until_violation, 9999) AS hos_minutes_until_violation,
            sp.city AS pickup_city,
            sp.state AS pickup_state,
            sd.city AS delivery_city,
            sd.state AS delivery_state
          FROM views.dispatch_load_with_driver_status l
          JOIN mdata.customers c ON c.id = l.customer_id
          LEFT JOIN mdata.units u ON u.id = l.assigned_unit_id
          LEFT JOIN mdata.units tr ON tr.id = l.assigned_secondary_driver_id
          LEFT JOIN mdata.drivers d ON d.id = l.assigned_primary_driver_id
          LEFT JOIN views.units_with_dispatch_status uds ON uds.id = l.assigned_unit_id
          LEFT JOIN views.drivers_with_hos_status dhs ON dhs.id = l.assigned_primary_driver_id
          LEFT JOIN LATERAL (
            SELECT city, state, scheduled_arrival_at
            FROM mdata.load_stops
            WHERE load_id = l.id AND stop_type = 'pickup'
            ORDER BY sequence_number ASC
            LIMIT 1
          ) sp ON true
          LEFT JOIN LATERAL (
            SELECT city, state, scheduled_arrival_at
            FROM mdata.load_stops
            WHERE load_id = l.id AND stop_type = 'delivery'
            ORDER BY sequence_number DESC
            LIMIT 1
          ) sd ON true
          ${whereClause}
          ORDER BY sp.scheduled_arrival_at NULLS LAST, l.created_at DESC
          LIMIT $${limitIdx}
          OFFSET $${offsetIdx}
        `,
        values
      );

      return { rows: rowsRes.rows, total: Number(countRes.rows[0]?.total ?? 0) };
    });

    return {
      loads: payload.rows.map((row) => ({
        ...row,
        dispatch_status: fromMdataStatus(String(row.status)),
      })),
      total_count: payload.total,
      has_more: query.offset + query.limit < payload.total,
    };
  });

  app.get("/api/v1/dispatch/loads/:id", async (req, reply) => {
    const authUser = currentAuthUser(req, reply);
    if (!authUser) return;
    const params = dispatchLoadIdParamsSchema.safeParse(req.params ?? {});
    if (!params.success) return sendValidationError(reply, params.error);

    const operatingCompanyId = String((req.query as Record<string, unknown> | undefined)?.["operating_company_id"] ?? "");
    if (!operatingCompanyId) return reply.code(400).send({ error: "operating_company_id_required" });

    const detail = await withCompanyScope(authUser.uuid, operatingCompanyId, async (client) => {
      // BUGFIX (Block 1, 2026-06-24): the prior W-FIX-3a join `LEFT JOIN mdata.equipment te ON te.id =
      // l.trailer_id` referenced a column that DOES NOT EXIST. mdata.loads (and the dispatch view) have NO
      // trailer_id and NO trailer_type column — verified against the full migration set; the only equipment
      // column on a load is assigned_unit_id (the truck). That non-existent column 500'd every load-detail
      // fetch (42703), which in turn broke the cancel flow (overview 500 → load never leaves the board) and
      // left the Cancelled Kanban column counted-but-empty. There is no persisted trailer↔load link to read,
      // so the trailer fields are honestly NULL ("—"); the response SHAPE is unchanged (both keys present).
      // A real trailer-on-load link (persist a trailer unit/type) is a separate additive feature — flagged.
      //   team-driver name ← assigned_secondary_driver_id → mdata.drivers (persisted, kept).
      // Driver pay rate is NOT a load-persisted value (load-specific rate isn't stored; mdata.driver_pay_rates
      // is effective-dated per-qualification) → intentionally not surfaced here (stays "—"), no fabrication.
      const loadRes = await client.query(
        `
          SELECT l.*, c.customer_name,
                 NULLIF(TRIM(CONCAT(COALESCE(sd.first_name, ''), ' ', COALESCE(sd.last_name, ''))), '') AS assigned_secondary_driver_name,
                 NULL::text AS trailer_equipment_type,
                 NULL::text AS trailer_number
          FROM views.dispatch_load_with_driver_status l
          JOIN mdata.customers c ON c.id = l.customer_id
          LEFT JOIN mdata.drivers sd ON sd.id = l.assigned_secondary_driver_id
          WHERE l.id = $1
            AND l.operating_company_id = $2
          LIMIT 1
        `,
        [params.data.id, operatingCompanyId]
      );
      const load = loadRes.rows[0] ?? null;
      if (!load) return null;

      const stopsRes = await client.query(
        `
          SELECT *
          FROM mdata.load_stops
          WHERE load_id = $1
          ORDER BY sequence_number ASC
        `,
        [params.data.id]
      );
      // Charges are a single rate_total_cents today (no line-item table yet — see the charge-line
      // follow-on block). Reconstruct one LINEHAUL line so the Edit wizard can prefill + round-trip the
      // rate; the follow-on block replaces this with real per-line charges.
      const rateTotal = Number(load.rate_total_cents ?? 0);
      const charges = rateTotal > 0 ? [{ code: "LINEHAUL", amount_cents: rateTotal }] : [];
      return { ...load, stops: stopsRes.rows, charges, drivers: [] };
    });

    if (!detail) return reply.code(404).send({ error: "dispatch_load_not_found" });
    return detail;
  });

  app.post("/api/v1/dispatch/loads/:id/distribute-instructions", async (req, reply) => {
    const authUser = currentAuthUser(req, reply);
    if (!authUser) return;
    if (!["Owner", "Administrator", "Manager", "Dispatcher"].includes(authUser.role)) {
      return reply.code(403).send({ error: "forbidden" });
    }
    const params = dispatchLoadIdParamsSchema.safeParse(req.params ?? {});
    if (!params.success) return sendValidationError(reply, params.error);
    const operatingCompanyId = String((req.query as Record<string, unknown> | undefined)?.["operating_company_id"] ?? "");
    if (!operatingCompanyId) return reply.code(400).send({ error: "operating_company_id_required" });

    try {
      const result = await distributeLoadInstructions({
        operating_company_id: operatingCompanyId,
        load_id: params.data.id,
        requested_by_user_id: authUser.uuid,
      });
      return result;
    } catch (error) {
      if (String((error as Error)?.message ?? "").includes("E_LOAD_NOT_FOUND")) {
        return reply.code(404).send({ error: "dispatch_load_not_found" });
      }
      throw error;
    }
  });

  app.get("/api/v1/dispatch/units/:unit_id/dispatch-status", async (req, reply) => {
    const authUser = currentAuthUser(req, reply);
    if (!authUser) return;
    const params = dispatchUnitIdParamsSchema.safeParse(req.params ?? {});
    if (!params.success) return sendValidationError(reply, params.error);
    const operatingCompanyId = String((req.query as Record<string, unknown> | undefined)?.["operating_company_id"] ?? "");
    if (!operatingCompanyId) return reply.code(400).send({ error: "operating_company_id_required" });

    const row = await withCompanyScope(authUser.uuid, operatingCompanyId, async (client) => {
      const res = await client
        .query(
          `
            SELECT id, display_id, is_dispatch_blocked, dispatch_block_reason, has_open_pm_due_wo, open_wo_count
            FROM views.units_with_dispatch_status
            WHERE id = $1
              AND operating_company_id = $2
            LIMIT 1
          `,
          [params.data.unit_id, operatingCompanyId]
        )
        .catch(() => ({ rows: [] as Record<string, unknown>[] }));
      return res.rows[0] ?? null;
    });

    if (!row) return reply.code(404).send({ error: "unit_not_found" });
    return {
      unit_id: row.id,
      unit_display_id: row.display_id,
      is_blocked: Boolean(row.is_dispatch_blocked),
      block_reason: row.dispatch_block_reason,
      has_pm_due: Boolean(row.has_open_pm_due_wo),
      open_wo_count: Number(row.open_wo_count ?? 0),
    };
  });

  app.get("/api/v1/dispatch/units/:unit_id/insurance-status", async (req, reply) => {
    const authUser = currentAuthUser(req, reply);
    if (!authUser) return;
    const params = dispatchUnitIdParamsSchema.safeParse(req.params ?? {});
    if (!params.success) return sendValidationError(reply, params.error);
    const query = dispatchUnitInsuranceQuerySchema.safeParse(req.query ?? {});
    if (!query.success) return sendValidationError(reply, query.error);

    const payload = await withCompanyScope(authUser.uuid, query.data.operating_company_id, async (client) => {
      const coverage = await detectAssetCoverageGap(client, {
        operatingCompanyId: query.data.operating_company_id,
        assetId: params.data.unit_id,
        asOfDate: query.data.as_of_date,
      });
      return coverage;
    });

    if (!payload.asset_exists) return reply.code(404).send({ error: "unit_not_found" });
    return {
      unit_id: params.data.unit_id,
      is_dispatch_eligible: payload.is_covered,
      block_code: payload.is_covered ? null : "E_UNIT_INSURANCE_COVERAGE_GAP",
      ...payload,
    };
  });

  app.get("/api/v1/dispatch/drivers/:driver_id/hos-status", async (req, reply) => {
    const authUser = currentAuthUser(req, reply);
    if (!authUser) return;
    const params = dispatchDriverIdParamsSchema.safeParse(req.params ?? {});
    if (!params.success) return sendValidationError(reply, params.error);
    const operatingCompanyId = String((req.query as Record<string, unknown> | undefined)?.["operating_company_id"] ?? "");
    if (!operatingCompanyId) return reply.code(400).send({ error: "operating_company_id_required" });

    const payload = await withCompanyScope(authUser.uuid, operatingCompanyId, async (client) => {
      const driverRes = await client.query<{ id: string }>(
        `
          SELECT id::text AS id
          FROM mdata.drivers
          WHERE id = $1::uuid
            AND operating_company_id = $2::uuid
          LIMIT 1
        `,
        [params.data.driver_id, operatingCompanyId]
      );
      if (!driverRes.rows[0]) return null;

      const clocks = await getCurrentClocks(client, operatingCompanyId, params.data.driver_id);
      return {
        driver_id: params.data.driver_id,
        drive_remaining_min: clocks.drive_remaining_min,
        window_remaining_min: clocks.window_remaining_min,
        break_remaining_min: clocks.break_remaining_min,
        cycle_remaining_min: clocks.cycle_remaining_min,
        status: clocks.status,
        last_reset_at: clocks.last_reset_at,
      };
    });

    if (!payload) return reply.code(404).send({ error: "driver_not_found" });
    return payload;
  });

  app.get("/api/v1/dispatch/drivers/:driver_id/drug-status", async (req, reply) => {
    const authUser = currentAuthUser(req, reply);
    if (!authUser) return;
    const params = dispatchDriverIdParamsSchema.safeParse(req.params ?? {});
    if (!params.success) return sendValidationError(reply, params.error);
    const operatingCompanyId = String((req.query as Record<string, unknown> | undefined)?.["operating_company_id"] ?? "");
    if (!operatingCompanyId) return reply.code(400).send({ error: "operating_company_id_required" });

    const payload = await withCompanyScope(authUser.uuid, operatingCompanyId, async (client) => {
      const driverRes = await client.query<{ id: string }>(
        `
          SELECT id::text AS id
          FROM mdata.drivers
          WHERE id = $1::uuid
            AND operating_company_id = $2::uuid
          LIMIT 1
        `,
        [params.data.driver_id, operatingCompanyId]
      );
      if (!driverRes.rows[0]) return null;

      const latestTestRes = await client.query<{
        id: string;
        result: string;
        test_type: string;
        test_date: string;
        created_at: string;
      }>(
        `
          SELECT id::text, result::text, test_type, test_date::text, created_at::text
          FROM safety.drug_test
          WHERE operating_company_id = $1
            AND driver_id = $2
            AND voided_at IS NULL
          ORDER BY test_date DESC, created_at DESC
          LIMIT 1
        `,
        [operatingCompanyId, params.data.driver_id]
      );

      const latestPoolRes = await client.query<{
        id: string;
        status: string;
        selection_period: string;
        selected_at: string;
      }>(
        `
          SELECT id::text, status::text, selection_period, selected_at::text
          FROM safety.random_pool
          WHERE operating_company_id = $1
            AND driver_id = $2
            AND voided_at IS NULL
          ORDER BY selected_at DESC, created_at DESC
          LIMIT 1
        `,
        [operatingCompanyId, params.data.driver_id]
      );

      const latestClearinghouseRes = await client.query<{
        id: string;
        query_status: string;
        queried_at: string;
      }>(
        `
          SELECT id::text, query_status::text, queried_at::text
          FROM safety.clearinghouse_query
          WHERE operating_company_id = $1
            AND driver_id = $2
            AND voided_at IS NULL
          ORDER BY queried_at DESC, created_at DESC
          LIMIT 1
        `,
        [operatingCompanyId, params.data.driver_id]
      );

      const latestTest = latestTestRes.rows[0] ?? null;
      const blockedResults = new Set(["positive", "refusal", "adulterated", "substituted"]);
      const isBlocked = latestTest ? blockedResults.has(String(latestTest.result)) : false;
      return {
        driver_id: params.data.driver_id,
        is_blocked: isBlocked,
        block_reason: isBlocked ? `drug_test_${String(latestTest?.result ?? "unknown")}` : null,
        latest_test: latestTest,
        latest_random_pool: latestPoolRes.rows[0] ?? null,
        latest_clearinghouse_query: latestClearinghouseRes.rows[0] ?? null,
      };
    });

    if (!payload) return reply.code(404).send({ error: "driver_not_found" });
    return payload;
  });

  app.post("/api/v1/dispatch/loads", async (req, reply) => {
    const authUser = currentAuthUser(req, reply);
    if (!authUser) return;
    if (!["Owner", "Administrator", "Manager", "Dispatcher"].includes(authUser.role)) {
      return reply.code(403).send({ error: "forbidden" });
    }

    const body = createDispatchLoadBodySchema.safeParse(req.body ?? {});
    if (!body.success) return sendValidationError(reply, body.error);
    try {
      const result = await bookLoad({
        ...body.data,
        requestingUserUuid: authUser.uuid,
        requestingUserRole: authUser.role,
      });

      if (result.kind === "error") {
        return reply.code(result.status).send(result.payload);
      }
      const createdLoadId = String(result.row.id ?? "");
      const createdCompanyId = String(result.row.operating_company_id ?? body.data.operating_company_id);
      if (createdLoadId && createdCompanyId) {
        // Non-blocking hook: load booking response should not wait on geocoding/geofence creation.
        void autoCreateGeofencesForLoad(authUser.uuid, {
          operating_company_id: createdCompanyId,
          load_id: createdLoadId,
        }).catch((err) => {
          req.log.warn({ err, load_id: createdLoadId }, "auto_geofence_post_book_failed");
        });
      }
      const createdLoadIdForSpine = String(result.row.id ?? "");
      const createdCompanyIdForSpine = String(result.row.operating_company_id ?? body.data.operating_company_id);
      if (createdLoadIdForSpine && createdCompanyIdForSpine) {
        void withCurrentUser(authUser.uuid, (client) =>
          emitDispatchSpineEvent(client, {
            operating_company_id: createdCompanyIdForSpine,
            actor_user_id: authUser.uuid,
            event_type: "load.created",
            load_id: createdLoadIdForSpine,
            payload: { load_number: result.row.load_number ?? null },
          })
        ).catch((err) => req.log.warn({ err }, "spine_emit_load_created_failed"));
      }
      return reply.code(201).send(result.row);
    } catch (error) {
      const code = (error as { code?: string }).code;
      if (code === "23505") return reply.code(409).send({ error: "dispatch_load_conflict" });
      if (code === "23503") return reply.code(400).send({ error: "invalid_foreign_key" });
      throw error;
    }
  });

  // Block 06 (Inc 2) — FULL load edit. Money/evidence-guarded: a load behind an open settlement, an
  // issued invoice, or a non-open driver bill is LOCKED (409). Stops are replaced evidence-safely
  // (archive-not-delete). GATED PR — financial-adjacent (edits rate_total_cents). Jorge merges.
  app.patch("/api/v1/dispatch/loads/:id", async (req, reply) => {
    const authUser = currentAuthUser(req, reply);
    if (!authUser) return;
    if (!["Owner", "Administrator", "Manager", "Dispatcher"].includes(authUser.role)) {
      return reply.code(403).send({ error: "forbidden" });
    }
    const params = dispatchLoadIdParamsSchema.safeParse(req.params ?? {});
    if (!params.success) return sendValidationError(reply, params.error);
    const body = updateDispatchLoadBodySchema.safeParse(req.body ?? {});
    if (!body.success) return sendValidationError(reply, body.error);

    const { operating_company_id, charges, stops, ...fields } = body.data;
    try {
      const result = await withCompanyScope(authUser.uuid, operating_company_id, (client) =>
        updateDispatchLoad(client, {
          loadId: params.data.id,
          operatingCompanyId: operating_company_id,
          requestingUserUuid: authUser.uuid,
          fields: fields as UpdateDispatchLoadFields,
          charges,
          stops,
        })
      );
      return reply.send(result);
    } catch (error) {
      if (error instanceof LoadNotFoundError) return reply.code(404).send({ error: "load_not_found" });
      if (error instanceof LoadEditLockedError) {
        return reply.code(409).send({ error: "load_edit_locked", lock: error.lock });
      }
      const code = (error as { code?: string }).code;
      if (code === "23503") return reply.code(400).send({ error: "invalid_foreign_key" });
      if (code === "23505") return reply.code(409).send({ error: "dispatch_load_conflict" });
      throw error;
    }
  });

  app.patch("/api/v1/dispatch/loads/:id/anticipated-chargeback", async (req, reply) => {
    const authUser = currentAuthUser(req, reply);
    if (!authUser) return;
    if (!["Owner", "Administrator", "Manager", "Dispatcher"].includes(authUser.role)) {
      return reply.code(403).send({ error: "forbidden" });
    }
    const params = dispatchLoadIdParamsSchema.safeParse(req.params ?? {});
    if (!params.success) return sendValidationError(reply, params.error);
    const body = anticipatedChargebackBodySchema.safeParse(req.body ?? {});
    if (!body.success) return sendValidationError(reply, body.error);

    const updated = await withCompanyScope(authUser.uuid, body.data.operating_company_id, async (client) => {
      const res = await client.query(
        `
          UPDATE mdata.loads
          SET customer_chargeback_requested = $2,
              customer_chargeback_reason = $3,
              updated_at = now()
          WHERE id = $1
            AND operating_company_id = $4
            AND soft_deleted_at IS NULL
          RETURNING id, customer_chargeback_requested, customer_chargeback_reason
        `,
        [
          params.data.id,
          body.data.customer_chargeback_requested,
          body.data.customer_chargeback_requested ? (body.data.customer_chargeback_reason ?? null) : null,
          body.data.operating_company_id,
        ]
      );
      const row = res.rows[0] ?? null;
      if (row && body.data.customer_chargeback_requested) {
        await appendCrudAudit(
          client,
          authUser.uuid,
          "dispatch.load.anticipated_chargeback_flagged",
          {
            load_uuid: row.id,
            operating_company_id: body.data.operating_company_id,
            customer_chargeback_requested: true,
            customer_chargeback_reason: body.data.customer_chargeback_reason ?? null,
          },
          "info",
          "P6-D2"
        );
        await emitDispatchSpineEvent(client, {
          operating_company_id: body.data.operating_company_id,
          actor_user_id: authUser.uuid,
          event_type: "load.chargeback_flagged",
          load_id: String(row.id),
          payload: { customer_chargeback_reason: body.data.customer_chargeback_reason ?? null },
        });
      }
      return row;
    });

    if (!updated) return reply.code(404).send({ error: "dispatch_load_not_found" });
    return updated;
  });

  app.patch("/api/v1/dispatch/loads/:id/transition", async (req, reply) => {
    const authUser = currentAuthUser(req, reply);
    if (!authUser) return;
    const params = dispatchLoadIdParamsSchema.safeParse(req.params ?? {});
    if (!params.success) return sendValidationError(reply, params.error);
    const body = transitionBodySchema.safeParse(req.body ?? {});
    if (!body.success) return sendValidationError(reply, body.error);

    const operatingCompanyId = String((req.query as Record<string, unknown> | undefined)?.["operating_company_id"] ?? "");
    if (!operatingCompanyId) return reply.code(400).send({ error: "operating_company_id_required" });

    const result = await withCompanyScope(authUser.uuid, operatingCompanyId, async (client) => {
      const currentRes = await client.query<{ status: string }>(
        `
          SELECT status
          FROM mdata.loads
          WHERE id = $1
            AND operating_company_id = $2
            AND soft_deleted_at IS NULL
          LIMIT 1
        `,
        [params.data.id, operatingCompanyId]
      );
      const current = currentRes.rows[0] ?? null;
      if (!current) return { error: "not_found" as const };
      const currentStatus = fromMdataStatus(current.status);
      const targetStatus = body.data.new_status;
      if (!allowedTransitions[currentStatus].includes(targetStatus)) {
        return { error: "invalid_transition" as const, from: currentStatus, to: targetStatus };
      }

      const mdataStatus = toMdataStatus(targetStatus);
      await client.query(`UPDATE mdata.loads SET status = $2 WHERE id = $1`, [params.data.id, mdataStatus]);
      if (mdataStatus === "abandoned" || mdataStatus === "driver_walkoff" || mdataStatus === "driver_no_show") {
        await emitAutoProposedEscrowEvents({
          client,
          actor_user_id: authUser.uuid,
          operating_company_id: operatingCompanyId,
          load_id: params.data.id,
          load_status: mdataStatus,
        });
      }

      try {
        await pingSettlementOnLoadEvent(client, {
          loadId: params.data.id,
          operatingCompanyId,
          dispatchTargetStatus: targetStatus,
          actorUserId: authUser.uuid,
        });
      } catch (err) {
        console.warn({ err }, "dispatch_load_settlement_ping_failed");
      }
      await emitDispatchSpineEvent(client, {
        operating_company_id: operatingCompanyId,
        actor_user_id: authUser.uuid,
        event_type: "load.status_changed",
        load_id: params.data.id,
        payload: { from_status: currentStatus, to_status: targetStatus },
      });
      return { ok: true as const, status: targetStatus };
    });

    if ("error" in result) {
      if (result.error === "not_found") return reply.code(404).send({ error: "dispatch_load_not_found" });
      return reply.code(400).send({ error: "invalid_transition", from_status: result.from, to_status: result.to });
    }
    if (result.ok && body.data.new_status === "abandoned") {
      void notifyAbandonedLoadStakeholders({
        operatingCompanyId,
        loadId: params.data.id,
        actorUserId: authUser.uuid,
      }).catch(() => undefined);
    }
    return result;
  });

  app.get("/api/v1/dispatch/dashboard", async (req, reply) => {
    const authUser = currentAuthUser(req, reply);
    if (!authUser) return;
    const operatingCompanyId = String((req.query as Record<string, unknown> | undefined)?.["operating_company_id"] ?? "");
    if (!operatingCompanyId) return reply.code(400).send({ error: "operating_company_id_required" });

    const metrics = await withCompanyScope(authUser.uuid, operatingCompanyId, async (client) => {
      const [activeLoads, inTransit, dispatchedRes, deliveredRes, projectedRes] = await Promise.all([
        countActiveDispatchLoads(client, operatingCompanyId),
        countInTransitDispatchLoads(client, operatingCompanyId),
        client.query<{ count: number }>(
          `
            SELECT count(*)::int AS count
            FROM mdata.loads
            WHERE operating_company_id = $1
              AND soft_deleted_at IS NULL
              AND status IN ('dispatched'::mdata.load_status_enum, 'in_transit'::mdata.load_status_enum)
          `,
          [operatingCompanyId]
        ),
        client.query<{ count: number }>(
          `
            SELECT count(*)::int AS count
            FROM mdata.loads
            WHERE operating_company_id = $1
              AND soft_deleted_at IS NULL
              AND status = 'delivered_pending_docs'::mdata.load_status_enum
          `,
          [operatingCompanyId]
        ),
        client.query<{ amount: number }>(
          `
            SELECT COALESCE(sum(rate_total_cents), 0)::bigint AS amount
            FROM mdata.loads
            WHERE operating_company_id = $1
              AND date_trunc('week', created_at) = date_trunc('week', now())
              AND soft_deleted_at IS NULL
          `,
          [operatingCompanyId]
        ),
      ]);
      return {
        active_loads: activeLoads,
        dispatched: Number(dispatchedRes.rows[0]?.count ?? 0),
        need_load: 0,
        delivered: Number(deliveredRes.rows[0]?.count ?? 0),
        in_transit: inTransit,
        proj_inv_wk_cents: Number(projectedRes.rows[0]?.amount ?? 0),
        deadhead_pct: 0,
        mpg: 0,
      };
    });

    return metrics;
  });

  app.get("/api/v1/dispatch/units-without-load", async (req, reply) => {
    const authUser = currentAuthUser(req, reply);
    if (!authUser) return;
    const operatingCompanyId = String((req.query as Record<string, unknown> | undefined)?.["operating_company_id"] ?? "");
    if (!operatingCompanyId) return reply.code(400).send({ error: "operating_company_id_required" });

    const rows = await withCompanyScope(authUser.uuid, operatingCompanyId, async (client) => {
      const res = await client.query(
        `
          SELECT
            u.id,
            u.unit_number,
            NULL::text AS trailer_number,
            ud.id::text AS driver_id,
            CONCAT_WS(' ', ud.first_name, ud.last_name) AS driver_name,
            MAX(ls.actual_departure_at) AS last_drop_at,
            -- LIVE location for EVERY unit (Jorge: show it whether dispatched or not). Reverse-geo'd
            -- city/state come from the Samsara stats ingest via telematics.vehicle_latest_position
            -- (the same source that powers the fleet board) — NOT positions/latest, which lacks city/state.
            p.city AS location_city,
            p.state AS location_state,
            p.formatted_location AS location_formatted,
            p.lat::float8 AS location_lat,
            p.lng::float8 AS location_lng,
            p.captured_at::text AS location_captured_at
          FROM mdata.units u
          LEFT JOIN mdata.loads l
            ON l.assigned_unit_id = u.id
            AND l.soft_deleted_at IS NULL
            AND l.status IN (
              'assigned_not_dispatched'::mdata.load_status_enum,
              'dispatched'::mdata.load_status_enum,
              'in_transit'::mdata.load_status_enum,
              'delivered_pending_docs'::mdata.load_status_enum
            )
          -- The unit's DEFAULT driver (mdata.units.assigned_driver_id), so awaiting-truck rows can
          -- show Driver + HOS even with no load. (The old join used the load's driver, which is
          -- null for an unloaded truck.)
          LEFT JOIN mdata.drivers ud ON ud.id = u.assigned_driver_id
          LEFT JOIN mdata.load_stops ls ON ls.load_id = l.id
          LEFT JOIN telematics.vehicle_latest_position p
            ON p.unit_id = u.id
            AND p.operating_company_id = COALESCE(u.currently_leased_to_company_id, u.owner_company_id)
          WHERE u.deactivated_at IS NULL
            -- Entity scope (USMCA cross-entity leak fix): mdata.units has no operating_company_id and
            -- its RLS is identity/role-scoped, so the GUC alone does not filter units. Scope by the
            -- owner/leased pair so another entity's trucks never appear in this dispatcher picker.
            AND (u.owner_company_id = $1 OR u.currently_leased_to_company_id = $1)
            -- ACTIVE trucks only. Excludes Sold/Totaled (some are not deactivated_at — a known
            -- active/inactive desync that inflated "Awaiting assignment" to ~49 vs ~32 active) and
            -- OutOfService/InMaintenance (those belong to the In-shop / Fleet-OOS surfaces, not Awaiting).
            AND u.status = 'InService'::mdata.unit_status
            AND l.id IS NULL
          GROUP BY u.id, u.unit_number, ud.id, ud.first_name, ud.last_name,
            p.city, p.state, p.formatted_location, p.lat, p.lng, p.captured_at
          ORDER BY COALESCE(MAX(ls.actual_departure_at), now() - interval '999 days') ASC
        `,
        [operatingCompanyId]
      );
      // Live-location is older than this -> show the gold "stale" dot (Samsara positions poll every ~5 min;
      // >10 min = a couple of missed polls). The "as of HH:MM CT" timestamp always renders when a fix exists.
      const LOC_STALE_MIN = 10;
      return res.rows.map((row) => {
        const capUtc = (row.location_captured_at as string | null) ?? null;
        const capMs = capUtc ? new Date(capUtc).getTime() : NaN;
        const minsAgo = Number.isNaN(capMs) ? null : Math.floor((Date.now() - capMs) / 60000);
        return {
          id: row.id,
          unit_number: row.unit_number,
          trailer_number: row.trailer_number,
          driver_id: row.driver_id,
          driver_name: row.driver_name,
          last_drop_at: row.last_drop_at,
          hours_since_last_delivery: row.last_drop_at ? Math.floor((Date.now() - new Date(row.last_drop_at as string).getTime()) / 3600000) : null,
          // Live location is independent of load state — present whenever Samsara has a recent fix for the unit.
          location: capUtc
            ? {
                city: (row.location_city as string | null) ?? null,
                state: (row.location_state as string | null) ?? null,
                formatted: (row.location_formatted as string | null) ?? null,
                lat: (row.location_lat as number | null) ?? null,
                lng: (row.location_lng as number | null) ?? null,
                captured_at_utc: capUtc,
                captured_at_ct: `${new Date(capUtc).toLocaleString("en-US", { timeZone: "America/Chicago", hour: "2-digit", minute: "2-digit", hour12: false })} CT`,
                minutes_ago: minsAgo,
                stale: minsAgo != null && minsAgo > LOC_STALE_MIN,
              }
            : null,
        };
      });
    });
    return { units: rows };
  });

  app.get("/api/v1/dispatch/loads/:id/driver-status", async (req, reply) => {
    const authUser = currentAuthUser(req, reply);
    if (!authUser) return;
    const params = dispatchLoadIdParamsSchema.safeParse(req.params ?? {});
    if (!params.success) return sendValidationError(reply, params.error);
    const operatingCompanyId = String((req.query as Record<string, unknown> | undefined)?.["operating_company_id"] ?? "");
    if (!operatingCompanyId) return reply.code(400).send({ error: "operating_company_id_required" });

    const row = await withCompanyScope(authUser.uuid, operatingCompanyId, async (client) => {
      const res = await client.query(
        `
          SELECT
            l.id,
            l.driver_lifecycle_stage,
            l.latest_eta_prediction
          FROM views.dispatch_load_with_driver_status l
          WHERE l.id = $1
            AND l.operating_company_id = $2
          LIMIT 1
        `,
        [params.data.id, operatingCompanyId]
      );
      return res.rows[0] ?? null;
    });

    if (!row) return reply.code(404).send({ error: "dispatch_load_not_found" });
    return {
      load_id: row.id,
      current_stage: row.driver_lifecycle_stage,
      eta: row.latest_eta_prediction,
      timeline: [
        { stage: row.driver_lifecycle_stage, at: new Date().toISOString(), source: "phase3_stub" },
      ],
    };
  });
}
