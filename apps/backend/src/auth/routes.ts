import type { FastifyInstance } from "fastify";
import { generateState, generateCodeVerifier, OAuth2RequestError } from "arctic";
import { lucia, google } from "./lucia.js";
import { pool } from "./db.js";

const STATE_COOKIE = "ih35_oauth_state";
const VERIFIER_COOKIE = "ih35_oauth_verifier";
const COOKIE_MAX_AGE = 60 * 10;

export async function registerAuthRoutes(app: FastifyInstance) {
  app.get("/api/v1/auth/google/login", async (req, reply) => {
    const state = generateState();
    const codeVerifier = generateCodeVerifier();
    const url = await google.createAuthorizationURL(state, codeVerifier, ["openid", "email", "profile"]);
    reply.header("Set-Cookie", [
      buildCookie(STATE_COOKIE, state, COOKIE_MAX_AGE),
      buildCookie(VERIFIER_COOKIE, codeVerifier, COOKIE_MAX_AGE),
    ]);
    return reply.redirect(url.toString());
  });

  app.get("/api/v1/auth/google/callback", async (req, reply) => {
    const query = req.query as Record<string, string | undefined>;
    const code = query["code"];
    const state = query["state"];
    const cookieHeader = (req.headers["cookie"] as string | undefined) || "";
    const cookies = parseCookies(cookieHeader);
    const storedState = cookies[STATE_COOKIE];
    const codeVerifier = cookies[VERIFIER_COOKIE];
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
      reply.header("Set-Cookie", [
        sessionCookie.serialize(),
        buildCookie(STATE_COOKIE, "", 0),
        buildCookie(VERIFIER_COOKIE, "", 0),
      ]);
      return reply.redirect("/");
    } catch (err) {
      if (err instanceof OAuth2RequestError) {
        return reply.code(400).send({ error: "oauth_validation_failed" });
      }
      throw err;
    }
  });

  app.post("/api/v1/auth/logout", async (req, reply) => {
    const cookieHeader = (req.headers["cookie"] as string | undefined) || "";
    const cookies = parseCookies(cookieHeader);
    const sessionId = cookies["ih35_session"];
    if (sessionId) {
      await lucia.invalidateSession(sessionId);
    }
    const blank = lucia.createBlankSessionCookie();
    reply.header("Set-Cookie", blank.serialize());
    return { ok: true };
  });
}

function buildCookie(name: string, value: string, maxAge: number): string {
  const flags = process.env.NODE_ENV === "production" ? "; Secure" : "";
  return name + "=" + value + "; HttpOnly; Path=/; Max-Age=" + String(maxAge) + "; SameSite=Lax" + flags;
}

function parseCookies(header: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const part of header.split(";")) {
    const trimmed = part.trim();
    if (!trimmed) continue;
    const eqIdx = trimmed.indexOf("=");
    if (eqIdx === -1) continue;
    const k = trimmed.substring(0, eqIdx);
    const v = trimmed.substring(eqIdx + 1);
    out[k] = decodeURIComponent(v);
  }
  return out;
}

async function findOrCreateUser(email: string, googleUserId: string): Promise<string> {
  const existing = await pool.query(
    "SELECT uuid FROM identity.users WHERE google_user_id = $1 OR email = $2 LIMIT 1",
    [googleUserId, email]
  );
  if (existing.rows.length > 0) {
    const row = existing.rows[0];
    await pool.query(
      "UPDATE identity.users SET google_user_id = $1 WHERE uuid = $2 AND google_user_id IS NULL",
      [googleUserId, row["uuid"]]
    );
    return String(row["uuid"]);
  }
  const inserted = await pool.query(
    "INSERT INTO identity.users (email, google_user_id, role) VALUES ($1, $2, $3) RETURNING uuid",
    [email, googleUserId, "Driver"]
  );
  return String(inserted.rows[0]["uuid"]);
}
