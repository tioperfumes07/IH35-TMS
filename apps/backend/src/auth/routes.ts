import type { FastifyInstance } from "fastify";
import { generateState, generateCodeVerifier, OAuth2RequestError } from "arctic";
import { lucia, getGoogleOAuthClient } from "./lucia.js";
import { withLuciaBypass } from "./db.js";
import { oauthPkceCookieOptions, setLuciaSessionCookie, clearSessionCookieOptions } from "./session-cookie-policy.js";

const STATE_COOKIE = "ih35_oauth_state";
const VERIFIER_COOKIE = "ih35_oauth_verifier";
const COOKIE_MAX_AGE = 60 * 10;
const DEFAULT_FRONTEND_BASE_URL = "https://ih35-tms-web.onrender.com";

function allowedReturnUrls(): string[] {
  const origins =
    process.env.CORS_ALLOWED_ORIGINS ??
    "https://ih35-tms-web.onrender.com,https://ih35-tms-driver.onrender.com,https://app.ih35dispatch.com,http://localhost:5173,http://localhost:5174";
  return origins
    .split(",")
    .map((value) => value.trim().replace(/\/$/, ""))
    .filter(Boolean);
}

type PackedState = {
  state: string;
  returnTo: string;
};

function frontendBaseUrl(): string {
  return (process.env.FRONTEND_BASE_URL || DEFAULT_FRONTEND_BASE_URL).replace(/\/$/, "");
}

function validateReturnTo(returnTo: string | undefined): string {
  const fallback = frontendBaseUrl();
  if (!returnTo) return fallback;
  const normalized = returnTo.trim().replace(/\/$/, "");
  if (!normalized) return fallback;
  if (!allowedReturnUrls().includes(normalized)) return fallback;
  return normalized;
}

function encodeOAuthState(payload: PackedState): string {
  return Buffer.from(JSON.stringify(payload), "utf8").toString("base64url");
}

function decodeOAuthState(encoded: string): PackedState | null {
  try {
    const decoded = Buffer.from(encoded, "base64url").toString("utf8");
    const parsed = JSON.parse(decoded) as Partial<PackedState>;
    if (typeof parsed.state !== "string" || typeof parsed.returnTo !== "string") {
      return null;
    }
    return { state: parsed.state, returnTo: parsed.returnTo };
  } catch {
    return null;
  }
}

export async function registerAuthRoutes(app: FastifyInstance) {
  app.get("/api/v1/auth/google/login", async (req, reply) => {
    try {
      const google = getGoogleOAuthClient();
      if (!google) {
        return reply.code(503).send({ error: "google_oauth_not_configured" });
      }
      const query = req.query as Record<string, string | undefined>;
      const state = generateState();
      const returnTo = validateReturnTo(query["returnTo"]);
      const packedState = encodeOAuthState({ state, returnTo });
      const codeVerifier = generateCodeVerifier();
      const url = await google.createAuthorizationURL(packedState, codeVerifier, ["openid", "email", "profile"]);
      const pkce = oauthPkceCookieOptions(COOKIE_MAX_AGE);
      reply.setCookie(STATE_COOKIE, state, pkce);
      reply.setCookie(VERIFIER_COOKIE, codeVerifier, pkce);
      return reply.redirect(url.toString());
    } catch (err) {
      const statusCode = typeof err === "object" && err !== null ? (err as { statusCode?: unknown }).statusCode : undefined;
      if (statusCode === 503) {
        return reply.code(503).send({
          statusCode: 503,
          error: "google_oauth_not_configured",
          message: "Google OAuth is not configured",
        });
      }
      throw err;
    }
  });

  app.get("/api/v1/auth/google/callback", async (req, reply) => {
    try {
      const google = getGoogleOAuthClient();
      if (!google) {
        return reply.code(503).send({ error: "google_oauth_not_configured" });
      }
      const query = req.query as Record<string, string | undefined>;
      const code = query["code"];
      const packedState = query["state"];
      const parsedState = packedState ? decodeOAuthState(packedState) : null;
      const storedState = req.cookies[STATE_COOKIE];
      const codeVerifier = req.cookies[VERIFIER_COOKIE];
      if (!code || !parsedState || !storedState || !codeVerifier || parsedState.state !== storedState) {
        return reply.code(400).send({ error: "invalid_oauth_state" });
      }
      const returnTo = validateReturnTo(parsedState.returnTo);
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
        setLuciaSessionCookie(reply, sessionCookie);
        reply.clearCookie(STATE_COOKIE, { path: "/" });
        reply.clearCookie(VERIFIER_COOKIE, { path: "/" });
        return reply.redirect(`${returnTo}/home`);
      } catch (err) {
        if (err instanceof OAuth2RequestError) {
          return reply.code(400).send({ error: "oauth_validation_failed" });
        }
        throw err;
      }
    } catch (err) {
      const statusCode = typeof err === "object" && err !== null ? (err as { statusCode?: unknown }).statusCode : undefined;
      if (statusCode === 503) {
        return reply.code(503).send({
          statusCode: 503,
          error: "google_oauth_not_configured",
          message: "Google OAuth is not configured",
        });
      }
      throw err;
    }
  });

  app.get("/api/v1/auth/me", async (req, reply) => {
    if (!req.user || !req.session) {
      return reply.code(401).send({ error: "unauthorized" });
    }
    return {
      user: req.user,
      session: req.session,
    };
  });

  app.post("/api/v1/auth/logout", async (req, reply) => {
    const query = req.query as Record<string, string | undefined>;
    const returnTo = validateReturnTo(query["returnTo"]);
    const sessionId = req.cookies["ih35_session"];
    if (sessionId) {
      await lucia.invalidateSession(sessionId);
    }
    reply.clearCookie("ih35_session", clearSessionCookieOptions());
    const origin = String(req.headers.origin || "");
    const acceptsHtml = String(req.headers.accept || "").includes("text/html");
    const wantsRedirect = acceptsHtml || Boolean(query["returnTo"]) || origin === returnTo || query["redirect"] === "true";
    if (wantsRedirect) {
      return reply.redirect(`${returnTo}/login`);
    }
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
