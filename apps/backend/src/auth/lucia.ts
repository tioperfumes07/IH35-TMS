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
