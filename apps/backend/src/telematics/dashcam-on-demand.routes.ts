import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";
import { withCurrentUser } from "../auth/db.js";
import { requireAuth } from "../auth/session-middleware.js";
import { insertDashcamClip, requestSamsaraOnDemandClip } from "./dashcam.service.js";
import { canAccessDashcam } from "./dashcam-rbac.js";

const requestClipSchema = z.object({
  operating_company_id: z.string().uuid(),
  unit_id: z.string().uuid(),
  start_at: z.string().datetime({ offset: true }),
  duration_sec: z.number().int().min(10).max(180).default(30),
  camera_facing: z.enum(["road", "in_cab", "both"]).default("both"),
});

const listClipsQuerySchema = z.object({
  operating_company_id: z.string().uuid(),
});

const harshParamsSchema = z.object({
  id: z.string().uuid(),
});

function authed(req: FastifyRequest, reply: FastifyReply) {
  if (!requireAuth(req, reply)) return null;
  return req.user;
}

function validationError(reply: FastifyReply, err: z.ZodError) {
  return reply.code(400).send({ error: "validation_error", details: err.flatten() });
}

async function withCompany<T>(userId: string, companyId: string, fn: (client: any) => Promise<T>) {
  return withCurrentUser(userId, async (client) => {
    await client.query("SELECT set_config('app.operating_company_id', $1, true)", [companyId]);
    return fn(client);
  });
}

export async function registerDashcamOnDemandRoutes(app: FastifyInstance) {
  app.post("/api/v1/dashcam/request-clip", async (req, reply) => {
    const user = authed(req, reply);
    if (!user) return;
    if (!canAccessDashcam(user.role)) return reply.code(403).send({ error: "forbidden" });
    const parsed = requestClipSchema.safeParse(req.body ?? {});
    if (!parsed.success) return validationError(reply, parsed.error);
    const body = parsed.data;

    const result = await withCompany(user.uuid, body.operating_company_id, async (client) => {
      const clip = await requestSamsaraOnDemandClip(client, {
        operating_company_id: body.operating_company_id,
        unit_id: body.unit_id,
        start_at: body.start_at,
        duration_sec: body.duration_sec,
        camera_facing: body.camera_facing,
      });
      if (!clip || !clip.clipUrl) return null;
      const clipId = await insertDashcamClip(client, {
        operating_company_id: body.operating_company_id,
        unit_id: body.unit_id,
        triggered_at: body.start_at,
        duration_sec: body.duration_sec,
        camera_facing: body.camera_facing,
        samsara_clip_url: clip.clipUrl,
        samsara_clip_id: clip.clipId,
        trigger_kind: "on_demand",
      });
      return { id: clipId, samsara_clip_id: clip.clipId, samsara_clip_url: clip.clipUrl };
    });

    if (!result) return reply.code(502).send({ error: "dashcam_clip_unavailable" });
    return reply.code(201).send(result);
  });

  app.get("/api/v1/safety/harsh-events/:id/dashcam-clips", async (req, reply) => {
    const user = authed(req, reply);
    if (!user) return;
    if (!canAccessDashcam(user.role)) return reply.code(403).send({ error: "forbidden" });
    const params = harshParamsSchema.safeParse(req.params ?? {});
    if (!params.success) return validationError(reply, params.error);
    const query = listClipsQuerySchema.safeParse(req.query ?? {});
    if (!query.success) return validationError(reply, query.error);

    const rows = await withCompany(user.uuid, query.data.operating_company_id, async (client) => {
      const res = await client.query(
        `
          SELECT
            id::text,
            unit_id::text,
            triggered_at::text,
            duration_sec,
            camera_facing,
            samsara_clip_url,
            samsara_clip_id,
            trigger_kind,
            linked_harsh_event_id::text
          FROM telematics.dashcam_clips
          WHERE operating_company_id = $1::uuid
            AND linked_harsh_event_id = $2::uuid
          ORDER BY triggered_at DESC
          LIMIT 20
        `,
        [query.data.operating_company_id, params.data.id]
      );
      return res.rows;
    });
    return { rows };
  });
}
