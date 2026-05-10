import { withCurrentUser } from "../auth/db.js";

const DEFAULT_PREFERENCES = {
  safety: {
    active_only: true,
  },
} as const;

function mergeDefaults(raw: unknown) {
  const source = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const safetySource = (source.safety && typeof source.safety === "object" ? source.safety : {}) as Record<string, unknown>;
  return {
    ...source,
    safety: {
      ...DEFAULT_PREFERENCES.safety,
      ...safetySource,
      active_only: safetySource.active_only === false ? false : true,
    },
  };
}

export async function getPrefs(userId: string) {
  return withCurrentUser(userId, async (client) => {
    const res = await client.query<{ preferences: Record<string, unknown> | null }>(
      `
        SELECT preferences
        FROM identity.user_preferences
        WHERE user_id = $1
        LIMIT 1
      `,
      [userId]
    );
    return mergeDefaults(res.rows[0]?.preferences ?? {});
  });
}

export async function updatePrefs(userId: string, partial: Record<string, unknown>) {
  return withCurrentUser(userId, async (client) => {
    const currentRes = await client.query<{ preferences: Record<string, unknown> | null }>(
      `SELECT preferences FROM identity.user_preferences WHERE user_id = $1 LIMIT 1`,
      [userId]
    );
    const merged = mergeDefaults({
      ...(currentRes.rows[0]?.preferences ?? {}),
      ...partial,
    });
    const row = await client.query<{ preferences: Record<string, unknown> }>(
      `
        INSERT INTO identity.user_preferences (user_id, preferences, updated_at)
        VALUES ($1, $2::jsonb, now())
        ON CONFLICT (user_id)
        DO UPDATE
          SET preferences = EXCLUDED.preferences,
              updated_at = now()
        RETURNING preferences
      `,
      [userId, JSON.stringify(merged)]
    );
    return mergeDefaults(row.rows[0]?.preferences ?? {});
  });
}
