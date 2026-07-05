/**
 * DEPRECATION NOTICE (H2-3).
 *
 * `lucia` and `@lucia-auth/adapter-postgresql` are END-OF-MAINTENANCE. The
 * upstream project is frozen (no further releases, no security patches) and its
 * author has recommended migrating off the library. We have therefore PINNED
 * both packages to their last stable releases (`lucia@3.2.2`,
 * `@lucia-auth/adapter-postgresql@3.1.2` — exact, no caret) so no floating
 * upgrade can surprise us, and we consume Lucia through a single seam
 * (`./session-provider.ts`) so the eventual swap to an in-house session layer
 * is a localized change.
 *
 * DO NOT add new imports of `lucia` outside this file. Route all session
 * create / validate / invalidate / cookie work through `./session-provider.ts`.
 * Full plan + touchpoint inventory + block breakdown:
 *   docs/specs/repairs/REPAIR-H2-3-LUCIA-DEPRECATION-DESIGN.md
 */
import { Lucia } from "lucia";
import { NodePostgresAdapter } from "@lucia-auth/adapter-postgresql";
import { Google } from "arctic";
import { luciaPool } from "./db.js";
import { luciaSessionCookieBaseAttributes } from "./session-cookie-policy.js";

const adapter = new NodePostgresAdapter(luciaPool, {
  user: "identity.users",
  session: "identity.sessions",
});

export const lucia = new Lucia(adapter, {
  sessionCookie: {
    name: "ih35_session",
    expires: false,
    attributes: luciaSessionCookieBaseAttributes(),
  },
  getUserAttributes: (attrs) => {
    return {
      email: attrs["email"],
      role: attrs["role"],
      googleUserId: attrs["google_user_id"],
    };
  },
});

type GoogleOAuthConfig = {
  clientId: string;
  clientSecret: string;
  redirectUri: string;
};

export class ConfigError extends Error {
  readonly statusCode: number;

  constructor(statusCode: number, message: string) {
    super(message);
    this.name = "ConfigError";
    this.statusCode = statusCode;
  }
}

let cachedGoogleClient: Google | undefined;
let missingGoogleOAuthConfig = false;

function throwGoogleOAuthNotConfigured(): never {
  const err: any = new Error("Google OAuth is not configured");
  err.statusCode = 503;
  err.error = "google_oauth_not_configured";
  throw err;
}

function getGoogleClientId(): string {
  const clientId = process.env.OAUTH_GOOGLE_CLIENT_ID?.trim();
  if (!clientId) {
    throwGoogleOAuthNotConfigured();
  }
  return clientId;
}

function getGoogleClientSecret(): string {
  const clientSecret = process.env.OAUTH_GOOGLE_CLIENT_SECRET?.trim();
  if (!clientSecret) {
    throwGoogleOAuthNotConfigured();
  }
  return clientSecret;
}

function getRedirectUri(): string {
  const redirectUri = process.env.OAUTH_REDIRECT_URI?.trim();
  if (!redirectUri) {
    throwGoogleOAuthNotConfigured();
  }
  return redirectUri;
}

function getGoogleOAuthConfig(): GoogleOAuthConfig {
  const clientId = getGoogleClientId();
  const clientSecret = getGoogleClientSecret();
  const redirectUri = getRedirectUri();
  return { clientId, clientSecret, redirectUri };
}

export function getGoogleOAuthClient() {
  try {
    const clientId = getGoogleClientId();
    const clientSecret = getGoogleClientSecret();
    const redirectUri = getRedirectUri();
    return new Google(clientId, clientSecret, redirectUri);
  } catch {
    return null;
  }
}

export function isGoogleOAuthConfigured(): boolean {
  if (cachedGoogleClient) return true;
  if (missingGoogleOAuthConfig) return false;
  try {
    void getGoogleOAuthClient();
    return true;
  } catch (error) {
    if (
      typeof error === "object" &&
      error !== null &&
      "error" in error &&
      (error as { error?: string }).error === "google_oauth_not_configured"
    ) {
      missingGoogleOAuthConfig = true;
      return false;
    }
    throw error;
  }
}

declare module "lucia" {
  interface Register {
    Lucia: typeof lucia;
    DatabaseUserAttributes: {
      email: string;
      role: string;
      google_user_id: string | null;
    };
  }
}
