import type pg from "pg";
import { withLuciaBypass } from "./db.js";
import { lucia } from "./lucia.js";

export const LAST_LOGIN_UPDATE_SQL =
  "UPDATE identity.users SET last_login_at = now() WHERE id = $1";

export async function touchUserLastLoginAt(
  client: pg.PoolClient | { query: pg.PoolClient["query"] },
  userId: string
): Promise<void> {
  await client.query(LAST_LOGIN_UPDATE_SQL, [userId]);
}

export async function createSessionWithLastLogin(
  userId: string,
  attributes: Record<string, unknown> = {}
) {
  const session = await lucia.createSession(userId, attributes);
  await withLuciaBypass(async (client) => {
    await touchUserLastLoginAt(client, userId);
  });
  return session;
}
