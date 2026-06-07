import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";
import { withCurrentUser } from "../../auth/db.js";
import { requireAuth } from "../../auth/session-middleware.js";
import { attachPhotoToDamage, listDamagePhotos, recordCustodyAccess } from "./photo-evidence.service.js";

const companyQuerySchema = z.object({
  operating_company_id: z.string().uuid(),
});

const damageParamsSchema = z.object({
  uuid: z.string().uuid(),
});

const evidenceParamsSchema = damageParamsSchema.extend({
  evidence_uuid: z.string().uuid(),
});

function currentAuthUser(req: FastifyRequest, reply: FastifyReply) {
  if (!requireAuth(req, reply)) return null;
  return req.user;
}

async function withCompanyScope<T>(
  userId: string,
  operatingCompanyId: string,
  fn: (client: Parameters<typeof attachPhotoToDamage>[0]) => Promise<T>
) {
  return withCurrentUser(userId, async (client) => {
    await client.query(`SET LOCAL app.operating_company_id = '${operatingCompanyId}'`);
    return fn(client);
  });
}

function isSafetyMutationAllowed(role: string) {
  return ["Owner", "Administrator", "Manager", "Safety"].includes(role);
}

export async function registerDamagePhotoEvidenceRoutes(app: FastifyInstance) {
  app.post("/api/safety/damage-reports/:uuid/photos", async (req, reply) => {
    const user = currentAuthUser(req, reply);
    if (!user) return;
    if (!isSafetyMutationAllowed(user.role)) return reply.code(403).send({ error: "forbidden" });
    const params = damageParamsSchema.safeParse(req.params ?? {});
    if (!params.success) return reply.code(400).send({ error: "validation_error" });
    const query = companyQuerySchema.safeParse(req.query ?? {});
    if (!query.success) return reply.code(400).send({ error: "validation_error" });
    const file = await req.file();
    if (!file) return reply.code(400).send({ error: "file_required" });

    const chunks: Buffer[] = [];
    for await (const chunk of file.file) chunks.push(Buffer.from(chunk));
    const buffer = Buffer.concat(chunks);
    const r2ObjectKey = `damage-evidence/${params.data.uuid}/${file.filename ?? "photo.jpg"}`;

    try {
      const evidence = await withCompanyScope(user.uuid, query.data.operating_company_id, async (client) =>
        attachPhotoToDamage(client, {
          operatingCompanyId: query.data.operating_company_id,
          damageUuid: params.data.uuid,
          userUuid: user.uuid,
          buffer,
          r2ObjectKey,
        })
      );
      return reply.code(201).send({ evidence });
    } catch (err) {
      const message = err instanceof Error ? err.message : "upload_failed";
      if (message.startsWith("exif_missing")) return reply.code(422).send({ error: "exif_missing", detail: message });
      if (message === "damage_report_not_found") return reply.code(404).send({ error: message });
      return reply.code(500).send({ error: "upload_failed" });
    }
  });

  app.get("/api/safety/damage-reports/:uuid/photos", async (req, reply) => {
    const user = currentAuthUser(req, reply);
    if (!user) return;
    const params = damageParamsSchema.safeParse(req.params ?? {});
    if (!params.success) return reply.code(400).send({ error: "validation_error" });
    const query = companyQuerySchema.safeParse(req.query ?? {});
    if (!query.success) return reply.code(400).send({ error: "validation_error" });

    const photos = await withCompanyScope(user.uuid, query.data.operating_company_id, async (client) =>
      listDamagePhotos(client, query.data.operating_company_id, params.data.uuid)
    );
    return { photos };
  });

  app.get("/api/safety/damage-reports/:uuid/photos/:evidence_uuid/custody-chain", async (req, reply) => {
    const user = currentAuthUser(req, reply);
    if (!user) return;
    const params = evidenceParamsSchema.safeParse(req.params ?? {});
    if (!params.success) return reply.code(400).send({ error: "validation_error" });
    const query = companyQuerySchema.safeParse(req.query ?? {});
    if (!query.success) return reply.code(400).send({ error: "validation_error" });

    const chain = await withCompanyScope(user.uuid, query.data.operating_company_id, async (client) =>
      recordCustodyAccess(client, {
        operatingCompanyId: query.data.operating_company_id,
        damageUuid: params.data.uuid,
        evidenceUuid: params.data.evidence_uuid,
        userUuid: user.uuid,
        eventKind: "viewed",
        details: { source: "custody_chain_endpoint" },
      })
    );
    return { custody_chain: chain };
  });
}
