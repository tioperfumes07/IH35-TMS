import { randomUUID } from "node:crypto";
import type { FastifyInstance, FastifyReply } from "fastify";
import { Argon2id } from "oslo/password";
import { z } from "zod";
import { appendCrudAudit } from "../audit/crud-audit.js";
import { withLuciaBypass } from "../auth/db.js";
import { enforceOfficePasswordResetRequestLimits } from "../middleware/rate-limit.js";
import { sendEmail } from "../notifications/email.service.js";
import { officePasswordSchema } from "./office-password-policy.js";

const RESET_GENERIC_OK = "If that email exists, you'll receive a reset link.";

const requestBodySchema = z.object({
  email: z.string().trim().email(),
});

const confirmBodySchema = z.object({
  token: z.string().uuid(),
  new_password: z.string(),
});

function sendValidationError(reply: FastifyReply, error: z.ZodError) {
  return reply.code(400).send({ error: "validation_error", details: error.flatten() });
}

function normalizeEmail(email: string) {
  return email.trim().toLowerCase();
}

function frontendResetConfirmUrl(token: string): string {
  const base = (process.env.FRONTEND_BASE_URL || "https://app.ih35dispatch.com").replace(/\/$/, "");
  return `${base}/login/reset/confirm?token=${encodeURIComponent(token)}`;
}

const argon2id = new Argon2id();

export async function registerPasswordResetRoutes(app: FastifyInstance) {
  app.post("/api/v1/identity/password-reset/request", async (req, reply) => {
    const parsed = requestBodySchema.safeParse(req.body ?? {});
    if (!parsed.success) return sendValidationError(reply, parsed.error);
    const email = normalizeEmail(parsed.data.email);

    if (!(await enforceOfficePasswordResetRequestLimits(req, reply, email))) return;

    const user = await withLuciaBypass(async (client) => {
      const res = await client.query<{
        id: string;
        role: string;
        deactivated_at: string | null;
      }>(
        `
          SELECT id, role, deactivated_at
          FROM identity.users
          WHERE lower(email) = $1
          LIMIT 1
        `,
        [email]
      );
      return res.rows[0] ?? null;
    });

    if (!user || user.deactivated_at || user.role === "Driver") {
      return reply.code(200).send({ ok: true, message: RESET_GENERIC_OK });
    }

    const token = randomUUID();
    const ip = req.ip ?? null;

    await withLuciaBypass(async (client) => {
      await client.query(
        `
          INSERT INTO identity.password_reset_tokens (token, user_id, expires_at, created_ip)
          VALUES ($1::uuid, $2::uuid, now() + interval '1 hour', $3::inet)
        `,
        [token, user.id, ip]
      );
      await appendCrudAudit(
        client,
        user.id,
        "identity.password_reset.requested",
        {
          email,
          token_id: token,
        },
        "info",
        "P7-BLOCK-F-AUTH"
      );
    });

    const confirmUrl = frontendResetConfirmUrl(token);
    try {
      await sendEmail({
        to: email,
        subject: "Reset your IH 35 Dispatch password",
        html: `
          <p>You requested a password reset for your IH 35 Dispatch account.</p>
          <p><a href="${confirmUrl}">Choose a new password</a> (link expires in one hour).</p>
          <p>If you did not request this, you can ignore this email.</p>
        `,
        text: `Reset your password (expires in one hour): ${confirmUrl}`,
        sender: "noreply",
        eventClass: "identity.password_reset.email",
        recipientUserUuid: user.id,
        actorUserId: null,
        tags: [
          { name: "type", value: "office_password_reset" },
          { name: "user_id", value: user.id },
        ],
      });
    } catch {
      // Stay generic to callers.
    }

    return reply.code(200).send({ ok: true, message: RESET_GENERIC_OK });
  });

  app.post("/api/v1/identity/password-reset/confirm", async (req, reply) => {
    const parsed = confirmBodySchema.safeParse(req.body ?? {});
    if (!parsed.success) return sendValidationError(reply, parsed.error);

    const pwParsed = officePasswordSchema.safeParse(parsed.data.new_password);
    if (!pwParsed.success) return sendValidationError(reply, pwParsed.error);

    const token = parsed.data.token;
    const newHash = await argon2id.hash(pwParsed.data);

    const result = await withLuciaBypass(async (client) => {
      const tokRes = await client.query<{
        user_id: string;
        used_at: string | null;
        expires_at: string;
      }>(
        `
          SELECT user_id, used_at, expires_at
          FROM identity.password_reset_tokens
          WHERE token = $1::uuid
          LIMIT 1
        `,
        [token]
      );
      const row = tokRes.rows[0] ?? null;
      if (!row || row.used_at) return { error: "invalid_or_expired_token" as const };
      if (new Date(row.expires_at).getTime() <= Date.now()) return { error: "invalid_or_expired_token" as const };

      const userRes = await client.query<{ id: string; deactivated_at: string | null }>(
        `
          SELECT id, deactivated_at
          FROM identity.users
          WHERE id = $1::uuid
          LIMIT 1
        `,
        [row.user_id]
      );
      const user = userRes.rows[0] ?? null;
      if (!user || user.deactivated_at) return { error: "invalid_or_expired_token" as const };

      await client.query(`UPDATE identity.users SET password_hash = $2 WHERE id = $1::uuid`, [user.id, newHash]);
      await client.query(`UPDATE identity.password_reset_tokens SET used_at = now() WHERE token = $1::uuid`, [token]);

      await appendCrudAudit(
        client,
        user.id,
        "identity.password_reset.completed",
        {
          token_id: token,
        },
        "info",
        "P7-BLOCK-F-AUTH"
      );

      return { ok: true as const };
    });

    if ("error" in result) {
      return reply.code(400).send({ error: result.error });
    }
    return reply.code(200).send({ ok: true });
  });
}
