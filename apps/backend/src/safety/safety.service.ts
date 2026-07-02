import { withCurrentUser } from "../auth/db.js";
import { safetyActivityWindowSql, type SafetyActivityWindow } from "./safety-activity-window.js";

export async function listSafetyEvents(
  userId: string,
  input: {
    operating_company_id: string;
    filter?: "active" | "resolved" | "all";
    window?: SafetyActivityWindow;
    event_type?: string;
    severity?: string;
    limit?: number;
    offset?: number;
  }
) {
  return withCurrentUser(userId, async (client) => {
    await client.query("SELECT set_config('app.operating_company_id', $1, true)", [input.operating_company_id]);
    const values: unknown[] = [input.operating_company_id];
    const filters = ["operating_company_id = $1"];
    if (input.event_type) {
      values.push(input.event_type);
      filters.push(`event_type = $${values.length}`);
    }
    if (input.severity) {
      values.push(input.severity);
      filters.push(`severity = $${values.length}`);
    }
    const normalizedFilter = input.filter ?? "active";
    if (normalizedFilter === "active") filters.push("is_active = true");
    if (normalizedFilter === "resolved") filters.push("is_active = false");

    const windowSql = safetyActivityWindowSql(input.window);
    if (windowSql) filters.push(windowSql);

    values.push(Math.max(1, Math.min(200, Number(input.limit ?? 100))));
    values.push(Math.max(0, Number(input.offset ?? 0)));
    const limitIdx = values.length - 1;
    const offsetIdx = values.length;

    const rows = await client
      .query(
        `
          SELECT *
          FROM safety.v_safety_events_with_active
          WHERE ${filters.join(" AND ")}
          ORDER BY event_at DESC
          LIMIT $${limitIdx}
          OFFSET $${offsetIdx}
        `,
        values
      )
      .catch(() => ({ rows: [] as Record<string, unknown>[] }));

    const countFilters = ["operating_company_id = $1"];
    if (windowSql) countFilters.push(windowSql);
    const counts = await client
      .query<{ active_count: number; resolved_count: number; total_count: number }>(
        `
          SELECT
            count(*) FILTER (WHERE is_active = true)::int AS active_count,
            count(*) FILTER (WHERE is_active = false)::int AS resolved_count,
            count(*)::int AS total_count
          FROM safety.v_safety_events_with_active
          WHERE ${countFilters.join(" AND ")}
        `,
        [input.operating_company_id]
      )
      .catch(() => ({ rows: [{ active_count: 0, resolved_count: 0, total_count: 0 }] }));

    return {
      events: rows.rows,
      counters: counts.rows[0] ?? { active_count: 0, resolved_count: 0, total_count: 0 },
      filter: normalizedFilter,
      window: input.window ?? "7d",
    };
  });
}
