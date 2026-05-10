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
  code: z.string().trim().min(1).optional(),
  realmId: z.string().trim().min(1).optional(),
  state: z.string().uuid().optional(),
  error: z.string().trim().min(1).optional(),
  error_description: z.string().trim().optional(),
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
  function frontendBaseUrl() {
    return (process.env.APP_BASE_URL ?? process.env.FRONTEND_BASE_URL ?? "https://app.ih35dispatch.com").replace(/\/$/, "");
  }

  app.get("/api/v1/integrations/qbo/oauth-start", async (req, reply) => {
    const user = currentAuthUser(req, reply);
    if (!user) return;
    if (user.role !== "Owner") return reply.code(403).send({ error: "forbidden" });

    const query = startQuerySchema.safeParse(req.query ?? {});
    if (!query.success) {
      return reply.code(400).send({ error: "validation_error", details: query.error.flatten() });
    }

    const url = buildAuthorizationUrl(query.data.operating_company_id);
    req.log.info(
      {
        step: "oauth_start_redirect",
        operating_company_id: query.data.operating_company_id,
        redirect_target: url.slice(0, 180),
      },
      "QBO OAuth start redirect generated"
    );
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
    const query = callbackQuerySchema.safeParse(req.query ?? {});
    const rawQuery = (req.query ?? {}) as Record<string, unknown>;
    req.log.info(
      {
        step: "oauth_callback_received",
        hasCode: Boolean(rawQuery.code),
        hasRealmId: Boolean(rawQuery.realmId),
        hasState: Boolean(rawQuery.state),
        error: typeof rawQuery.error === "string" ? rawQuery.error : null,
        headers: {
          referer: req.headers.referer,
          origin: req.headers.origin,
          userAgent: req.headers["user-agent"],
        },
      },
      "OAuth callback received"
    );

    const user = currentAuthUser(req, reply);
    if (!user) return;
    if (user.role !== "Owner") return reply.code(403).send({ error: "forbidden" });

    if (!query.success) {
      req.log.error(
        {
          step: "oauth_callback_validation_error",
          issues: query.error.issues.map((issue) => issue.message),
          hasCode: Boolean(rawQuery.code),
          hasRealmId: Boolean(rawQuery.realmId),
          hasState: Boolean(rawQuery.state),
        },
        "OAuth callback validation failed"
      );
      return reply.redirect(`${frontendBaseUrl()}/admin/forensic-review?qbo_error=invalid_callback_query`);
    }

    if (query.data.error) {
      req.log.error(
        {
          step: "oauth_callback_error_from_intuit",
          error: query.data.error,
          error_description: query.data.error_description ?? null,
        },
        "Intuit returned OAuth error"
      );
      return reply.redirect(
        `${frontendBaseUrl()}/admin/forensic-review?qbo_error=${encodeURIComponent(query.data.error)}`
      );
    }

    const code = query.data.code?.trim();
    const realmId = query.data.realmId?.trim();
    const operatingCompanyId = query.data.state?.trim();
    if (!code || !realmId || !operatingCompanyId) {
      req.log.error(
        {
          step: "oauth_callback_missing_params",
          hasCode: Boolean(code),
          hasRealmId: Boolean(realmId),
          hasState: Boolean(operatingCompanyId),
        },
        "OAuth callback missing required params"
      );
      return reply.redirect(`${frontendBaseUrl()}/admin/forensic-review?qbo_error=missing_params`);
    }

    try {
      req.log.info(
        { step: "token_exchange_start", realmId, operating_company_id: operatingCompanyId },
        "Exchanging auth code for tokens"
      );
      const conn = await exchangeAuthCodeForTokens(code, realmId, operatingCompanyId, user.uuid);
      req.log.info(
        {
          step: "token_exchange_success",
          connectionId: conn?.id ?? null,
          realmId: conn?.realm_id ?? realmId,
          expiresAt: conn?.refresh_token_expires_at ?? null,
        },
        "OAuth tokens saved to DB successfully"
      );

      await withCurrentUser(user.uuid, async (client) => {
        await appendCrudAudit(
          client,
          user.uuid,
          "integrations.qbo.oauth_callback",
          { operating_company_id: operatingCompanyId, realm_id: realmId },
          "info",
          "P5-T6-HOTFIX-QBO-OAUTH"
        );
      });

      const redirectUrl = `${frontendBaseUrl()}/admin/forensic-review?qbo_authorized=true&company_id=${encodeURIComponent(
        operatingCompanyId
      )}`;
      return reply.redirect(redirectUrl);
    } catch (error) {
      const message = String((error as Error)?.message ?? "token_exchange_failed");
      req.log.error(
        {
          step: "token_exchange_failed",
          error: message,
          stack: (error as Error)?.stack,
          intuitStatus: (error as { intuitStatus?: number }).intuitStatus,
          intuitResponse: (error as { intuitResponse?: string }).intuitResponse,
        },
        "Token exchange or DB save failed"
      );
      return reply.redirect(`${frontendBaseUrl()}/admin/forensic-review?qbo_error=${encodeURIComponent(message)}`);
    }
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

