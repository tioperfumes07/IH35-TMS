import type { FastifyInstance, FastifyReply } from "fastify";
import { z } from "zod";
import { appendCrudAudit } from "../audit/crud-audit.js";
import { withCurrentUser } from "../auth/db.js";
import { requireDriverSession } from "./auth.js";

type LoadLifecycleStage =
  | "pre_trip"
  | "en_route_pickup"
  | "at_shipper"
  | "loading"
  | "loaded"
  | "en_route_delivery"
  | "at_receiver"
  | "unloading"
  | "unloaded"
  | "detention"
  | "hos_break"
  | "off_duty"
  | "accident"
  | "breakdown"
  | "no_gps";
type StopType = "pickup" | "delivery" | "fuel" | "break";
type StopStatus = "pending" | "arrived" | "loading" | "loaded" | "departed";
type DriverStop = {
  id: string;
  sequence: number;
  type: StopType;
  location_name: string;
  address: string;
  city: string;
  state: string;
  lat: number;
  lng: number;
  geofence_radius_m: number;
  scheduled_arrival_at: string;
  scheduled_departure_at: string;
  actual_arrival_at: string | null;
  actual_departure_at: string | null;
  status: StopStatus;
  notes: string | null;
};
type DriverLoad = {
  id: string;
  display_id: string;
  customer_name: string;
  pickup_location: string;
  delivery_location: string;
  pickup_at: string;
  delivery_at: string;
  miles: number;
  rate_cents: number;
  equipment: string;
  dispatcher_name: string;
  dispatcher_phone: string | null;
  lifecycle_stage: LoadLifecycleStage;
  current_stop_index: number;
  stops: DriverStop[];
  accepted_at: string | null;
  rate_confirmation_html: string;
};
type AcceptanceRequest = {
  load_id: string;
  signature_data_url: string;
  geo_lat: number;
  geo_lng: number;
  geo_accuracy_m: number;
  scroll_completed: boolean;
  accepted_at: string;
};

const loadIdParamsSchema = z.object({
  id: z.string().uuid(),
});

const stopParamsSchema = z.object({
  id: z.string().uuid(),
  stopId: z.string().uuid(),
});

const geoBodySchema = z.object({
  geo_lat: z.number(),
  geo_lng: z.number(),
  geo_accuracy_m: z.number().nonnegative(),
});

const acceptanceBodySchema = z.object({
  signature_data_url: z.string().min(1),
  geo_lat: z.number(),
  geo_lng: z.number(),
  geo_accuracy_m: z.number().nonnegative(),
  scroll_completed: z.literal(true),
  accepted_at: z.string().datetime({ offset: true }),
});

function sendValidationError(reply: FastifyReply, error: z.ZodError) {
  return reply.code(400).send({ error: "validation_error", details: error.flatten() });
}

function haversineMiles(lat1: number, lon1: number, lat2: number, lon2: number) {
  const toRad = (value: number) => (value * Math.PI) / 180;
  const earthMiles = 3958.8;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) * Math.sin(dLon / 2);
  return 2 * earthMiles * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function lifecycleFromLoadStatus(status: string): LoadLifecycleStage {
  if (status === "assigned_not_dispatched" || status === "dispatched" || status === "assigned") return "pre_trip";
  if (status === "at_pickup") return "at_shipper";
  if (status === "in_transit") return "en_route_delivery";
  if (status === "at_delivery") return "at_receiver";
  if (status === "delivered" || status === "delivered_pending_docs") return "unloaded";
  if (status === "completed_docs_received" || status === "closed" || status === "paid" || status === "invoiced") return "off_duty";
  if (status === "cancelled" || status === "unassigned") return "off_duty";
  return "off_duty";
}

function normalizeStopType(value: string): StopType {
  if (value === "pickup" || value === "delivery" || value === "fuel") return value;
  return "break";
}

function normalizeStopStatus(value: string): StopStatus {
  if (value === "pending" || value === "arrived" || value === "departed") return value;
  if (value === "loading" || value === "loaded") return value;
  return "pending";
}

function buildRateConfirmationHtml(loadDisplayId: string, customerName: string): string {
  return `<div><h2>Rate Confirmation ${loadDisplayId}</h2><p>Customer: ${customerName}</p><p>Accepted via Driver PWA.</p></div>`;
}

type LoadRow = {
  id: string;
  load_number: string | null;
  status: string;
  rate_total_cents: number | string | null;
  assigned_unit_id: string | null;
  updated_at: string;
  accepted_at: string | null;
  customer_name: string | null;
  dispatcher_name: string | null;
  dispatcher_phone: string | null;
  unit_number: string | null;
};

type StopRow = {
  id: string;
  sequence_number: number;
  stop_type: string;
  address_line1: string | null;
  city: string | null;
  state: string | null;
  scheduled_arrival_at: string | null;
  scheduled_departure_at: string | null;
  actual_arrival_at: string | null;
  actual_departure_at: string | null;
  status: string;
  notes: string | null;
  location_name: string | null;
  latitude: number | null;
  longitude: number | null;
};

function mapLoadRowToDriverLoad(row: LoadRow, stops: DriverStop[]): DriverLoad {
  const pickup = stops.find((stop) => stop.type === "pickup") ?? stops[0];
  const delivery = [...stops].reverse().find((stop) => stop.type === "delivery") ?? stops[stops.length - 1];
  return {
    id: row.id,
    display_id: row.load_number ?? row.id,
    customer_name: row.customer_name ?? "Unknown customer",
    pickup_location: pickup ? `${pickup.city}, ${pickup.state}` : "Unknown",
    delivery_location: delivery ? `${delivery.city}, ${delivery.state}` : "Unknown",
    pickup_at: pickup?.scheduled_arrival_at ?? row.updated_at,
    delivery_at: delivery?.scheduled_arrival_at ?? row.updated_at,
    miles: 0,
    rate_cents: Number(row.rate_total_cents ?? 0),
    equipment: row.unit_number ? `Unit ${row.unit_number}` : "Assigned unit",
    dispatcher_name: row.dispatcher_name ?? "Dispatch",
    dispatcher_phone: row.dispatcher_phone,
    lifecycle_stage: lifecycleFromLoadStatus(row.status),
    current_stop_index: Math.max(0, stops.findIndex((stop) => stop.status !== "departed")),
    stops,
    accepted_at: row.accepted_at,
    rate_confirmation_html: buildRateConfirmationHtml(row.load_number ?? row.id, row.customer_name ?? "Unknown customer"),
  };
}

async function loadStops(client: { query: <R>(sql: string, values?: unknown[]) => Promise<{ rows: R[] }> }, loadId: string): Promise<DriverStop[]> {
  const stopsRes = await client.query<StopRow>(
    `
      SELECT
        s.id,
        s.sequence_number,
        s.stop_type::text,
        s.address_line1,
        s.city,
        s.state,
        s.scheduled_arrival_at,
        s.scheduled_departure_at,
        s.actual_arrival_at,
        s.actual_departure_at,
        s.status::text,
        s.notes,
        loc.location_name,
        loc.latitude,
        loc.longitude
      FROM mdata.load_stops s
      LEFT JOIN mdata.locations loc ON loc.id = s.location_id
      WHERE s.load_id = $1
      ORDER BY s.sequence_number ASC
    `,
    [loadId]
  );

  return stopsRes.rows.map((row) => ({
    id: row.id,
    sequence: Number(row.sequence_number),
    type: normalizeStopType(row.stop_type),
    location_name: row.location_name ?? row.address_line1 ?? "Stop",
    address: row.address_line1 ?? "",
    city: row.city ?? "",
    state: row.state ?? "",
    lat: Number(row.latitude ?? 0),
    lng: Number(row.longitude ?? 0),
    geofence_radius_m: 40233.6,
    scheduled_arrival_at: row.scheduled_arrival_at ?? new Date().toISOString(),
    scheduled_departure_at: row.scheduled_departure_at ?? new Date().toISOString(),
    actual_arrival_at: row.actual_arrival_at,
    actual_departure_at: row.actual_departure_at,
    status: normalizeStopStatus(row.status),
    notes: row.notes,
  }));
}

async function fetchDriverOwnedLoad(client: { query: <R>(sql: string, values?: unknown[]) => Promise<{ rows: R[] }> }, loadId: string, driverId: string) {
  const loadRes = await client.query<LoadRow>(
    `
      SELECT
        l.id,
        l.load_number,
        l.status::text,
        l.rate_total_cents,
        l.assigned_unit_id,
        l.updated_at,
        l.accepted_at,
        c.customer_name,
        concat_ws(' ', iu.first_name, iu.last_name) AS dispatcher_name,
        NULL::text AS dispatcher_phone,
        u.unit_number
      FROM mdata.loads l
      JOIN mdata.customers c ON c.id = l.customer_id
      LEFT JOIN identity.users iu ON iu.id = l.dispatcher_user_id
      LEFT JOIN mdata.units u ON u.id = l.assigned_unit_id
      WHERE l.id = $1
        AND l.soft_deleted_at IS NULL
        AND (l.assigned_primary_driver_id = $2 OR l.assigned_secondary_driver_id = $2)
      LIMIT 1
    `,
    [loadId, driverId]
  );
  return loadRes.rows[0] ?? null;
}

export async function registerDriverLoadsRoutes(app: FastifyInstance) {
  app.get("/api/v1/driver/loads", async (req, reply) => {
    if (!(await requireDriverSession(req, reply))) return;
    const driver = req.driver;
    if (!driver) return;

    const payload = await withCurrentUser(req.user!.uuid, async (client) => {
      const rowsRes = await client.query<LoadRow>(
        `
          SELECT
            l.id,
            l.load_number,
            l.status::text,
            l.rate_total_cents,
            l.assigned_unit_id,
            l.updated_at,
            l.accepted_at,
            c.customer_name,
            concat_ws(' ', iu.first_name, iu.last_name) AS dispatcher_name,
            NULL::text AS dispatcher_phone,
            u.unit_number
          FROM mdata.loads l
          JOIN mdata.customers c ON c.id = l.customer_id
          LEFT JOIN identity.users iu ON iu.id = l.dispatcher_user_id
          LEFT JOIN mdata.units u ON u.id = l.assigned_unit_id
          WHERE l.soft_deleted_at IS NULL
            AND (l.assigned_primary_driver_id = $1 OR l.assigned_secondary_driver_id = $1)
            AND l.status::text <> 'cancelled'
            AND l.status::text <> 'closed'
            AND NOT (l.status::text = 'delivered' AND l.updated_at < now() - interval '24 hours')
          ORDER BY l.updated_at DESC
          LIMIT 100
        `,
        [driver.id]
      );

      const loads: DriverLoad[] = [];
      for (const row of rowsRes.rows) {
        const stops = await loadStops(client, row.id);
        loads.push(mapLoadRowToDriverLoad(row, stops));
      }
      return loads;
    });
    return payload;
  });

  app.get("/api/v1/driver/loads/:id", async (req, reply) => {
    if (!(await requireDriverSession(req, reply))) return;
    const params = loadIdParamsSchema.safeParse(req.params ?? {});
    if (!params.success) return sendValidationError(reply, params.error);
    const driver = req.driver;
    if (!driver) return;

    const payload = await withCurrentUser(req.user!.uuid, async (client) => {
      const row = await fetchDriverOwnedLoad(client, params.data.id, driver.id);
      if (!row) return null;
      const stops = await loadStops(client, row.id);
      return mapLoadRowToDriverLoad(row, stops);
    });

    if (!payload) return reply.code(403).send({ error: "forbidden" });
    return payload;
  });

  app.post("/api/v1/driver/loads/:id/accept", async (req, reply) => {
    if (!(await requireDriverSession(req, reply))) return;
    const params = loadIdParamsSchema.safeParse(req.params ?? {});
    if (!params.success) return sendValidationError(reply, params.error);
    const body = acceptanceBodySchema.safeParse(req.body ?? {});
    if (!body.success) return sendValidationError(reply, body.error);
    const driver = req.driver;
    if (!driver) return;

    const acceptance = await withCurrentUser(req.user!.uuid, async (client) => {
      const load = await fetchDriverOwnedLoad(client, params.data.id, driver.id);
      if (!load) return { error: "forbidden" as const };

      const pickupRes = await client.query<{ latitude: number | null; longitude: number | null }>(
        `
          SELECT loc.latitude, loc.longitude
          FROM mdata.load_stops s
          LEFT JOIN mdata.locations loc ON loc.id = s.location_id
          WHERE s.load_id = $1
            AND s.stop_type = 'pickup'
          ORDER BY s.sequence_number ASC
          LIMIT 1
        `,
        [params.data.id]
      );
      const pickup = pickupRes.rows[0] ?? null;
      if (pickup?.latitude != null && pickup.longitude != null) {
        const distance = haversineMiles(body.data.geo_lat, body.data.geo_lng, Number(pickup.latitude), Number(pickup.longitude));
        if (distance > 25) return { error: "outside_geofence" as const, distance };
      }

      const ackRes = await client.query<{ id: string }>(
        `
          INSERT INTO driver_finance.signed_acknowledgments (
            operating_company_id,
            driver_id,
            load_id,
            acknowledged_at,
            signature_data_url,
            geo_lat,
            geo_lng,
            geo_accuracy_m,
            scroll_completed,
            user_agent
          )
          SELECT
            l.operating_company_id,
            $2,
            l.id,
            $3::timestamptz,
            $4,
            $5,
            $6,
            $7,
            $8,
            $9
          FROM mdata.loads l
          WHERE l.id = $1
          RETURNING id
        `,
        [
          params.data.id,
          driver.id,
          body.data.accepted_at,
          body.data.signature_data_url,
          body.data.geo_lat,
          body.data.geo_lng,
          Math.round(body.data.geo_accuracy_m),
          body.data.scroll_completed,
          req.headers["user-agent"] ?? null,
        ]
      );

      const acceptanceId = ackRes.rows[0]?.id;
      if (!acceptanceId) return { error: "acceptance_insert_failed" as const };

      await client.query(
        `
          UPDATE mdata.loads
          SET accepted_at = now(),
              accepted_by_driver_id = $2
          WHERE id = $1
        `,
        [params.data.id, driver.id]
      );

      await appendCrudAudit(
        client,
        req.user!.uuid,
        "dispatch.load_accepted_by_driver",
        {
          resource_type: "mdata.loads",
          resource_id: params.data.id,
          driver_id: driver.id,
          acceptance_id: acceptanceId,
        },
        "info",
        "WF-051"
      );

      return { acceptance_id: acceptanceId };
    });

    if ("error" in acceptance) {
      if (acceptance.error === "outside_geofence") return reply.code(400).send({ error: "outside_geofence", distance_miles: acceptance.distance });
      if (acceptance.error === "forbidden") return reply.code(403).send({ error: "forbidden" });
      return reply.code(400).send({ error: acceptance.error });
    }
    return acceptance;
  });

  app.post("/api/v1/driver/loads/:id/stops/:stopId/arrive", async (req, reply) => {
    if (!(await requireDriverSession(req, reply))) return;
    const params = stopParamsSchema.safeParse(req.params ?? {});
    if (!params.success) return sendValidationError(reply, params.error);
    const body = geoBodySchema.safeParse(req.body ?? {});
    if (!body.success) return sendValidationError(reply, body.error);
    const driver = req.driver;
    if (!driver) return;

    const updated = await withCurrentUser(req.user!.uuid, async (client) => {
      const stopRes = await client.query<{ id: string; stop_type: string; status: string; latitude: number | null; longitude: number | null }>(
        `
          SELECT s.id, s.stop_type::text, s.status::text, loc.latitude, loc.longitude
          FROM mdata.load_stops s
          JOIN mdata.loads l ON l.id = s.load_id
          LEFT JOIN mdata.locations loc ON loc.id = s.location_id
          WHERE s.id = $1
            AND s.load_id = $2
            AND (l.assigned_primary_driver_id = $3 OR l.assigned_secondary_driver_id = $3)
            AND l.soft_deleted_at IS NULL
          LIMIT 1
        `,
        [params.data.stopId, params.data.id, driver.id]
      );
      const stop = stopRes.rows[0] ?? null;
      if (!stop) return { error: "forbidden" as const };

      if (stop.latitude != null && stop.longitude != null) {
        const distance = haversineMiles(body.data.geo_lat, body.data.geo_lng, Number(stop.latitude), Number(stop.longitude));
        if (distance > 25) return { error: "outside_geofence" as const, distance };
      }

      await client.query(
        `
          UPDATE mdata.load_stops
          SET actual_arrival_at = now(),
              status = 'arrived'
          WHERE id = $1
        `,
        [params.data.stopId]
      );

      const nextLoadStatus = stop.stop_type === "pickup" ? "at_pickup" : "at_delivery";
      await client.query(`UPDATE mdata.loads SET status = $2 WHERE id = $1`, [params.data.id, nextLoadStatus]);
      return { lifecycle_stage: lifecycleFromLoadStatus(nextLoadStatus) };
    });

    if ("error" in updated) {
      if (updated.error === "outside_geofence") return reply.code(400).send({ error: "outside_geofence", distance_miles: updated.distance });
      return reply.code(403).send({ error: "forbidden" });
    }
    return updated;
  });

  app.post("/api/v1/driver/loads/:id/stops/:stopId/depart", async (req, reply) => {
    if (!(await requireDriverSession(req, reply))) return;
    const params = stopParamsSchema.safeParse(req.params ?? {});
    if (!params.success) return sendValidationError(reply, params.error);
    const body = geoBodySchema.safeParse(req.body ?? {});
    if (!body.success) return sendValidationError(reply, body.error);
    const driver = req.driver;
    if (!driver) return;

    const updated = await withCurrentUser(req.user!.uuid, async (client) => {
      const stopRes = await client.query<{ id: string; stop_type: string; status: string; latitude: number | null; longitude: number | null; sequence_number: number }>(
        `
          SELECT s.id, s.stop_type::text, s.status::text, loc.latitude, loc.longitude, s.sequence_number
          FROM mdata.load_stops s
          JOIN mdata.loads l ON l.id = s.load_id
          LEFT JOIN mdata.locations loc ON loc.id = s.location_id
          WHERE s.id = $1
            AND s.load_id = $2
            AND (l.assigned_primary_driver_id = $3 OR l.assigned_secondary_driver_id = $3)
            AND l.soft_deleted_at IS NULL
          LIMIT 1
        `,
        [params.data.stopId, params.data.id, driver.id]
      );
      const stop = stopRes.rows[0] ?? null;
      if (!stop) return { error: "forbidden" as const };
      if (!["arrived", "loaded", "unloaded"].includes(stop.status)) return { error: "invalid_stop_state" as const };

      if (stop.latitude != null && stop.longitude != null) {
        const distance = haversineMiles(body.data.geo_lat, body.data.geo_lng, Number(stop.latitude), Number(stop.longitude));
        if (distance > 25) return { error: "outside_geofence" as const, distance };
      }

      await client.query(
        `
          UPDATE mdata.load_stops
          SET actual_departure_at = now(),
              status = 'departed'
          WHERE id = $1
        `,
        [params.data.stopId]
      );

      const isDelivery = stop.stop_type === "delivery";
      const nextLoadStatus = isDelivery ? "delivered_pending_docs" : "in_transit";
      await client.query(`UPDATE mdata.loads SET status = $2 WHERE id = $1`, [params.data.id, nextLoadStatus]);
      return { lifecycle_stage: lifecycleFromLoadStatus(nextLoadStatus) };
    });

    if ("error" in updated) {
      if (updated.error === "outside_geofence") return reply.code(400).send({ error: "outside_geofence", distance_miles: updated.distance });
      if (updated.error === "invalid_stop_state") return reply.code(400).send({ error: "invalid_stop_state" });
      return reply.code(403).send({ error: "forbidden" });
    }
    return updated;
  });
}
