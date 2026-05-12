import { Lucia } from "lucia";
import { NodePostgresAdapter } from "@lucia-auth/adapter-postgresql";
import { Google } from "arctic";
import { luciaPool } from "./db.js";
import { luciaSessionCookieBaseAttributes } from "./session-cookie-policy.js";

if (!process.env.OAUTH_GOOGLE_CLIENT_ID) {
  throw new Error("OAUTH_GOOGLE_CLIENT_ID is required");
}
if (!process.env.OAUTH_GOOGLE_CLIENT_SECRET) {
  throw new Error("OAUTH_GOOGLE_CLIENT_SECRET is required");
}
if (!process.env.OAUTH_REDIRECT_URI) {
  throw new Error("OAUTH_REDIRECT_URI is required");
}

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

export const google = new Google(
  process.env.OAUTH_GOOGLE_CLIENT_ID,
  process.env.OAUTH_GOOGLE_CLIENT_SECRET,
  process.env.OAUTH_REDIRECT_URI
);

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
