import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";
import { appendCrudAudit } from "../../audit/crud-audit.js";
import { withCurrentUser, withLuciaBypass } from "../../auth/db.js";
import { requireAuth } from "../../auth/session-middleware.js";
import {
  buildAuthorizationUrl,
  exchangeAuthCodeForTokens,
  getQboConnectionStatus,
  revokeConnection,
} from "./qbo-oauth.service.js";

const startQuerySchema = z.object({
  operating_company_id: z.string().uuid(),
});

const callbackQuerySchema = z.object({
  code: z.string().trim().min(1),
  realmId: z.string().trim().min(1),
  state: z.string().uuid(),
});

const statusQuerySchema = z.object({
  operating_company_id: z.string().uuid(),
});

const disconnectParamsSchema = z.object({
  operating_company_id: z.string().uuid(),
});

function currentAuthUser(req: FastifyRequest, reply: FastifyReply) {
  if (!requireAuth(req, reply)) return null;
  return req.user as { uuid: string; role: string };
}

async function loadConnectionId(operatingCompanyId: string) {
  return withLuciaBypass(async (client) => {
    const res = await client.query<{ id: string }>(
      `
        SELECT id
        FROM integrations.qbo_connections
        WHERE operating_company_id = $1
          AND revoked_at IS NULL
        ORDER BY authorized_at DESC
        LIMIT 1
      `,
      [operatingCompanyId]
    );
    return res.rows[0]?.id ?? null;
  });
}

export async function registerQboOAuthRoutes(app: FastifyInstance) {
  app.get("/api/v1/integrations/qbo/oauth-start", async (req, reply) => {
    const user = currentAuthUser(req, reply);
    if (!user) return;
    if (user.role !== "Owner") return reply.code(403).send({ error: "forbidden" });

    const query = startQuerySchema.safeParse(req.query ?? {});
    if (!query.success) {
      return reply.code(400).send({ error: "validation_error", details: query.error.flatten() });
    }

    const url = buildAuthorizationUrl(query.data.operating_company_id);
    await withCurrentUser(user.uuid, async (client) => {
      await appendCrudAudit(
        client,
        user.uuid,
        "integrations.qbo.oauth_initiated",
        { operating_company_id: query.data.operating_company_id },
        "info",
        "P5-T6-HOTFIX-QBO-OAUTH"
      );
    });
    return reply.redirect(url);
  });

  app.get("/api/v1/integrations/qbo/oauth-callback", async (req, reply) => {
    const user = currentAuthUser(req, reply);
    if (!user) return;
    if (user.role !== "Owner") return reply.code(403).send({ error: "forbidden" });

    const query = callbackQuerySchema.safeParse(req.query ?? {});
    if (!query.success) {
      return reply.code(400).send({ error: "validation_error", details: query.error.flatten() });
    }

    const operatingCompanyId = query.data.state;
    await exchangeAuthCodeForTokens(query.data.code, query.data.realmId, operatingCompanyId, user.uuid);
    await withCurrentUser(user.uuid, async (client) => {
      await appendCrudAudit(
        client,
        user.uuid,
        "integrations.qbo.oauth_callback",
        { operating_company_id: operatingCompanyId, realm_id: query.data.realmId },
        "info",
        "P5-T6-HOTFIX-QBO-OAUTH"
      );
    });
    const uiBase = (process.env.FRONTEND_BASE_URL ?? "https://ih35-tms-web.onrender.com").replace(/\/$/, "");
    const redirectUrl = `${uiBase}/admin/forensic-review?qbo_authorized=true&company_id=${encodeURIComponent(operatingCompanyId)}`;
    return reply.redirect(redirectUrl);
  });

  app.post("/api/v1/integrations/qbo/disconnect/:operating_company_id", async (req, reply) => {
    const user = currentAuthUser(req, reply);
    if (!user) return;
    if (user.role !== "Owner") return reply.code(403).send({ error: "forbidden" });

    const params = disconnectParamsSchema.safeParse(req.params ?? {});
    if (!params.success) {
      return reply.code(400).send({ error: "validation_error", details: params.error.flatten() });
    }
    const connectionId = await loadConnectionId(params.data.operating_company_id);
    if (!connectionId) return reply.code(404).send({ error: "qbo_connection_not_found" });

    await revokeConnection(connectionId, user.uuid);
    return { ok: true };
  });

  app.get("/api/v1/integrations/qbo/status", async (req, reply) => {
    const user = currentAuthUser(req, reply);
    if (!user) return;
    if (user.role !== "Owner") return reply.code(403).send({ error: "forbidden" });

    const query = statusQuerySchema.safeParse(req.query ?? {});
    if (!query.success) {
      return reply.code(400).send({ error: "validation_error", details: query.error.flatten() });
    }
    const status = await getQboConnectionStatus(query.data.operating_company_id);
    return status;
  });
}

