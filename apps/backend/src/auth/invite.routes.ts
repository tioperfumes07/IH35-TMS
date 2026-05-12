import type { FastifyInstance, FastifyReply } from "fastify";
import { z } from "zod";
import { appendCrudAudit } from "../audit/crud-audit.js";
import { withLuciaBypass } from "./db.js";
import { lucia } from "./lucia.js";
import { setLuciaSessionCookie } from "./session-cookie-policy.js";

const redeemInviteBodySchema = z.object({
  token: z.string().trim().min(1),
});

function sendValidationError(reply: FastifyReply, error: z.ZodError) {
  return reply.code(400).send({ error: "validation_error", details: error.flatten() });
}

export async function registerInviteAuthRoutes(app: FastifyInstance) {
  app.post("/api/v1/auth/invite/redeem", async (req, reply) => {
    const parsed = redeemInviteBodySchema.safeParse(req.body ?? {});
    if (!parsed.success) return sendValidationError(reply, parsed.error);

    const token = parsed.data.token;
    const redemption = await withLuciaBypass(async (client) => {
      const inviteRes = await client.query<{
        id: string;
        driver_id: string;
        identity_user_id: string;
        phone: string;
        expires_at: string;
        used_at: string | null;
      }>(
        `
          SELECT id, driver_id, identity_user_id, phone, expires_at, used_at
          FROM identity.driver_invites
          WHERE token = $1
          LIMIT 1
        `,
        [token]
      );

      const invite = inviteRes.rows[0] ?? null;
      if (!invite) return { error: "invalid_or_expired_invite" as const };
      if (invite.used_at) return { error: "invalid_or_expired_invite" as const };

      const expiresAtMs = new Date(invite.expires_at).getTime();
      if (Number.isFinite(expiresAtMs) && expiresAtMs <= Date.now()) {
        await appendCrudAudit(
          client,
          invite.identity_user_id,
          "identity.driver_invite.expired",
          {
            resource_id: invite.id,
            resource_type: "identity.driver_invites",
            driver_id: invite.driver_id,
            identity_user_id: invite.identity_user_id,
            phone: invite.phone,
            expires_at: invite.expires_at,
          },
          "warning",
          "BT-3-DRIVER-ONBOARDING"
        );
        return { error: "invalid_or_expired_invite" as const };
      }

      const userRes = await client.query<{ id: string; email: string | null; role: string }>(
        `
          SELECT id, email, role
          FROM identity.users
          WHERE id = $1
            AND deactivated_at IS NULL
          LIMIT 1
        `,
        [invite.identity_user_id]
      );
      const user = userRes.rows[0] ?? null;
      if (!user) return { error: "invalid_or_expired_invite" as const };

      const session = await lucia.createSession(invite.identity_user_id, {});
      const markUsedRes = await client.query(
        `
          UPDATE identity.driver_invites
          SET used_at = now(), used_by_session_id = $2
          WHERE id = $1
            AND used_at IS NULL
            AND expires_at > now()
          RETURNING id
        `,
        [invite.id, session.id]
      );
      if (markUsedRes.rows.length === 0) {
        await lucia.invalidateSession(session.id);
        return { error: "invalid_or_expired_invite" as const };
      }

      await appendCrudAudit(
        client,
        invite.identity_user_id,
        "identity.driver_invite.redeemed",
        {
          resource_id: invite.id,
          resource_type: "identity.driver_invites",
          driver_id: invite.driver_id,
          identity_user_id: invite.identity_user_id,
          phone: invite.phone,
          used_by_session_id: session.id,
        },
        "info",
        "BT-3-DRIVER-ONBOARDING"
      );

      return { invite, user, session };
    });

    if ("error" in redemption) {
      return reply.code(401).send({ error: "invalid_or_expired_invite" });
    }

    const sessionCookie = lucia.createSessionCookie(redemption.session.id);
    setLuciaSessionCookie(reply, sessionCookie);
    return reply.code(200).send({
      ok: true,
      user: {
        id: redemption.user.id,
        email: redemption.user.email,
        role: redemption.user.role,
      },
      session: { id: redemption.session.id },
      driver_id: redemption.invite.driver_id,
    });
  });
}
