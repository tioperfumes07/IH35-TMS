import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";
import { appendCrudAudit } from "../../audit/crud-audit.js";
import { withCurrentUser } from "../../auth/db.js";
import { requireAuth } from "../../auth/session-middleware.js";
import { buildIdempotencyKey, enqueueAdminJob } from "../../admin/admin-jobs.service.js";
import {
  disableSamsaraConfig,
  getSamsaraConfigForCompany,
  toPublicConfig,
  upsertSamsaraConfig,
} from "./samsara.service.js";

const SAMSARA_AUDIT_SOURCE = "P8C-M-SAMSARA-STUB";

const companyQuerySchema = z.object({
  operating_company_id: z.string().uuid(),
});

const saveBodySchema = z.object({
  operating_company_id: z.string().uuid(),
  api_token: z.string().min(1),
  webhook_secret: z.string().min(1),
  samsara_org_id: z.string().trim().max(512).optional().nullable(),
});

function currentOwner(req: FastifyRequest, reply: FastifyReply) {
  if (!requireAuth(req, reply)) return null;
  const user = req.user as { uuid: string; role: string };
  if (user.role !== "Owner") {
    reply.code(403).send({ error: "forbidden_owner_only" });
    return null;
  }
  return user;
}

function normalizeOrgId(raw: string | null | undefined): string | null {
  if (raw == null) return null;
  const t = raw.trim();
  return t.length > 0 ? t : null;
}

export async function registerSamsaraConfigRoutes(app: FastifyInstance) {
  app.get("/api/v1/integrations/samsara/config", async (req, reply) => {
    const user = currentOwner(req, reply);
    if (!user) return;

    const parsed = companyQuerySchema.safeParse(req.query ?? {});
    if (!parsed.success) {
      return reply.code(400).send({ error: "validation_error", details: parsed.error.flatten() });
    }

    const oc = parsed.data.operating_company_id;
    const row = await withCurrentUser(user.uuid, async (client) => {
      await client.query(`SET LOCAL app.operating_company_id = '${oc}'`);
      return getSamsaraConfigForCompany(client, oc);
    });
    return toPublicConfig(row);
  });

  app.post("/api/v1/integrations/samsara/config", async (req, reply) => {
    const user = currentOwner(req, reply);
    if (!user) return;

    const parsed = saveBodySchema.safeParse(req.body ?? {});
    if (!parsed.success) {
      return reply.code(400).send({ error: "validation_error", details: parsed.error.flatten() });
    }

    const oc = parsed.data.operating_company_id;
    const body = parsed.data;

    const out = await withCurrentUser(user.uuid, async (client) => {
      await client.query(`SET LOCAL app.operating_company_id = '${oc}'`);
      const before = await getSamsaraConfigForCompany(client, oc);
      await upsertSamsaraConfig(client, oc, {
        api_token: body.api_token,
        webhook_secret: body.webhook_secret,
        samsara_org_id: normalizeOrgId(body.samsara_org_id ?? null),
      });
      const eventClass = before ? "integrations.samsara_config_updated" : "integrations.samsara_config_created";
      await appendCrudAudit(
        client,
        user.uuid,
        eventClass,
        { operating_company_id: oc },
        "info",
        SAMSARA_AUDIT_SOURCE
      );
      const after = await getSamsaraConfigForCompany(client, oc);
      const configId = String(after?.id ?? "");
      const configVersion = String(after?.updated_at ?? after?.created_at ?? "");
      if (!configId || !configVersion) {
        throw new Error("samsara_config_missing_id_or_version");
      }
      const jobId = await enqueueAdminJob({
        operation: "samsara.config.health_check",
        operatingCompanyId: oc,
        requestedByUserId: user.uuid,
        idempotencyKey: buildIdempotencyKey({
          operation: "samsara.config.health_check",
          operatingCompanyId: oc,
          samsaraConfigId: configId,
          configVersion,
        }),
        payload: {
          samsara_config_id: configId,
          config_version: configVersion,
        },
      });
      return { config: toPublicConfig(after), jobId };
    });
    return reply.code(202).send({
      accepted: true,
      job_id: out.jobId,
      ...out.config,
    });
  });

  app.delete("/api/v1/integrations/samsara/config", async (req, reply) => {
    const user = currentOwner(req, reply);
    if (!user) return;

    const parsed = companyQuerySchema.safeParse(req.query ?? {});
    if (!parsed.success) {
      return reply.code(400).send({ error: "validation_error", details: parsed.error.flatten() });
    }

    const oc = parsed.data.operating_company_id;

    await withCurrentUser(user.uuid, async (client) => {
      await client.query(`SET LOCAL app.operating_company_id = '${oc}'`);
      const before = await getSamsaraConfigForCompany(client, oc);
      if (!before) return;
      await disableSamsaraConfig(client, oc);
      await appendCrudAudit(
        client,
        user.uuid,
        "integrations.samsara_config_disabled",
        { operating_company_id: oc },
        "info",
        SAMSARA_AUDIT_SOURCE
      );
    });
    return { ok: true as const };
  });
}
