import type { FastifyInstance, FastifyReply } from "fastify";
import { z } from "zod";
import { appendCrudAudit } from "../audit/crud-audit.js";
import { withLuciaBypass } from "./db.js";
import { createSession, createSessionCookie } from "./session-provider.js";
import { touchUserLastLoginAt } from "./session-create.js";
import { setLuciaSessionCookie } from "./session-cookie-policy.js";
import { hashInviteToken } from "./invite-token.js";

const redeemInviteBodySchema = z.object({
  token: z.string().trim().min(1),
});

function sendValidationError(reply: FastifyReply, error: z.ZodError) {
  return reply.code(400).send({ error: "validation_error", details: error.flatten() });
}

export async function registerInviteAuthRoutes(app: FastifyInstance) {
  app.post("/api/v1/auth/invite/redeem", { config: { rateLimit: { max: 10, timeWindow: "1 minute" } } }, async (req, reply) => {
    const parsed = redeemInviteBodySchema.safeParse(req.body ?? {});
    if (!parsed.success) return sendValidationError(reply, parsed.error);

    const token = parsed.data.token;
    // B5 (ROUND 203/206) -- the stored token column is a SHA-256 hash of the raw token the driver
    // actually holds (invite-token.ts); the raw token is never persisted. Hash the incoming value
    // the same way before comparing, so a DB read/backup leak of this table exposes no redeemable
    // secret.
    const tokenHash = hashInviteToken(token);

    // B5 (ROUND 203/206) -- PHASE 1: validate + claim the token, in its OWN transaction that
    // commits (or rolls back) completely before phase 2 ever starts. createSession commits on its
    // own connection and does NOT participate in / roll back with a withLuciaBypass transaction --
    // previously the session was created first, inside the SAME transaction as the CAS claim and
    // the audit call after it; if that audit call (or anything else downstream) threw, the whole
    // callback threw, the CAS's used_at write rolled back to NULL, but the already-committed
    // session survived -- a live session AND a still-"unused" token, replayable for a second
    // session. Splitting into two separate, sequential withLuciaBypass calls means phase 1's claim
    // is durable and final before phase 2 (session + audit) even begins, so a phase-2 failure can
    // no longer un-claim the token. Worst case now: "token consumed, no session granted" (the
    // driver needs a new invite) -- never a replayable token.
    const claim = await withLuciaBypass(async (client) => {
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
        [tokenHash]
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

      const markUsedRes = await client.query<{ id: string }>(
        `
          UPDATE identity.driver_invites
          SET used_at = now()
          WHERE id = $1
            AND used_at IS NULL
            AND expires_at > now()
          RETURNING id
        `,
        [invite.id]
      );
      if (markUsedRes.rows.length === 0) {
        return { error: "invalid_or_expired_invite" as const };
      }

      return { invite, user };
    });

    if ("error" in claim) {
      return reply.code(401).send({ error: "invalid_or_expired_invite" });
    }

    // PHASE 2 -- the token is already durably claimed. A failure here never re-exposes it.
    const { invite, user } = claim;
    const session = await createSession(invite.identity_user_id, {});
    const redemption = await withLuciaBypass(async (client) => {
      await client.query(
        `UPDATE identity.driver_invites SET used_by_session_id = $2 WHERE id = $1`,
        [invite.id, session.id]
      );
      await touchUserLastLoginAt(client, invite.identity_user_id);
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

    const sessionCookie = createSessionCookie(redemption.session.id);
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
