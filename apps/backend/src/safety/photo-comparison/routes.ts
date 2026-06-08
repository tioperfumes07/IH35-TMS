import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";
import { appendCrudAudit } from "../../audit/crud-audit.js";
import { withCurrentUser } from "../../auth/db.js";
import { requireAuth } from "../../auth/session-middleware.js";
import { runDiff } from "./diff-engine.service.js";
import {
  applyManualOverride,
  getSession,
  listSessions,
  PHOTO_ANGLES,
  startPreTripSession,
  submitPostTripPhotos,
  uploadTripPhotoEvidence,
  type DiffStatus,
} from "./session.service.js";

const BLOCK_ID = "GAP-50-AI-PHOTO-COMPARISON";

const companyQuerySchema = z.object({
  operating_company_id: z.string().uuid(),
});

const sessionParamsSchema = z.object({
  session_uuid: z.string().uuid(),
});

const listQuerySchema = companyQuerySchema.extend({
  driver: z.string().uuid().optional(),
  status: z
    .enum(["pending", "analyzing", "clean", "damage_detected", "review_required", "manual_override"])
    .optional(),
  from: z.string().datetime({ offset: true }).optional(),
  to: z.string().datetime({ offset: true }).optional(),
});

const preTripBodySchema = z.object({
  operating_company_id: z.string().uuid(),
  load_uuid: z.string().uuid().nullable().optional(),
  driver_uuid: z.string().uuid(),
  unit_uuid: z.string().uuid(),
  evidence_uuids: z.array(z.string().uuid()).min(1),
});

const postTripBodySchema = z.object({
  operating_company_id: z.string().uuid(),
  evidence_uuids: z.array(z.string().uuid()).min(1),
});

const manualOverrideBodySchema = z.object({
  operating_company_id: z.string().uuid(),
  diff_summary: z.string().min(1).max(4000),
  diff_findings: z.unknown().optional(),
});

const evidenceUploadQuerySchema = companyQuerySchema.extend({
  driver_uuid: z.string().uuid(),
  unit_uuid: z.string().uuid(),
  load_uuid: z.string().uuid().optional(),
  angle_label: z.enum(PHOTO_ANGLES),
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
  fn: (client: Parameters<typeof startPreTripSession>[0]) => Promise<T>
) {
  return withCurrentUser(userId, async (client) => {
    await client.query(`SET LOCAL app.operating_company_id = '${operatingCompanyId}'`);
    return fn(client);
  });
}

function isSafetyMutationAllowed(role: string) {
  return ["Owner", "Administrator", "Manager", "Safety"].includes(role);
}

function isManagerPlus(role: string) {
  return ["Owner", "Administrator", "Manager"].includes(role);
}

export async function registerPhotoComparisonRoutes(app: FastifyInstance) {
  app.post("/api/safety/photo-comparison/evidence", async (req, reply) => {
    const user = currentAuthUser(req, reply);
    if (!user) return;
    const query = evidenceUploadQuerySchema.safeParse(req.query ?? {});
    if (!query.success) return sendValidationError(reply, query.error);
    const file = await req.file();
    if (!file) return reply.code(400).send({ error: "file_required" });

    const chunks: Buffer[] = [];
    for await (const chunk of file.file) chunks.push(Buffer.from(chunk));
    const buffer = Buffer.concat(chunks);
    const r2ObjectKey = `trip-photos/${query.data.load_uuid ?? "no-load"}/${query.data.angle_label}/${file.filename ?? "photo.jpg"}`;

    try {
      const result = await withCompanyScope(user.uuid, query.data.operating_company_id, async (client) =>
        uploadTripPhotoEvidence(client, {
          operatingCompanyId: query.data.operating_company_id,
          userUuid: user.uuid,
          driverUuid: query.data.driver_uuid,
          unitUuid: query.data.unit_uuid,
          loadUuid: query.data.load_uuid ?? null,
          angleLabel: query.data.angle_label,
          buffer,
          r2ObjectKey,
        })
      );
      return reply.code(201).send(result);
    } catch (err) {
      const message = err instanceof Error ? err.message : "upload_failed";
      if (message.startsWith("exif_missing")) return reply.code(422).send({ error: "exif_missing", detail: message });
      return reply.code(500).send({ error: "upload_failed" });
    }
  });

  app.post("/api/safety/photo-comparison/pre-trip", async (req, reply) => {
    const user = currentAuthUser(req, reply);
    if (!user) return;
    const body = preTripBodySchema.safeParse(req.body ?? {});
    if (!body.success) return sendValidationError(reply, body.error);

    const sessionUuid = await withCompanyScope(user.uuid, body.data.operating_company_id, async (client) => {
      const uuid = await startPreTripSession(client, {
        operatingCompanyId: body.data.operating_company_id,
        loadUuid: body.data.load_uuid ?? null,
        driverUuid: body.data.driver_uuid,
        unitUuid: body.data.unit_uuid,
        evidenceUuids: body.data.evidence_uuids,
      });
      await appendCrudAudit(
        client,
        user.uuid,
        "safety.photo_comparison.pre_trip_started",
        {
          resource_type: "safety.photo_comparison_sessions",
          resource_id: uuid,
          operating_company_id: body.data.operating_company_id,
        },
        "info",
        BLOCK_ID
      );
      return uuid;
    });

    return reply.code(201).send({ session_uuid: sessionUuid });
  });

  app.post("/api/safety/photo-comparison/:session_uuid/post-trip", async (req, reply) => {
    const user = currentAuthUser(req, reply);
    if (!user) return;
    const params = sessionParamsSchema.safeParse(req.params ?? {});
    if (!params.success) return sendValidationError(reply, params.error);
    const body = postTripBodySchema.safeParse(req.body ?? {});
    if (!body.success) return sendValidationError(reply, body.error);

    const result = await withCompanyScope(user.uuid, body.data.operating_company_id, async (client) => {
      const session = await submitPostTripPhotos(client, params.data.session_uuid, body.data.evidence_uuids);
      await appendCrudAudit(
        client,
        user.uuid,
        "safety.photo_comparison.post_trip_submitted",
        {
          resource_type: "safety.photo_comparison_sessions",
          resource_id: params.data.session_uuid,
          operating_company_id: body.data.operating_company_id,
        },
        "info",
        BLOCK_ID
      );
      const diff = await runDiff(client, body.data.operating_company_id, params.data.session_uuid);
      return { session, diff };
    });

    return reply.send(result);
  });

  app.get("/api/safety/photo-comparison/:session_uuid", async (req, reply) => {
    const user = currentAuthUser(req, reply);
    if (!user) return;
    const params = sessionParamsSchema.safeParse(req.params ?? {});
    if (!params.success) return sendValidationError(reply, params.error);
    const query = companyQuerySchema.safeParse(req.query ?? {});
    if (!query.success) return sendValidationError(reply, query.error);

    const session = await withCompanyScope(user.uuid, query.data.operating_company_id, async (client) =>
      getSession(client, query.data.operating_company_id, params.data.session_uuid)
    );
    if (!session) return reply.code(404).send({ error: "session_not_found" });
    return { session };
  });

  app.get("/api/safety/photo-comparison/sessions", async (req, reply) => {
    const user = currentAuthUser(req, reply);
    if (!user) return;
    const query = listQuerySchema.safeParse(req.query ?? {});
    if (!query.success) return sendValidationError(reply, query.error);

    const sessions = await withCompanyScope(user.uuid, query.data.operating_company_id, async (client) =>
      listSessions(client, {
        operatingCompanyId: query.data.operating_company_id,
        driverUuid: query.data.driver,
        status: query.data.status as DiffStatus | undefined,
        from: query.data.from,
        to: query.data.to,
      })
    );
    return { sessions };
  });

  app.patch("/api/safety/photo-comparison/:session_uuid/manual-override", async (req, reply) => {
    const user = currentAuthUser(req, reply);
    if (!user) return;
    if (!isManagerPlus(user.role)) return reply.code(403).send({ error: "forbidden" });
    const params = sessionParamsSchema.safeParse(req.params ?? {});
    if (!params.success) return sendValidationError(reply, params.error);
    const body = manualOverrideBodySchema.safeParse(req.body ?? {});
    if (!body.success) return sendValidationError(reply, body.error);

    const session = await withCompanyScope(user.uuid, body.data.operating_company_id, async (client) => {
      const updated = await applyManualOverride(client, {
        sessionUuid: params.data.session_uuid,
        operatingCompanyId: body.data.operating_company_id,
        userUuid: user.uuid,
        diffSummary: body.data.diff_summary,
        diffFindings: body.data.diff_findings,
      });
      if (updated) {
        await appendCrudAudit(
          client,
          user.uuid,
          "safety.photo_comparison.manual_override",
          {
            resource_type: "safety.photo_comparison_sessions",
            resource_id: params.data.session_uuid,
            operating_company_id: body.data.operating_company_id,
          },
          "info",
          BLOCK_ID
        );
      }
      return updated;
    });

    if (!session) return reply.code(404).send({ error: "session_not_found" });
    return { session };
  });
}
