import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import { appendCrudAudit } from "../audit/crud-audit.js";
import { withCurrentUser } from "../auth/db.js";
import { buildInvoiceFromLoad } from "../accounting/from-load.js";
import { requireDriverSession } from "./auth.js";
import { isR2Configured, putObjectBytes } from "../storage/r2-client.js";
import { realtimePublish } from "../realtime/hub.js";

const loadIdParamsSchema = z.object({
  id: z.string().uuid(),
});

const simpleOfferBodySchema = z.object({
  confirm: z.literal(true).optional(),
});

const declineBodySchema = z.object({
  reason: z.string().max(500).optional(),
});

const statusBodySchema = z.object({
  status: z.enum(["at_pickup", "in_transit", "at_delivery", "delivered"]),
  location: z.object({
    lat: z.number(),
    lng: z.number(),
  }),
  timestamp: z.string(),
  notes: z.string().max(2000).optional(),
});

type LoadRow = {
  id: string;
  load_number: string | null;
  status: string;
  operating_company_id: string;
};

function sendValidationError(reply: FastifyReply, error: z.ZodError) {
  return reply.code(400).send({ error: "validation_error", details: error.flatten() });
}

async function fetchOwnedLoadRow(
  client: { query: <R>(sql: string, values?: unknown[]) => Promise<{ rows: R[] }> },
  loadId: string,
  driverId: string
): Promise<LoadRow | null> {
  const res = await client.query<LoadRow>(
    `
      SELECT l.id, l.load_number, l.status::text, l.operating_company_id
      FROM mdata.loads l
      WHERE l.id = $1
        AND l.soft_deleted_at IS NULL
        AND (l.assigned_primary_driver_id = $2 OR l.assigned_secondary_driver_id = $2)
      LIMIT 1
    `,
    [loadId, driverId]
  );
  return res.rows[0] ?? null;
}

function broadcastLoad(loadId: string, operatingCompanyId: string, driverId: string, patch: Record<string, unknown>) {
  realtimePublish(`load:${loadId}`, { type: "load_update", load_id: loadId, ...patch });
  realtimePublish(`driver:${driverId}`, { type: "load_update", load_id: loadId, ...patch });
  realtimePublish(`company:${operatingCompanyId}:reconcile`, { type: "load_touch", load_id: loadId });
}

export async function registerDriverLoadAssignmentRoutes(app: FastifyInstance) {
  app.get("/api/v1/driver/loads/assigned", async (req, reply) => {
    if (!(await requireDriverSession(req, reply))) return;
    const driver = req.driver;
    if (!driver) return;

    const loads = await withCurrentUser(req.user!.uuid, async (client) => {
      const rowsRes = await client.query<LoadRow & { rate_total_cents: unknown }>(
        `
          SELECT l.id, l.load_number, l.status::text, l.operating_company_id, l.rate_total_cents
          FROM mdata.loads l
          WHERE l.soft_deleted_at IS NULL
            AND (l.assigned_primary_driver_id = $1 OR l.assigned_secondary_driver_id = $1)
            AND l.status::text IN ('offered', 'booked')
          ORDER BY l.updated_at DESC
          LIMIT 50
        `,
        [driver.id]
      );
      return rowsRes.rows;
    });
    return { loads };
  });

  app.post("/api/v1/driver/loads/:id/accept-offer", async (req, reply) => {
    if (!(await requireDriverSession(req, reply))) return;
    const params = loadIdParamsSchema.safeParse(req.params ?? {});
    if (!params.success) return sendValidationError(reply, params.error);
    simpleOfferBodySchema.safeParse(req.body ?? {});
    const driver = req.driver;
    if (!driver) return;

    const out = await withCurrentUser(req.user!.uuid, async (client) => {
      const row = await fetchOwnedLoadRow(client, params.data.id, driver.id);
      if (!row) return { err: "forbidden" as const };
      if (row.status !== "offered") return { err: "invalid_state" as const };

      await client.query(`UPDATE mdata.loads SET status = 'booked' WHERE id = $1`, [params.data.id]);
      await appendCrudAudit(
        client,
        req.user!.uuid,
        "dispatch.load_offer_accepted",
        { resource_type: "mdata.loads", resource_id: params.data.id, driver_id: driver.id },
        "info",
        "P7-BLOCK-M"
      );
      broadcastLoad(params.data.id, row.operating_company_id, driver.id, { status: "booked" });
      return { ok: true as const };
    });

    if ("err" in out) {
      if (out.err === "forbidden") return reply.code(403).send({ error: "forbidden" });
      return reply.code(400).send({ error: out.err });
    }
    return out;
  });

  app.post("/api/v1/driver/loads/:id/decline-offer", async (req, reply) => {
    if (!(await requireDriverSession(req, reply))) return;
    const params = loadIdParamsSchema.safeParse(req.params ?? {});
    if (!params.success) return sendValidationError(reply, params.error);
    declineBodySchema.safeParse(req.body ?? {});
    const driver = req.driver;
    if (!driver) return;

    const out = await withCurrentUser(req.user!.uuid, async (client) => {
      const row = await fetchOwnedLoadRow(client, params.data.id, driver.id);
      if (!row) return { err: "forbidden" as const };
      if (row.status !== "offered") return { err: "invalid_state" as const };

      await client.query(
        `
          UPDATE mdata.loads
          SET
            assigned_primary_driver_id = CASE WHEN assigned_primary_driver_id = $2 THEN NULL ELSE assigned_primary_driver_id END,
            assigned_secondary_driver_id = CASE WHEN assigned_secondary_driver_id = $2 THEN NULL ELSE assigned_secondary_driver_id END,
            status = 'assigned'
          WHERE id = $1
        `,
        [params.data.id, driver.id]
      );

      await appendCrudAudit(
        client,
        req.user!.uuid,
        "dispatch.load_offer_declined",
        { resource_type: "mdata.loads", resource_id: params.data.id, driver_id: driver.id },
        "info",
        "P7-BLOCK-M"
      );
      broadcastLoad(params.data.id, row.operating_company_id, driver.id, { status: "assigned" });
      return { ok: true as const };
    });

    if ("err" in out) {
      if (out.err === "forbidden") return reply.code(403).send({ error: "forbidden" });
      return reply.code(400).send({ error: out.err });
    }
    return out;
  });

  app.post("/api/v1/driver/loads/:id/status", async (req, reply) => {
    if (!(await requireDriverSession(req, reply))) return;
    const params = loadIdParamsSchema.safeParse(req.params ?? {});
    if (!params.success) return sendValidationError(reply, params.error);
    const body = statusBodySchema.safeParse(req.body ?? {});
    if (!body.success) return sendValidationError(reply, body.error);
    const driver = req.driver;
    if (!driver) return;

    const out = await withCurrentUser(req.user!.uuid, async (client) => {
      const row = await fetchOwnedLoadRow(client, params.data.id, driver.id);
      if (!row) return { err: "forbidden" as const };

      await client.query(
        `
          INSERT INTO mdata.driver_location_events (
            operating_company_id, load_id, driver_id, event_kind, load_status, lat, lng, recorded_at, notes
          )
          VALUES ($1, $2, $3, 'status', $4, $5, $6, $7::timestamptz, $8)
        `,
        [
          row.operating_company_id,
          params.data.id,
          driver.id,
          body.data.status,
          body.data.location.lat,
          body.data.location.lng,
          body.data.timestamp,
          body.data.notes ?? null,
        ]
      );

      await client.query(`UPDATE mdata.loads SET status = $2::mdata.load_status_enum WHERE id = $1`, [
        params.data.id,
        body.data.status,
      ]);

      await appendCrudAudit(
        client,
        req.user!.uuid,
        "dispatch.driver_load_status",
        { resource_type: "mdata.loads", resource_id: params.data.id, status: body.data.status },
        "info",
        "P7-BLOCK-M"
      );
      broadcastLoad(params.data.id, row.operating_company_id, driver.id, { status: body.data.status });
      return { ok: true as const };
    });

    if ("err" in out) {
      if (out.err === "forbidden") return reply.code(403).send({ error: "forbidden" });
      return reply.code(400).send({ error: out.err });
    }
    return out;
  });

  async function handlePod(req: FastifyRequest, reply: FastifyReply, kind: "pickup" | "delivery") {
    if (!(await requireDriverSession(req, reply))) return;
    const params = loadIdParamsSchema.safeParse(req.params ?? {});
    if (!params.success) return sendValidationError(reply, params.error);
    const driver = req.driver;
    if (!driver) return;
    if (!isR2Configured()) return reply.code(503).send({ error: "r2_not_configured" });

    let photoBuf: Buffer | null = null;
    let photoMime = "image/jpeg";
    let sigBuf: Buffer | null = null;
    let lat = 0;
    let lng = 0;
    let ts = new Date().toISOString();
    let notes: string | null = null;

    const parts = (req as { parts: () => AsyncIterableIterator<{ type: string; fieldname?: string; mimetype?: string; value?: unknown; toBuffer: () => Promise<Buffer> }> }).parts();
    for await (const part of parts) {
      if (part.type === "file") {
        if (part.fieldname === "photo") {
          photoBuf = await part.toBuffer();
          photoMime = part.mimetype || photoMime;
        }
        if (part.fieldname === "signature") {
          sigBuf = await part.toBuffer();
        }
      } else if (part.fieldname === "lat") lat = Number(part.value ?? 0);
      else if (part.fieldname === "lng") lng = Number(part.value ?? 0);
      else if (part.fieldname === "timestamp") ts = String(part.value ?? ts);
      else if (part.fieldname === "notes") notes = String(part.value ?? "") || null;
    }

    if (!photoBuf?.length || !sigBuf?.length) {
      return reply.code(400).send({ error: "photo_and_signature_required" });
    }

    const result = await withCurrentUser(req.user!.uuid, async (client) => {
      const row = await fetchOwnedLoadRow(client, params.data.id, driver.id);
      if (!row) return { err: "forbidden" as const };
      if (kind === "pickup" && row.status !== "at_pickup") return { err: "invalid_state" as const };
      if (kind === "delivery" && !["at_delivery", "in_transit"].includes(row.status)) {
        return { err: "invalid_state" as const };
      }

      const uid = randomUUID();
      const photoKey = `loads/${params.data.id}/${kind}/${uid}-photo.jpg`;
      const sigKey = `loads/${params.data.id}/${kind}/${uid}-sig.png`;

      await putObjectBytes(photoKey, photoBuf, photoMime);
      await putObjectBytes(sigKey, sigBuf, "image/png");

      const recordedAt = new Date(ts);
      const isoTs = Number.isNaN(recordedAt.getTime()) ? new Date().toISOString() : recordedAt.toISOString();

      await client.query(
        `
          INSERT INTO mdata.driver_location_events (
            operating_company_id, load_id, driver_id, event_kind, load_status, lat, lng, recorded_at, notes, r2_photo_key, r2_signature_key, meta
          )
          VALUES ($1, $2, $3, $4, $5, $6, $7, $8::timestamptz, $9, $10, $11, $12::jsonb)
        `,
        [
          row.operating_company_id,
          params.data.id,
          driver.id,
          kind === "pickup" ? "pickup_pod" : "delivery_pod",
          row.status,
          lat,
          lng,
          isoTs,
          notes,
          photoKey,
          sigKey,
          JSON.stringify({ kind }),
        ]
      );

      if (kind === "pickup") {
        await client.query(
          `
            UPDATE mdata.loads
            SET pickup_pod_photo_r2_key = $2,
                pickup_pod_sig_r2_key = $3,
                pickup_pod_at = $4::timestamptz
            WHERE id = $1
          `,
          [params.data.id, photoKey, sigKey, isoTs]
        );
      } else {
        await client.query(
          `
            UPDATE mdata.loads
            SET delivery_pod_photo_r2_key = $2,
                delivery_pod_sig_r2_key = $3,
                delivery_pod_at = $4::timestamptz,
                status = 'delivered'
            WHERE id = $1
          `,
          [params.data.id, photoKey, sigKey, isoTs]
        );

        try {
          await buildInvoiceFromLoad(client, {
            userId: req.user!.uuid,
            operatingCompanyId: row.operating_company_id,
            loadId: params.data.id,
          });
        } catch {
          /* invoice may fail for data reasons; POD still recorded */
        }
      }

      await appendCrudAudit(
        client,
        req.user!.uuid,
        kind === "pickup" ? "dispatch.pickup_pod_captured" : "dispatch.delivery_pod_captured",
        { resource_type: "mdata.loads", resource_id: params.data.id, driver_id: driver.id },
        "info",
        "P7-BLOCK-M"
      );

      broadcastLoad(params.data.id, row.operating_company_id, driver.id, {
        pod: kind,
        status: kind === "delivery" ? "delivered" : row.status,
      });
      return { ok: true as const, r2_photo_key: photoKey, r2_signature_key: sigKey };
    });

    if ("err" in result) {
      if (result.err === "forbidden") return reply.code(403).send({ error: "forbidden" });
      return reply.code(400).send({ error: result.err });
    }
    return result;
  }

  app.post("/api/v1/driver/loads/:id/pickup-event", async (req, reply) => {
    return handlePod(req, reply, "pickup");
  });

  app.post("/api/v1/driver/loads/:id/delivery-event", async (req, reply) => {
    return handlePod(req, reply, "delivery");
  });
}
