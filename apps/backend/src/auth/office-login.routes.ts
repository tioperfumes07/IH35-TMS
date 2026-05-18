import type { FastifyInstance, FastifyReply } from "fastify";
import { Argon2id } from "oslo/password";
import { z } from "zod";
import { withLuciaBypass } from "./db.js";
import { lucia } from "./lucia.js";
import { setLuciaSessionCookie } from "./session-cookie-policy.js";
import { enforceOfficePasswordLoginLimits } from "../middleware/rate-limit.js";
import { appendCrudAudit } from "../audit/crud-audit.js";

const loginBodySchema = z.object({
  email: z.string().trim().email(),
  password: z.string().min(1),
});

function sendValidationError(reply: FastifyReply, error: z.ZodError) {
  return reply.code(400).send({ error: "validation_error", details: error.flatten() });
}

function normalizeEmail(email: string) {
  return email.trim().toLowerCase();
}

const argon2id = new Argon2id();

export async function registerOfficeLoginRoutes(app: FastifyInstance) {
  app.post("/api/v1/auth/office/email-login", async (req, reply) => {
    const parsed = loginBodySchema.safeParse(req.body ?? {});
    if (!parsed.success) return sendValidationError(reply, parsed.error);

    const email = normalizeEmail(parsed.data.email);
    if (!(await enforceOfficePasswordLoginLimits(req, reply, email))) return;

    const user = await withLuciaBypass(async (client) => {
      const res = await client.query<{
        id: string;
        role: string;
        email: string | null;
        password_hash: string | null;
        deactivated_at: string | null;
      }>(
        `
          SELECT id, role, email, password_hash, deactivated_at
          FROM identity.users
          WHERE lower(email) = $1
          LIMIT 1
        `,
        [email]
      );
      const row = res.rows[0] ?? null;
      if (!row) {
        await client.query(`SELECT audit.append_event($1, $2, $3::jsonb, NULL::uuid, $4)`, [
          "auth.office_email_login.failed",
          "warning",
          JSON.stringify({
            email,
            reason: "user_not_found",
            route: "/api/v1/auth/office/email-login",
          }),
          "P7-BLOCK-F-AUTH",
        ]);
      }
      return row;
    });

    if (!user || user.deactivated_at || !user.password_hash) {
      if (user) {
        await withLuciaBypass(async (client) => {
          await appendCrudAudit(
            client,
            user.id,
            "auth.office_email_login.failed",
            {
              email,
              reason: user.deactivated_at ? "user_deactivated" : "password_not_set",
              route: "/api/v1/auth/office/email-login",
            },
            "warning",
            "P7-BLOCK-F-AUTH"
          );
        });
      }
      return reply.code(401).send({ error: "invalid_credentials" });
    }

    if (user.role === "Driver") {
      return reply.code(403).send({
        error: "use_driver_portal",
        message: "Drivers sign in from the driver app. Office staff use this page.",
      });
    }

    const ok = await argon2id.verify(user.password_hash, parsed.data.password);
    if (!ok) {
      await withLuciaBypass(async (client) => {
        await appendCrudAudit(
          client,
          user.id,
          "auth.office_email_login.failed",
          {
            email,
            reason: "invalid_password",
            route: "/api/v1/auth/office/email-login",
          },
          "warning",
          "P7-BLOCK-F-AUTH"
        );
      });
      return reply.code(401).send({ error: "invalid_credentials" });
    }

    const session = await lucia.createSession(user.id, {});
    const sessionCookie = lucia.createSessionCookie(session.id);
    setLuciaSessionCookie(reply, sessionCookie);
    await withLuciaBypass(async (client) => {
      await appendCrudAudit(
        client,
        user.id,
        "auth.office_email_login.succeeded",
        {
          email,
          session_id: session.id,
          route: "/api/v1/auth/office/email-login",
        },
        "info",
        "P7-BLOCK-F-AUTH"
      );
    });

    return reply.code(200).send({
      ok: true,
      user: {
        id: user.id,
        email: user.email,
        role: user.role,
      },
      session: { id: session.id },
    });
  });
}
