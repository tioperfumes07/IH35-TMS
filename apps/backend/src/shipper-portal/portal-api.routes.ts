import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";
import { withLuciaBypass } from "../auth/db.js";
import { computeProgressStatus, haversineMiles } from "../telematics/load-progress.service.js";
import { generatePresignedDownloadUrl } from "../storage/r2-client.js";
import {
  ensurePodMilestone,
  processPendingMilestoneEmails,
  sortMilestones,
  syncMilestonesFromLoadStatus,
} from "./load-milestone.service.js";
import { rejectInternalSessionOnPortalRoute, requirePortalSession } from "./portal-session.middleware.js";

const loadIdParams = z.object({ id: z.string().uuid() });

const profilePatchSchema = z.object({
  full_name: z.string().trim().max(120).optional(),
  phone: z.string().trim().max(50).optional(),
  notify_on_dispatch: z.boolean().optional(),
  notify_on_arrival: z.boolean().optional(),
  notify_on_delivery: z.boolean().optional(),
  notify_on_pod: z.boolean().optional(),
});

function sendValidationError(reply: FastifyReply, error: z.ZodError) {
  return reply.code(400).send({ error: "validation_error", details: error.flatten() });
}

function formatLatLng(lat: number, lng: number): string {
  const latDir = lat >= 0 ? "N" : "S";
  const lngDir = lng >= 0 ? "E" : "W";
  return `${Math.abs(lat).toFixed(1)}°${latDir}, ${Math.abs(lng).toFixed(1)}°${lngDir}`;
}

function formatRelativeTime(iso: string): string {
  const deltaMs = Date.now() - new Date(iso).getTime();
  const minutes = Math.max(0, Math.round(deltaMs / 60000));
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 48) return `${hours}h ago`;
  const days = Math.round(hours / 24);
  return `${days}d ago`;
}

function nearestStopLabel(
  lat: number,
  lng: number,
  stops: Array<{ city: string | null; state: string | null; latitude: number | null; longitude: number | null }>
): string | null {
  let best: { label: string; miles: number } | null = null;
  for (const stop of stops) {
    if (stop.latitude == null || stop.longitude == null) {
      const label = [stop.city, stop.state].filter(Boolean).join(", ");
      if (label && !best) best = { label, miles: Number.POSITIVE_INFINITY };
      continue;
    }
    const miles = haversineMiles(lat, lng, Number(stop.latitude), Number(stop.longitude));
    const label = [stop.city, stop.state].filter(Boolean).join(", ");
    if (!label) continue;
    if (!best || miles < best.miles) best = { label, miles };
  }
  return best?.label ?? null;
}

async function withPortalScope<T>(
  portalUser: { id: string; operating_company_id: string; customer_id: string },
  fn: (client: {
    query: <R = Record<string, unknown>>(sql: string, values?: unknown[]) => Promise<{ rows: R[] }>;
  }) => Promise<T>
): Promise<T> {
  return withLuciaBypass(async (client) => {
    await client.query(`SELECT set_config('app.operating_company_id', $1, true)`, [portalUser.operating_company_id]);
    return fn(client);
  });
}

function sanitizeLoadRow(row: Record<string, unknown>) {
  return {
    id: row.id,
    load_number: row.load_number,
    status: row.status,
    pickup_city: row.pickup_city ?? null,
    pickup_state: row.pickup_state ?? null,
    delivery_city: row.delivery_city ?? null,
    delivery_state: row.delivery_state ?? null,
    scheduled_pickup_at: row.scheduled_pickup_at ?? null,
    scheduled_delivery_at: row.scheduled_delivery_at ?? null,
    updated_at: row.updated_at,
    progress_status: row.progress_status ?? null,
    progress_eta_delta_minutes: row.progress_eta_delta_minutes ?? null,
  };
}

export async function registerPortalApiRoutes(app: FastifyInstance) {
  app.addHook("preHandler", async (req: FastifyRequest, reply: FastifyReply) => {
    const url = req.raw.url ?? "";
    if (!url.startsWith("/api/v1/portal/") || url.startsWith("/api/v1/portal/auth/")) return;
    if (rejectInternalSessionOnPortalRoute(req, reply)) return;
  });

  app.get("/api/v1/portal/loads", async (req, reply) => {
    const portalUser = await requirePortalSession(req, reply);
    if (!portalUser) return;

    const loads = await withPortalScope(portalUser, async (client) => {
      const res = await client.query(
        `
          SELECT
            l.id,
            l.load_number,
            l.status,
            l.assigned_unit_id::text AS assigned_unit_id,
            l.updated_at::text AS updated_at,
            sp.city AS pickup_city,
            sp.state AS pickup_state,
            sd.city AS delivery_city,
            sd.state AS delivery_state,
            sp.scheduled_arrival_at::text AS scheduled_pickup_at,
            sd.scheduled_arrival_at::text AS scheduled_delivery_at
          FROM mdata.loads l
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
          WHERE l.customer_id = $1::uuid
            AND l.operating_company_id = $2::uuid
            AND l.soft_deleted_at IS NULL
            AND l.status NOT IN ('cancelled', 'draft')
          ORDER BY l.updated_at DESC
          LIMIT 100
        `,
        [portalUser.customer_id, portalUser.operating_company_id]
      );

      const rows = [];
      for (const row of res.rows as Array<Record<string, unknown>>) {
        await syncMilestonesFromLoadStatus(client, {
          operating_company_id: portalUser.operating_company_id,
          load_id: String(row.id),
          status: String(row.status),
          updated_at: row.updated_at ? String(row.updated_at) : null,
        });
        const progress = await computeProgressStatus(client, {
          operating_company_id: portalUser.operating_company_id,
          load_id: String(row.id),
          assigned_unit_id: row.assigned_unit_id ? String(row.assigned_unit_id) : null,
        });
        rows.push(sanitizeLoadRow({ ...row, ...progress }));
      }
      return rows;
    });

    return { loads };
  });

  app.get("/api/v1/portal/loads/:id", async (req, reply) => {
    const portalUser = await requirePortalSession(req, reply);
    if (!portalUser) return;
    const params = loadIdParams.safeParse(req.params ?? {});
    if (!params.success) return sendValidationError(reply, params.error);

    const detail = await withPortalScope(portalUser, async (client) => {
      const loadRes = await client.query(
        `
          SELECT
            l.id,
            l.load_number,
            l.status,
            l.assigned_unit_id::text AS assigned_unit_id,
            l.updated_at::text AS updated_at
          FROM mdata.loads l
          WHERE l.id = $1::uuid
            AND l.customer_id = $2::uuid
            AND l.operating_company_id = $3::uuid
            AND l.soft_deleted_at IS NULL
          LIMIT 1
        `,
        [params.data.id, portalUser.customer_id, portalUser.operating_company_id]
      );
      const load = loadRes.rows[0] as Record<string, unknown> | undefined;
      if (!load) return null;

      await syncMilestonesFromLoadStatus(client, {
        operating_company_id: portalUser.operating_company_id,
        load_id: params.data.id,
        status: String(load.status),
        updated_at: load.updated_at ? String(load.updated_at) : null,
      });
      await ensurePodMilestone(client, { operating_company_id: portalUser.operating_company_id, load_id: params.data.id });
      await processPendingMilestoneEmails(client, { load_id: params.data.id, customer_id: portalUser.customer_id });

      const stopsRes = await client.query(
        `
          SELECT
            id::text,
            sequence_number,
            stop_type,
            address_line1,
            city,
            state,
            country,
            scheduled_arrival_at::text AS scheduled_arrival_at,
            actual_arrival_at::text AS actual_arrival_at,
            status,
            COALESCE(loc.latitude, NULL) AS latitude,
            COALESCE(loc.longitude, NULL) AS longitude
          FROM mdata.load_stops s
          LEFT JOIN mdata.locations loc ON loc.id = s.location_id
          WHERE s.load_id = $1::uuid
          ORDER BY s.sequence_number ASC
        `,
        [params.data.id]
      );

      const milestonesRes = await client.query(
        `
          SELECT id::text, milestone_type, occurred_at::text AS occurred_at, auto_generated
          FROM shipper_portal.load_milestones
          WHERE load_id = $1::uuid
          ORDER BY occurred_at ASC
        `,
        [params.data.id]
      );

      let tracking: Record<string, unknown> | null = null;
      if (load.assigned_unit_id) {
        const posRes = await client.query<{
          lat: number;
          lng: number;
          captured_at: string;
          speed_mph: number | null;
        }>(
          `
            SELECT p.lat, p.lng, p.captured_at::text AS captured_at, p.speed_mph
            FROM telematics.vehicle_latest_position p
            WHERE p.operating_company_id = $1::uuid
              AND p.unit_id = $2::uuid
            LIMIT 1
          `,
          [portalUser.operating_company_id, load.assigned_unit_id]
        );
        const pos = posRes.rows[0];
        if (pos) {
          const coords = formatLatLng(Number(pos.lat), Number(pos.lng));
          const near = nearestStopLabel(Number(pos.lat), Number(pos.lng), stopsRes.rows as never[]);
          tracking = {
            lat: Number(pos.lat),
            lng: Number(pos.lng),
            location_text: near ? `${coords} near ${near}` : coords,
            last_update_text: `Last update ${formatRelativeTime(pos.captured_at)}`,
            captured_at: pos.captured_at,
            speed_mph: pos.speed_mph,
          };
        }
      }

      const progress = await computeProgressStatus(client, {
        operating_company_id: portalUser.operating_company_id,
        load_id: params.data.id,
        assigned_unit_id: load.assigned_unit_id ? String(load.assigned_unit_id) : null,
      });

      return {
        load: {
          id: load.id,
          load_number: load.load_number,
          status: load.status,
          updated_at: load.updated_at,
          progress_status: progress.progress_status,
          progress_eta_delta_minutes: progress.eta_delta_minutes,
        },
        stops: stopsRes.rows,
        milestones: sortMilestones(milestonesRes.rows as never[]),
        tracking,
      };
    });

    if (!detail) return reply.code(404).send({ error: "load_not_found" });
    return detail;
  });

  app.get("/api/v1/portal/loads/:id/documents", async (req, reply) => {
    const portalUser = await requirePortalSession(req, reply);
    if (!portalUser) return;
    const params = loadIdParams.safeParse(req.params ?? {});
    if (!params.success) return sendValidationError(reply, params.error);

    const documents = await withPortalScope(portalUser, async (client) => {
      const loadRes = await client.query(
        `
          SELECT id::text
          FROM mdata.loads
          WHERE id = $1::uuid
            AND customer_id = $2::uuid
            AND operating_company_id = $3::uuid
            AND soft_deleted_at IS NULL
          LIMIT 1
        `,
        [params.data.id, portalUser.customer_id, portalUser.operating_company_id]
      );
      if (!loadRes.rows[0]) return null;

      const res = await client.query(
        `
          SELECT id::text, category, filename, content_type, uploaded_at::text AS uploaded_at, 'attachment'::text AS source
          FROM documents.attachments
          WHERE operating_company_id = $1::uuid
            AND entity_type = 'load'
            AND entity_id = $2::uuid
            AND is_deleted = false
            AND category IN ('pod', 'bol', 'rate_confirmation')
          UNION ALL
          SELECT
            ('pod:' || p.id::text) AS id,
            'pod'::text AS category,
            COALESCE('POD-' || p.recipient_name, 'Proof of delivery') AS filename,
            'image/png'::text AS content_type,
            p.created_at::text AS uploaded_at,
            'dispatch_pod'::text AS source
          FROM dispatch.pod_documents p
          WHERE p.operating_company_id = $1::uuid
            AND p.load_id = $2::uuid
            AND p.archived_at IS NULL
            AND p.status = 'approved'
          UNION ALL
          SELECT
            ('bol:' || b.id::text) AS id,
            'bol'::text AS category,
            'Bill of Lading'::text AS filename,
            'application/pdf'::text AS content_type,
            b.generated_at::text AS uploaded_at,
            'dispatch_bol'::text AS source
          FROM dispatch.bol_documents b
          WHERE b.operating_company_id = $1::uuid
            AND b.load_id = $2::uuid
            AND b.archived_at IS NULL
          ORDER BY uploaded_at DESC
        `,
        [portalUser.operating_company_id, params.data.id]
      );
      return res.rows;
    });

    if (documents === null) return reply.code(404).send({ error: "load_not_found" });
    return { documents };
  });

  app.get("/api/v1/portal/loads/:id/documents/:attachment_id/download", async (req, reply) => {
    const portalUser = await requirePortalSession(req, reply);
    if (!portalUser) return;
    const params = z.object({ id: z.string().uuid(), attachment_id: z.string().min(1) }).safeParse(req.params ?? {});
    if (!params.success) return sendValidationError(reply, params.error);

    const signed = await withPortalScope(portalUser, async (client) => {
      const loadRes = await client.query(
        `
          SELECT id::text
          FROM mdata.loads
          WHERE id = $1::uuid
            AND customer_id = $2::uuid
            AND operating_company_id = $3::uuid
            AND soft_deleted_at IS NULL
          LIMIT 1
        `,
        [params.data.id, portalUser.customer_id, portalUser.operating_company_id]
      );
      if (!loadRes.rows[0]) return null;

      const attachmentId = params.data.attachment_id;
      if (attachmentId.startsWith("pod:")) {
        const podId = attachmentId.slice(4);
        const podRes = await client.query<{ photo_r2_key: string | null; signature_r2_key: string | null }>(
          `
            SELECT photo_r2_key, signature_r2_key
            FROM dispatch.pod_documents
            WHERE id = $1::uuid
              AND load_id = $2::uuid
              AND operating_company_id = $3::uuid
              AND archived_at IS NULL
              AND status = 'approved'
            LIMIT 1
          `,
          [podId, params.data.id, portalUser.operating_company_id]
        );
        const pod = podRes.rows[0];
        const key = pod?.signature_r2_key ?? pod?.photo_r2_key ?? null;
        if (!key) return undefined;
        const url = await generatePresignedDownloadUrl(key, 900);
        return { download_url: url.url, expires_in_seconds: 900 };
      }
      if (attachmentId.startsWith("bol:")) {
        const bolId = attachmentId.slice(4);
        const bolRes = await client.query<{ pdf_r2_key: string }>(
          `
            SELECT pdf_r2_key
            FROM dispatch.bol_documents
            WHERE id = $1::uuid
              AND load_id = $2::uuid
              AND operating_company_id = $3::uuid
              AND archived_at IS NULL
            LIMIT 1
          `,
          [bolId, params.data.id, portalUser.operating_company_id]
        );
        const bol = bolRes.rows[0];
        if (!bol) return undefined;
        const url = await generatePresignedDownloadUrl(bol.pdf_r2_key, 900);
        return { download_url: url.url, expires_in_seconds: 900 };
      }

      const attRes = await client.query<{ r2_object_key: string; id: string }>(
        `
          SELECT id::text, r2_object_key
          FROM documents.attachments
          WHERE id = $1::uuid
            AND entity_type = 'load'
            AND entity_id = $2::uuid
            AND operating_company_id = $3::uuid
            AND is_deleted = false
            AND category IN ('pod', 'bol', 'rate_confirmation')
          LIMIT 1
        `,
        [params.data.attachment_id, params.data.id, portalUser.operating_company_id]
      );
      const row = attRes.rows[0];
      if (!row) return undefined;
      const url = await generatePresignedDownloadUrl(row.r2_object_key, 900);
      return { download_url: url.url, expires_in_seconds: 900 };
    });

    if (signed === null) return reply.code(404).send({ error: "load_not_found" });
    if (!signed) return reply.code(404).send({ error: "document_not_found" });
    return signed;
  });

  app.get("/api/v1/portal/loads/:id/tracking-stream", async (req, reply) => {
    const portalUser = await requirePortalSession(req, reply);
    if (!portalUser) return;
    const params = loadIdParams.safeParse(req.params ?? {});
    if (!params.success) return sendValidationError(reply, params.error);

    reply.raw.writeHead(200, {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    });

    let closed = false;
    req.raw.on("close", () => {
      closed = true;
    });

    const sendEvent = (payload: unknown) => {
      if (closed) return;
      reply.raw.write(`data: ${JSON.stringify(payload)}\n\n`);
    };

    while (!closed) {
      const snapshot = await withPortalScope(portalUser, async (client) => {
        const loadRes = await client.query<{ assigned_unit_id: string | null }>(
          `
            SELECT assigned_unit_id::text AS assigned_unit_id
            FROM mdata.loads
            WHERE id = $1::uuid
              AND customer_id = $2::uuid
              AND operating_company_id = $3::uuid
              AND soft_deleted_at IS NULL
            LIMIT 1
          `,
          [params.data.id, portalUser.customer_id, portalUser.operating_company_id]
        );
        const load = loadRes.rows[0];
        if (!load) return { error: "load_not_found" as const };
        if (!load.assigned_unit_id) return { tracking: null };

        const posRes = await client.query<{ lat: number; lng: number; captured_at: string }>(
          `
            SELECT lat, lng, captured_at::text AS captured_at
            FROM telematics.vehicle_latest_position
            WHERE operating_company_id = $1::uuid
              AND unit_id = $2::uuid
            LIMIT 1
          `,
          [portalUser.operating_company_id, load.assigned_unit_id]
        );
        const pos = posRes.rows[0];
        if (!pos) return { tracking: null };
        return {
          tracking: {
            lat: Number(pos.lat),
            lng: Number(pos.lng),
            location_text: formatLatLng(Number(pos.lat), Number(pos.lng)),
            last_update_text: `Last update ${formatRelativeTime(pos.captured_at)}`,
            captured_at: pos.captured_at,
          },
        };
      });

      sendEvent(snapshot);
      if (snapshot && "error" in snapshot && snapshot.error === "load_not_found") break;
      await new Promise((resolve) => setTimeout(resolve, 30000));
    }

    reply.raw.end();
  });

  app.get("/api/v1/portal/profile", async (req, reply) => {
    const portalUser = await requirePortalSession(req, reply);
    if (!portalUser) return;
    return {
      profile: {
        email: portalUser.email,
        full_name: portalUser.full_name,
        customer_id: portalUser.customer_id,
        notify_on_dispatch: portalUser.notify_on_dispatch,
        notify_on_arrival: portalUser.notify_on_arrival,
        notify_on_delivery: portalUser.notify_on_delivery,
        notify_on_pod: portalUser.notify_on_pod,
      },
    };
  });

  app.patch("/api/v1/portal/profile", async (req, reply) => {
    const portalUser = await requirePortalSession(req, reply);
    if (!portalUser) return;
    const body = profilePatchSchema.safeParse(req.body ?? {});
    if (!body.success) return sendValidationError(reply, body.error);

    const updated = await withPortalScope(portalUser, async (client) => {
      const sets: string[] = [];
      const values: unknown[] = [];
      for (const [key, value] of Object.entries(body.data)) {
        if (value === undefined) continue;
        values.push(value);
        sets.push(`${key} = $${values.length}`);
      }
      if (sets.length === 0) return portalUser;
      values.push(portalUser.id);
      const res = await client.query(
        `
          UPDATE shipper_portal.portal_users
          SET ${sets.join(", ")}
          WHERE id = $${values.length}::uuid
          RETURNING email, full_name, customer_id::text AS customer_id,
            notify_on_dispatch, notify_on_arrival, notify_on_delivery, notify_on_pod
        `,
        values
      );
      return res.rows[0] ?? portalUser;
    });

    return { profile: updated };
  });
}
