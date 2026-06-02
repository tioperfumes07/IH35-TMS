import { randomBytes, randomUUID } from "node:crypto";
import type { FastifyInstance, FastifyReply } from "fastify";
import { Argon2id } from "oslo/password";
import { z } from "zod";
import { withLuciaBypass } from "../auth/db.js";
import { requireAuth } from "../auth/session-middleware.js";
import { officePasswordSchema } from "../identity/office-password-policy.js";
import { sendEmail } from "../notifications/email.service.js";
import {
  PORTAL_SESSION_COOKIE,
  PORTAL_SESSION_TTL_MS,
  clearPortalSessionCookie,
  portalSessionCookieOptions,
  rejectInternalSessionOnPortalRoute,
} from "./portal-session.middleware.js";

const loginBodySchema = z.object({
  email: z.string().trim().email(),
  password: z.string().min(1),
});

const forgotBodySchema = z.object({
  email: z.string().trim().email(),
});

const resetBodySchema = z.object({
  token: z.string().uuid(),
  new_password: z.string(),
});

const RESET_GENERIC_OK = "If that email exists, you'll receive a reset link.";

function sendValidationError(reply: FastifyReply, error: z.ZodError) {
  return reply.code(400).send({ error: "validation_error", details: error.flatten() });
}

function normalizeEmail(email: string) {
  return email.trim().toLowerCase();
}

function getFrontendBaseUrl(): string {
  return (process.env.FRONTEND_BASE_URL || "https://app.ih35dispatch.com").replace(/\/$/, "");
}

const argon2id = new Argon2id();

async function createPortalSession(portalUserId: string): Promise<string> {
  const sessionId = randomBytes(32).toString("hex");
  const expiresAt = new Date(Date.now() + PORTAL_SESSION_TTL_MS).toISOString();
  await withLuciaBypass(async (client) => {
    await client.query(
      `
        INSERT INTO shipper_portal.portal_sessions (id, portal_user_id, expires_at)
        VALUES ($1, $2::uuid, $3::timestamptz)
      `,
      [sessionId, portalUserId, expiresAt]
    );
    await client.query(
      `UPDATE shipper_portal.portal_users SET last_login_at = NOW() WHERE id = $1::uuid`,
      [portalUserId]
    );
  });
  return sessionId;
}

export async function registerPortalAuthRoutes(app: FastifyInstance) {
  app.post("/api/v1/portal/auth/login", async (req, reply) => {
    if (rejectInternalSessionOnPortalRoute(req, reply)) return;
    const parsed = loginBodySchema.safeParse(req.body ?? {});
    if (!parsed.success) return sendValidationError(reply, parsed.error);

    const email = normalizeEmail(parsed.data.email);
    const user = await withLuciaBypass(async (client) => {
      const res = await client.query<{
        id: string;
        password_hash: string;
        active: boolean;
        archived_at: string | null;
      }>(
        `
          SELECT id::text, password_hash, active, archived_at::text
          FROM shipper_portal.portal_users
          WHERE lower(email) = $1
          LIMIT 1
        `,
        [email]
      );
      return res.rows[0] ?? null;
    });

    if (!user || !user.active || user.archived_at) {
      return reply.code(401).send({ error: "invalid_credentials" });
    }

    const ok = await argon2id.verify(user.password_hash, parsed.data.password);
    if (!ok) {
      return reply.code(401).send({ error: "invalid_credentials" });
    }

    const sessionId = await createPortalSession(user.id);
    reply.setCookie(PORTAL_SESSION_COOKIE, sessionId, portalSessionCookieOptions(Math.floor(PORTAL_SESSION_TTL_MS / 1000)));
    return reply.code(200).send({ ok: true });
  });

  app.post("/api/v1/portal/auth/logout", async (req, reply) => {
    const sessionId = req.cookies[PORTAL_SESSION_COOKIE];
    if (sessionId) {
      await withLuciaBypass(async (client) => {
        await client.query(`DELETE FROM shipper_portal.portal_sessions WHERE id = $1`, [sessionId]);
      });
    }
    clearPortalSessionCookie(reply);
    return reply.code(200).send({ ok: true });
  });

  app.post("/api/v1/portal/auth/forgot-password", async (req, reply) => {
    const parsed = forgotBodySchema.safeParse(req.body ?? {});
    if (!parsed.success) return sendValidationError(reply, parsed.error);
    const email = normalizeEmail(parsed.data.email);

    const user = await withLuciaBypass(async (client) => {
      const res = await client.query<{ id: string }>(
        `
          SELECT id::text
          FROM shipper_portal.portal_users
          WHERE lower(email) = $1
            AND active = TRUE
            AND archived_at IS NULL
          LIMIT 1
        `,
        [email]
      );
      return res.rows[0] ?? null;
    });

    if (user) {
      const token = randomUUID();
      const ip = req.ip ?? null;
      await withLuciaBypass(async (client) => {
        await client.query(`DELETE FROM shipper_portal.portal_password_reset_tokens WHERE portal_user_id = $1::uuid`, [user.id]);
        await client.query(
          `
            INSERT INTO shipper_portal.portal_password_reset_tokens (token, portal_user_id, expires_at, created_ip)
            VALUES ($1::uuid, $2::uuid, NOW() + interval '1 hour', $3::inet)
          `,
          [token, user.id, ip]
        );
      });
      const confirmUrl = `${getFrontendBaseUrl()}/portal/reset-password?token=${encodeURIComponent(token)}`;
      try {
        await sendEmail({
          to: email,
          subject: "Reset your IH 35 shipper portal password",
          html: `<p><a href="${confirmUrl}">Choose a new password</a> (expires in one hour).</p>`,
          text: `Reset your shipper portal password: ${confirmUrl}`,
          sender: "noreply",
          eventClass: "shipper_portal.password_reset",
          recipientUserUuid: null,
          actorUserId: null,
          tags: [{ name: "type", value: "portal_password_reset" }],
        });
      } catch {
        // generic response
      }
    }

    return reply.code(200).send({ ok: true, message: RESET_GENERIC_OK });
  });

  app.post("/api/v1/portal/auth/reset-password", async (req, reply) => {
    const parsed = resetBodySchema.safeParse(req.body ?? {});
    if (!parsed.success) return sendValidationError(reply, parsed.error);

    const passwordParsed = officePasswordSchema.safeParse(parsed.data.new_password);
    if (!passwordParsed.success) {
      return reply.code(400).send({ error: "validation_error", message: passwordParsed.error.issues[0]?.message ?? "invalid_password" });
    }

    const passwordHash = await argon2id.hash(parsed.data.new_password);
    const updated = await withLuciaBypass(async (client) => {
      const tokenRes = await client.query<{ portal_user_id: string }>(
        `
          SELECT portal_user_id::text
          FROM shipper_portal.portal_password_reset_tokens
          WHERE token = $1::uuid
            AND expires_at > NOW()
          LIMIT 1
        `,
        [parsed.data.token]
      );
      const row = tokenRes.rows[0];
      if (!row) return false;
      await client.query(
        `UPDATE shipper_portal.portal_users SET password_hash = $2 WHERE id = $1::uuid`,
        [row.portal_user_id, passwordHash]
      );
      await client.query(`DELETE FROM shipper_portal.portal_password_reset_tokens WHERE portal_user_id = $1::uuid`, [row.portal_user_id]);
      await client.query(`DELETE FROM shipper_portal.portal_sessions WHERE portal_user_id = $1::uuid`, [row.portal_user_id]);
      return true;
    });

    if (!updated) return reply.code(400).send({ error: "invalid_or_expired_token" });
    return reply.code(200).send({ ok: true });
  });
}

export async function registerShipperPortalRoutes(app: FastifyInstance) {
  const { registerPortalApiRoutes } = await import("./portal-api.routes.js");
  const { registerPortalUsersAdminRoutes } = await import("./portal-users-admin.routes.js");
  await registerPortalAuthRoutes(app);
  await registerPortalApiRoutes(app);
  await registerPortalUsersAdminRoutes(app);
}
