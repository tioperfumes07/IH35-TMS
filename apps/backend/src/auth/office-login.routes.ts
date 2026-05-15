import type { FastifyInstance, FastifyReply } from "fastify";
import { Argon2id } from "oslo/password";
import { z } from "zod";
import { withLuciaBypass } from "./db.js";
import { lucia } from "./lucia.js";
import { setLuciaSessionCookie } from "./session-cookie-policy.js";
import { enforceOfficePasswordLoginIpLimits } from "../middleware/rate-limit.js";

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

    if (!(await enforceOfficePasswordLoginIpLimits(req, reply))) return;

    const email = normalizeEmail(parsed.data.email);

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
      return res.rows[0] ?? null;
    });

    if (!user || user.deactivated_at || !user.password_hash) {
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
      return reply.code(401).send({ error: "invalid_credentials" });
    }

    const session = await lucia.createSession(user.id, {});
    const sessionCookie = lucia.createSessionCookie(session.id);
    setLuciaSessionCookie(reply, sessionCookie);

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
