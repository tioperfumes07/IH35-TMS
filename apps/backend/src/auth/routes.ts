import type { FastifyInstance } from "fastify";
import { generateState, generateCodeVerifier, OAuth2RequestError } from "arctic";
import { lucia, google } from "./lucia.js";
import { withLuciaBypass } from "./db.js";

const STATE_COOKIE = "ih35_oauth_state";
const VERIFIER_COOKIE = "ih35_oauth_verifier";
const COOKIE_MAX_AGE = 60 * 10;

export async function registerAuthRoutes(app: FastifyInstance) {
  app.get("/api/v1/auth/google/login", async (req, reply) => {
    const state = generateState();
    const codeVerifier = generateCodeVerifier();
    const url = await google.createAuthorizationURL(state, codeVerifier, ["openid", "email", "profile"]);
    const secure = process.env.NODE_ENV === "production";
    reply.setCookie(STATE_COOKIE, state, {
      httpOnly: true,
      path: "/",
      sameSite: "lax",
      secure,
      maxAge: COOKIE_MAX_AGE,
    });
    reply.setCookie(VERIFIER_COOKIE, codeVerifier, {
      httpOnly: true,
      path: "/",
      sameSite: "lax",
      secure,
      maxAge: COOKIE_MAX_AGE,
    });
    return reply.redirect(url.toString());
  });

  app.get("/api/v1/auth/google/callback", async (req, reply) => {
    const query = req.query as Record<string, string | undefined>;
    const code = query["code"];
    const state = query["state"];
    const storedState = req.cookies[STATE_COOKIE];
    const codeVerifier = req.cookies[VERIFIER_COOKIE];
    if (!code || !state || !storedState || !codeVerifier || state !== storedState) {
      return reply.code(400).send({ error: "invalid_oauth_state" });
    }
    try {
      const tokens = await google.validateAuthorizationCode(code, codeVerifier);
      const userInfoResp = await fetch("https://openidconnect.googleapis.com/v1/userinfo", {
        headers: { Authorization: "Bearer " + tokens.accessToken() },
      });
      if (!userInfoResp.ok) {
        return reply.code(401).send({ error: "google_userinfo_failed" });
      }
      const userInfo = await userInfoResp.json() as Record<string, unknown>;
      const googleUserId = String(userInfo["sub"] || "");
      const email = String(userInfo["email"] || "").toLowerCase();
      if (!googleUserId || !email) {
        return reply.code(400).send({ error: "missing_userinfo_fields" });
      }
      const userUuid = await findOrCreateUser(email, googleUserId);
      const session = await lucia.createSession(userUuid, {});
      const sessionCookie = lucia.createSessionCookie(session.id);
      reply.setCookie(sessionCookie.name, sessionCookie.value, sessionCookie.attributes);
      reply.clearCookie(STATE_COOKIE, { path: "/" });
      reply.clearCookie(VERIFIER_COOKIE, { path: "/" });
      return reply.redirect("/");
    } catch (err) {
      if (err instanceof OAuth2RequestError) {
        return reply.code(400).send({ error: "oauth_validation_failed" });
      }
      throw err;
    }
  });

  app.post("/api/v1/auth/logout", async (req, reply) => {
    const sessionId = req.cookies["ih35_session"];
    if (sessionId) {
      await lucia.invalidateSession(sessionId);
    }
    reply.clearCookie("ih35_session", { path: "/" });
    return { ok: true };
  });
}

async function findOrCreateUser(email: string, googleUserId: string): Promise<string> {
  return withLuciaBypass(async (client) => {
    const existing = await client.query(
      "SELECT id FROM identity.users WHERE google_user_id = $1 OR email = $2 LIMIT 1",
      [googleUserId, email]
    );
    if (existing.rows.length > 0) {
      const row = existing.rows[0];
      await client.query(
        "UPDATE identity.users SET google_user_id = $1 WHERE id = $2 AND google_user_id IS NULL",
        [googleUserId, row["id"]]
      );
      return String(row["id"]);
    }
    const inserted = await client.query(
      "INSERT INTO identity.users (email, google_user_id, role) VALUES ($1, $2, $3) RETURNING id",
      [email, googleUserId, "Driver"]
    );
    return String(inserted.rows[0]["id"]);
  });
}
