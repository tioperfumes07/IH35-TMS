/**
 * GAP-34 — Driver PWA dispatch view routes
 *
 * GET  /api/dispatch/driver-pwa/load/:uuid/dispatch-view
 * POST /api/dispatch/driver-pwa/load/:uuid/stops/:stop_uuid/arrival
 * POST /api/dispatch/driver-pwa/load/:uuid/stops/:stop_uuid/departure
 * POST /api/dispatch/driver-pwa/load/:uuid/stops/:stop_uuid/document
 */

import type { FastifyInstance, FastifyReply } from "fastify";
import { z } from "zod";
import { appendCrudAudit } from "../../audit/crud-audit.js";
import { withCurrentUser } from "../../auth/db.js";
import { requireDriverSession } from "../../driver/auth.js";

type StopType = "pickup" | "delivery" | "fuel" | "break";
type StopStatus = "pending" | "arrived" | "loading" | "loaded" | "departed";
type GeofenceStatus = "pending" | "entered" | "exited";

export type DispatchViewStop = {
  stop_uuid: string;
  sequence: number;
  type: StopType;
  location_name: string;
  address: string;
  city: string;
  state: string;
  lat: number;
  lng: number;
  scheduled_arrival_at: string;
  scheduled_departure_at: string;
  actual_arrival_at: string | null;
  actual_departure_at: string | null;
  status: StopStatus;
  contact_name: string | null;
  contact_phone: string | null;
  hours: string | null;
  dispatcher_notes: string | null;
  doc_requirements: string[];
  geofence_status: GeofenceStatus;
  docs_uploaded: boolean;
};

export type DispatchViewPayload = {
  load_uuid: string;
  load_number: string;
  customer_name: string;
  status: string;
  pickup_contact: { name: string | null; phone: string | null };
  delivery_contact: { name: string | null; phone: string | null };
  special_instructions: string | null;
  stops: DispatchViewStop[];
};

const loadParamsSchema = z.object({ uuid: z.string().uuid() });
const stopParamsSchema = z.object({ uuid: z.string().uuid(), stop_uuid: z.string().uuid() });

const geoBodySchema = z.object({
  geo_lat: z.number(),
  geo_lng: z.number(),
  geo_accuracy_m: z.number().nonnegative(),
});

const documentBodySchema = z.object({
  evidence_uuid: z.string().uuid(),
  doc_type: z.enum(["bol", "pod", "lumper_receipt", "other"]),
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

function normalizeStopType(value: string): StopType {
  if (value === "pickup" || value === "delivery" || value === "fuel") return value;
  return "break";
}

function normalizeStopStatus(value: string): StopStatus {
  if (value === "pending" || value === "arrived" || value === "departed") return value;
  if (value === "loading" || value === "loaded") return value;
  return "pending";
}

function docRequirementsForStop(stopType: StopType): string[] {
  if (stopType === "pickup") return ["bol"];
  if (stopType === "delivery") return ["pod", "lumper_receipt"];
  return [];
}

function geofenceStatusFromStop(status: StopStatus): GeofenceStatus {
  if (status === "departed") return "exited";
  if (status === "arrived" || status === "loading" || status === "loaded") return "entered";
  return "pending";
}

type LoadRow = {
  id: string;
  load_number: string | null;
  status: string;
  customer_name: string | null;
  special_instructions: string | null;
  pickup_contact_name: string | null;
  pickup_contact_phone: string | null;
  delivery_contact_name: string | null;
  delivery_contact_phone: string | null;
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
  contact_name: string | null;
  contact_phone: string | null;
  hours: string | null;
  docs_uploaded: boolean;
};

async function fetchDriverOwnedLoad(
  client: { query: <R>(sql: string, values?: unknown[]) => Promise<{ rows: R[] }> },
  loadId: string,
  driverId: string
) {
  const loadRes = await client.query<LoadRow>(
    `
      SELECT
        l.id,
        l.load_number,
        l.status::text,
        c.customer_name,
        NULL::text AS special_instructions,
        pickup.site_contact_name AS pickup_contact_name,
        pickup.site_contact_phone AS pickup_contact_phone,
        delivery.site_contact_name AS delivery_contact_name,
        delivery.site_contact_phone AS delivery_contact_phone
      FROM mdata.loads l
      JOIN mdata.customers c ON c.id = l.customer_id
      LEFT JOIN LATERAL (
        SELECT s.site_contact_name, s.site_contact_phone
        FROM mdata.load_stops s
        WHERE s.load_id = l.id AND s.stop_type = 'pickup'
        ORDER BY s.sequence_number ASC
        LIMIT 1
      ) pickup ON true
      LEFT JOIN LATERAL (
        SELECT s.site_contact_name, s.site_contact_phone
        FROM mdata.load_stops s
        WHERE s.load_id = l.id AND s.stop_type = 'delivery'
        ORDER BY s.sequence_number DESC
        LIMIT 1
      ) delivery ON true
      WHERE l.id = $1
        AND l.soft_deleted_at IS NULL
        AND (l.assigned_primary_driver_id = $2 OR l.assigned_secondary_driver_id = $2)
      LIMIT 1
    `,
    [loadId, driverId]
  );
  return loadRes.rows[0] ?? null;
}

async function loadDispatchStops(
  client: { query: <R>(sql: string, values?: unknown[]) => Promise<{ rows: R[] }> },
  loadId: string
): Promise<DispatchViewStop[]> {
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
        loc.longitude,
        s.site_contact_name AS contact_name,
        s.site_contact_phone AS contact_phone,
        loc.hours_of_operation AS hours,
        EXISTS (
          SELECT 1
          FROM dispatch.pod_documents p
          WHERE p.stop_id = s.id
            AND p.archived_at IS NULL
        ) AS docs_uploaded
      FROM mdata.load_stops s
      LEFT JOIN mdata.locations loc ON loc.id = s.location_id
      WHERE s.load_id = $1
      ORDER BY s.sequence_number ASC
    `,
    [loadId]
  );

  return stopsRes.rows.map((row) => {
    const type = normalizeStopType(row.stop_type);
    const status = normalizeStopStatus(row.status);
    return {
      stop_uuid: row.id,
      sequence: Number(row.sequence_number),
      type,
      location_name: row.location_name ?? row.address_line1 ?? "Stop",
      address: row.address_line1 ?? "",
      city: row.city ?? "",
      state: row.state ?? "",
      lat: Number(row.latitude ?? 0),
      lng: Number(row.longitude ?? 0),
      scheduled_arrival_at: row.scheduled_arrival_at ?? new Date().toISOString(),
      scheduled_departure_at: row.scheduled_departure_at ?? new Date().toISOString(),
      actual_arrival_at: row.actual_arrival_at,
      actual_departure_at: row.actual_departure_at,
      status,
      contact_name: row.contact_name,
      contact_phone: row.contact_phone,
      hours: row.hours,
      dispatcher_notes: row.notes,
      doc_requirements: docRequirementsForStop(type),
      geofence_status: geofenceStatusFromStop(status),
      docs_uploaded: Boolean(row.docs_uploaded),
    };
  });
}

export function buildDispatchViewPayload(load: LoadRow, stops: DispatchViewStop[]): DispatchViewPayload {
  return {
    load_uuid: load.id,
    load_number: load.load_number ?? load.id,
    customer_name: load.customer_name ?? "Unknown customer",
    status: load.status,
    pickup_contact: {
      name: load.pickup_contact_name,
      phone: load.pickup_contact_phone,
    },
    delivery_contact: {
      name: load.delivery_contact_name,
      phone: load.delivery_contact_phone,
    },
    special_instructions: load.special_instructions,
    stops,
  };
}

export async function registerDispatchViewRoutes(app: FastifyInstance) {
  app.get("/api/dispatch/driver-pwa/load/:uuid/dispatch-view", async (req, reply) => {
    if (!(await requireDriverSession(req, reply))) return;
    const params = loadParamsSchema.safeParse(req.params ?? {});
    if (!params.success) return sendValidationError(reply, params.error);
    const driver = req.driver;
    if (!driver) return;

    const payload = await withCurrentUser(req.user!.uuid, async (client) => {
      const load = await fetchDriverOwnedLoad(client, params.data.uuid, driver.id);
      if (!load) return null;
      const stops = await loadDispatchStops(client, load.id);
      return buildDispatchViewPayload(load, stops);
    });

    if (!payload) return reply.code(403).send({ error: "forbidden" });
    return payload;
  });

  app.post("/api/dispatch/driver-pwa/load/:uuid/stops/:stop_uuid/arrival", async (req, reply) => {
    if (!(await requireDriverSession(req, reply))) return;
    const params = stopParamsSchema.safeParse(req.params ?? {});
    if (!params.success) return sendValidationError(reply, params.error);
    const body = geoBodySchema.safeParse(req.body ?? {});
    if (!body.success) return sendValidationError(reply, body.error);
    const driver = req.driver;
    if (!driver) return;

    const updated = await withCurrentUser(req.user!.uuid, async (client) => {
      const stopRes = await client.query<{ id: string; stop_type: string; latitude: number | null; longitude: number | null }>(
        `
          SELECT s.id, s.stop_type::text, loc.latitude, loc.longitude
          FROM mdata.load_stops s
          JOIN mdata.loads l ON l.id = s.load_id
          LEFT JOIN mdata.locations loc ON loc.id = s.location_id
          WHERE s.id = $1
            AND s.load_id = $2
            AND (l.assigned_primary_driver_id = $3 OR l.assigned_secondary_driver_id = $3)
            AND l.soft_deleted_at IS NULL
          LIMIT 1
        `,
        [params.data.stop_uuid, params.data.uuid, driver.id]
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
        [params.data.stop_uuid]
      );

      const nextLoadStatus = stop.stop_type === "pickup" ? "at_pickup" : "at_delivery";
      await client.query(`UPDATE mdata.loads SET status = $2 WHERE id = $1`, [params.data.uuid, nextLoadStatus]);

      await appendCrudAudit(client, req.user!.uuid, "dispatch.driver_pwa.stop_arrival", {
        load_id: params.data.uuid,
        stop_id: params.data.stop_uuid,
      });

      return { ok: true, geofence_status: "entered" as const };
    });

    if ("error" in updated) {
      if (updated.error === "outside_geofence") return reply.code(400).send({ error: "outside_geofence", distance_miles: updated.distance });
      return reply.code(403).send({ error: "forbidden" });
    }
    return updated;
  });

  app.post("/api/dispatch/driver-pwa/load/:uuid/stops/:stop_uuid/departure", async (req, reply) => {
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
        [params.data.stop_uuid, params.data.uuid, driver.id]
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
        [params.data.stop_uuid]
      );

      const nextLoadStatus = stop.stop_type === "delivery" ? "delivered_pending_docs" : "in_transit";
      await client.query(`UPDATE mdata.loads SET status = $2 WHERE id = $1`, [params.data.uuid, nextLoadStatus]);

      await appendCrudAudit(client, req.user!.uuid, "dispatch.driver_pwa.stop_departure", {
        load_id: params.data.uuid,
        stop_id: params.data.stop_uuid,
      });

      return { ok: true, geofence_status: "exited" as const };
    });

    if ("error" in updated) {
      if (updated.error === "outside_geofence") return reply.code(400).send({ error: "outside_geofence", distance_miles: updated.distance });
      if (updated.error === "invalid_stop_state") return reply.code(400).send({ error: "invalid_stop_state" });
      return reply.code(403).send({ error: "forbidden" });
    }
    return updated;
  });

  app.post("/api/dispatch/driver-pwa/load/:uuid/stops/:stop_uuid/document", async (req, reply) => {
    if (!(await requireDriverSession(req, reply))) return;
    const params = stopParamsSchema.safeParse(req.params ?? {});
    if (!params.success) return sendValidationError(reply, params.error);
    const body = documentBodySchema.safeParse(req.body ?? {});
    if (!body.success) return sendValidationError(reply, body.error);
    const driver = req.driver;
    if (!driver) return;

    const linked = await withCurrentUser(req.user!.uuid, async (client) => {
      const stopRes = await client.query<{ id: string; operating_company_id: string }>(
        `
          SELECT s.id, l.operating_company_id::text
          FROM mdata.load_stops s
          JOIN mdata.loads l ON l.id = s.load_id
          WHERE s.id = $1
            AND s.load_id = $2
            AND (l.assigned_primary_driver_id = $3 OR l.assigned_secondary_driver_id = $3)
            AND l.soft_deleted_at IS NULL
          LIMIT 1
        `,
        [params.data.stop_uuid, params.data.uuid, driver.id]
      );
      const stop = stopRes.rows[0] ?? null;
      if (!stop) return { error: "forbidden" as const };

      const evidenceRes = await client.query<{ id: string }>(
        `
          SELECT id
          FROM documents.evidence_records
          WHERE id = $1::uuid
          LIMIT 1
        `,
        [body.data.evidence_uuid]
      );
      if (!evidenceRes.rows[0]) return { error: "evidence_not_found" as const };

      await appendCrudAudit(client, req.user!.uuid, "dispatch.driver_pwa.stop_document_linked", {
        load_id: params.data.uuid,
        stop_id: params.data.stop_uuid,
        evidence_uuid: body.data.evidence_uuid,
        doc_type: body.data.doc_type,
        operating_company_id: stop.operating_company_id,
      });

      return {
        ok: true,
        evidence_uuid: body.data.evidence_uuid,
        doc_type: body.data.doc_type,
      };
    });

    if ("error" in linked) {
      if (linked.error === "evidence_not_found") return reply.code(404).send({ error: "evidence_not_found" });
      return reply.code(403).send({ error: "forbidden" });
    }
    return reply.code(201).send(linked);
  });
}
