import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { randomInt } from "crypto";
import { z } from "zod";
import { appendCrudAudit } from "../audit/crud-audit.js";
import { withLuciaBypass } from "./db.js";
import { lucia } from "./lucia.js";
import { setLuciaSessionCookie } from "./session-cookie-policy.js";
import { sendEmailCode } from "./email-send.js";

const startBodySchema = z.object({
  email: z.string().trim().email(),
});

const verifyBodySchema = z.object({
  email: z.string().trim().email(),
  code: z.string().regex(/^\d{6}$/),
});

const GENERIC_MESSAGE = "If this email is registered, a code was sent.";

function sendValidationError(reply: FastifyReply, error: z.ZodError) {
  return reply.code(400).send({ error: "validation_error", details: error.flatten() });
}

function normalizeEmail(email: string) {
  return email.trim().toLowerCase();
}

function readSingleHeader(req: FastifyRequest, headerName: string): string {
  const raw = req.headers[headerName];
  if (Array.isArray(raw)) return raw[0]?.trim() ?? "";
  return typeof raw === "string" ? raw.trim() : "";
}

function generateCode() {
  return String(randomInt(0, 1_000_000)).padStart(6, "0");
}

export async function registerEmailAuthRoutes(app: FastifyInstance) {
  app.post("/api/v1/auth/email/start", async (req, reply) => {
    const parsed = startBodySchema.safeParse(req.body ?? {});
    if (!parsed.success) return sendValidationError(reply, parsed.error);
    const email = normalizeEmail(parsed.data.email);

    const user = await withLuciaBypass(async (client) => {
      const res = await client.query<{ id: string; deactivated_at: string | null }>(
        `SELECT id, deactivated_at FROM identity.users WHERE lower(email) = $1 LIMIT 1`,
        [email]
      );
      return res.rows[0] ?? null;
    });

    if (!user || user.deactivated_at) {
      return reply.code(200).send({ ok: true, message: GENERIC_MESSAGE });
    }

    const code = generateCode();
    await withLuciaBypass(async (client) => {
      await client.query(
        `
          INSERT INTO identity.email_verifications (email, code, expires_at, user_agent, ip_address)
          VALUES ($1, $2, now() + interval '10 minutes', $3, $4)
        `,
        [email, code, req.headers["user-agent"] ?? null, req.ip ?? null]
      );
      await client.query(
        `
          INSERT INTO outbox.events (event_type, payload, next_retry_at)
          VALUES ($1, $2::jsonb, now())
        `,
        [
          "auth.email.verification_started",
          JSON.stringify({
            email,
            source: "auth.email.start",
          }),
        ]
      );
      await appendCrudAudit(
        client,
        user.id,
        "auth.email.verification_started",
        {
          email,
          user_id: user.id,
        },
        "info",
        "BT-1-AUTH-DRIVER"
      );
    });

    void sendEmailCode(email, code, user.id).catch(() => undefined);
    return reply.code(200).send({ ok: true, message: GENERIC_MESSAGE });
  });

  app.post("/api/v1/auth/email/verify", async (req, reply) => {
    const parsed = verifyBodySchema.safeParse(req.body ?? {});
    if (!parsed.success) return sendValidationError(reply, parsed.error);
    const email = normalizeEmail(parsed.data.email);

    const bypassSecret = process.env.AUTH_EMAIL_TEST_BYPASS_SECRET?.trim() ?? "";
    const bypassHeader = readSingleHeader(req, "x-ih35-auth-test-bypass");
    const bypassCodeExpected = process.env.AUTH_EMAIL_TEST_BYPASS_CODE?.trim() ?? "000000";
    const bypassActive =
      bypassSecret.length > 0 && bypassHeader === bypassSecret && parsed.data.code === bypassCodeExpected;

    const verificationResult = await withLuciaBypass(async (client) => {
      if (bypassActive) {
        const userRes = await client.query<{ id: string; email: string | null; role: string; deactivated_at: string | null }>(
          `
          SELECT id, email, role, deactivated_at
          FROM identity.users
          WHERE lower(email) = $1
          LIMIT 1
        `,
          [email]
        );
        const user = userRes.rows[0] ?? null;
        if (!user) return { error: "invalid_code" as const };
        if (user.deactivated_at) return { error: "user_deactivated" as const };

        const driverRes = await client.query<{ id: string }>(
          `
          SELECT id
          FROM mdata.drivers
          WHERE identity_user_id = $1
            AND deactivated_at IS NULL
          LIMIT 1
        `,
          [user.id]
        );
        const driver = driverRes.rows[0] ?? null;
        if (!driver) return { error: "drivers_only" as const };

        await appendCrudAudit(
          client,
          user.id,
          "auth.email.verified_smoke_bypass",
          {
            email,
            user_id: user.id,
            role: user.role,
            driver_id: driver.id,
            bypass_header_present: true,
          },
          "info",
          "BT-1-AUTH-DRIVER"
        );

        return { user };
      }

      const verificationRes = await client.query<{ id: string }>(
        `
          SELECT id
          FROM identity.email_verifications
          WHERE lower(email) = $1
            AND code = $2
            AND consumed_at IS NULL
            AND expires_at > now()
          ORDER BY created_at DESC
          LIMIT 1
        `,
        [email, parsed.data.code]
      );
      const verification = verificationRes.rows[0] ?? null;
      if (!verification) return { error: "invalid_code" as const };

      const userRes = await client.query<{ id: string; email: string | null; role: string; deactivated_at: string | null }>(
        `
          SELECT id, email, role, deactivated_at
          FROM identity.users
          WHERE lower(email) = $1
          LIMIT 1
        `,
        [email]
      );
      const user = userRes.rows[0] ?? null;
      if (!user) return { error: "invalid_code" as const };
      if (user.deactivated_at) return { error: "user_deactivated" as const };

      const driverRes = await client.query<{ id: string }>(
        `
          SELECT id
          FROM mdata.drivers
          WHERE identity_user_id = $1
            AND deactivated_at IS NULL
          LIMIT 1
        `,
        [user.id]
      );
      const driver = driverRes.rows[0] ?? null;
      if (!driver) return { error: "drivers_only" as const };

      await client.query(`UPDATE identity.email_verifications SET consumed_at = now() WHERE id = $1`, [verification.id]);
      await appendCrudAudit(
        client,
        user.id,
        "auth.email.verified",
        {
          email,
          user_id: user.id,
          role: user.role,
          driver_id: driver.id,
        },
        "info",
        "BT-1-AUTH-DRIVER"
      );
      return { user };
    });

    if ("error" in verificationResult) {
      if (verificationResult.error === "invalid_code") return reply.code(401).send({ error: "invalid_code" });
      if (verificationResult.error === "user_deactivated") return reply.code(403).send({ error: "user_deactivated" });
      return reply.code(403).send({
        error: "drivers_only",
        message: "This app is for drivers only. Office staff please use app.ih35dispatch.com",
      });
    }

    const session = await lucia.createSession(verificationResult.user.id, {});
    const sessionCookie = lucia.createSessionCookie(session.id);
    setLuciaSessionCookie(reply, sessionCookie);
    return reply.code(200).send({
      ok: true,
      user: {
        id: verificationResult.user.id,
        email: verificationResult.user.email,
        role: verificationResult.user.role,
      },
      session: { id: session.id },
    });
  });
}
