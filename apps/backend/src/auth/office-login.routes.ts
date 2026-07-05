import type { FastifyInstance, FastifyReply } from "fastify";
import { Argon2id } from "oslo/password";
import { z } from "zod";
import { withLuciaBypass } from "./db.js";
import { lucia } from "./lucia.js";
import { createSessionWithLastLogin } from "./session-create.js";
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

// H4-4 (Security): constant-time dummy hash for the not-found / no-password branches.
// We verify the submitted password against THIS real argon2id hash whenever no real
// user hash is available, so that response timing does not reveal whether an account
// exists (the argon2 cost is paid on every code path, success or failure). Computed
// once at module load with the exact library params so `verify()` never throws.
const DUMMY_PASSWORD_HASH_PROMISE = argon2id.hash(
  "office-login-constant-time-dummy-do-not-use-a4f3c1e9"
);

// Every failed office login returns this exact response — identical status + body for
// {not-found, deactivated, no-password, wrong-password, driver-role}. Distinct branches
// leak account/role existence (enumeration oracle), so we collapse them all to one shape.
function sendUniformLoginFailure(reply: FastifyReply) {
  return reply.code(401).send({ error: "invalid_credentials" });
}

export async function registerOfficeLoginRoutes(app: FastifyInstance) {
  app.post("/api/v1/auth/office/email-login", { config: { rateLimit: { max: 5, timeWindow: "1 minute" } } }, async (req, reply) => {
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

    // H4-4: determine the (server-side only) failure reason WITHOUT branching the
    // client response or short-circuiting the argon2 verify. Every path below performs
    // exactly one argon2 verify (against the real hash when present, else the dummy),
    // so timing is constant and the client sees one uniform 401 for all failure modes.
    let failureReason: string | null = null;
    if (!user) failureReason = "user_not_found";
    else if (user.deactivated_at) failureReason = "user_deactivated";
    else if (!user.password_hash) failureReason = "password_not_set";
    else if (user.role === "Driver") failureReason = "driver_role";

    const hashToVerify =
      user && user.password_hash ? user.password_hash : await DUMMY_PASSWORD_HASH_PROMISE;
    const passwordOk = await argon2id.verify(hashToVerify, parsed.data.password);
    if (failureReason === null && !passwordOk) failureReason = "invalid_password";

    if (failureReason !== null) {
      // Audit the true reason server-side (not leaked to the client). The not-found case
      // is already audited above during the lookup; here we cover the user-bearing cases.
      if (user) {
        await withLuciaBypass(async (client) => {
          await appendCrudAudit(
            client,
            user.id,
            "auth.office_email_login.failed",
            {
              email,
              reason: failureReason,
              route: "/api/v1/auth/office/email-login",
            },
            "warning",
            "P7-BLOCK-F-AUTH"
          );
        });
      }
      return sendUniformLoginFailure(reply);
    }

    // Unreachable when failureReason === null (a missing user always sets it), but this
    // narrows `user` to non-null for the success path and keeps failures uniform.
    if (!user) return sendUniformLoginFailure(reply);

    const session = await createSessionWithLastLogin(user.id, {});
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
