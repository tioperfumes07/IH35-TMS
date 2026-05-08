import type { FastifyInstance, FastifyReply } from "fastify";
import { withCurrentUser } from "../auth/db.js";
import { requireDriverSession } from "./auth.js";

type DutyStatus = "driving" | "on_duty_not_driving" | "off_duty" | "sleeper_berth";
type HosSnapshot = {
  duty_status: DutyStatus;
  clocks: Array<{
    key: "drive" | "shift" | "cycle" | "break";
    remaining_minutes: number;
    max_minutes: number;
    next_reset_at: string | null;
  }>;
  last_synced_at: string;
  status: {
    id: string;
    hos_badge_color: string | null;
    is_in_violation: boolean;
    minutes_until_violation: number;
  };
};

function nowIso() {
  return new Date().toISOString();
}

function inferDutyStatus(hosBadgeColor: string | null, isViolation: boolean): DutyStatus {
  if (isViolation) return "on_duty_not_driving";
  if (hosBadgeColor === "green") return "driving";
  if (hosBadgeColor === "red") return "driving";
  return "off_duty";
}

function sendForbidden(reply: FastifyReply) {
  return reply.code(403).send({ error: "forbidden" });
}

export async function registerDriverHosRoutes(app: FastifyInstance) {
  app.get("/api/v1/driver/hos", async (req, reply) => {
    if (!(await requireDriverSession(req, reply))) return;
    const driver = req.driver;
    if (!driver || !req.user) return sendForbidden(reply);

    const snapshot = await withCurrentUser(req.user.uuid, async (client) => {
      const companyRes = await client.query<{ operating_company_id: string }>(
        `
          SELECT operating_company_id
          FROM mdata.loads
          WHERE assigned_primary_driver_id = $1 OR assigned_secondary_driver_id = $1
          ORDER BY updated_at DESC
          LIMIT 1
        `,
        [driver.id]
      );
      const operatingCompanyId = companyRes.rows[0]?.operating_company_id ?? null;
      if (!operatingCompanyId) return null;

      const hosRes = await client
        .query<{ id: string; hos_badge_color: string | null; is_in_violation: boolean; minutes_until_violation: number | null }>(
          `
            SELECT id, hos_badge_color, is_in_violation, minutes_until_violation
            FROM views.drivers_with_hos_status
            WHERE id = $1
              AND operating_company_id = $2
            LIMIT 1
          `,
          [driver.id, operatingCompanyId]
        )
        .catch(() => ({ rows: [] as Array<{ id: string; hos_badge_color: string | null; is_in_violation: boolean; minutes_until_violation: number | null }> }));

      const row = hosRes.rows[0] ?? {
        id: driver.id,
        hos_badge_color: null,
        is_in_violation: false,
        minutes_until_violation: 0,
      };

      const minutesUntilViolation = Number(row.minutes_until_violation ?? 0);
      const dutyStatus = inferDutyStatus(row.hos_badge_color, Boolean(row.is_in_violation));
      const syncedAt = nowIso();
      const payload: HosSnapshot = {
        duty_status: dutyStatus,
        clocks: [
          { key: "drive", remaining_minutes: Math.max(0, minutesUntilViolation), max_minutes: 11 * 60, next_reset_at: nowIso() },
          { key: "shift", remaining_minutes: Math.max(0, minutesUntilViolation + 120), max_minutes: 14 * 60, next_reset_at: nowIso() },
          { key: "cycle", remaining_minutes: Math.max(0, minutesUntilViolation + 600), max_minutes: 70 * 60, next_reset_at: nowIso() },
          { key: "break", remaining_minutes: Math.max(0, Math.min(30, minutesUntilViolation)), max_minutes: 30, next_reset_at: nowIso() },
        ],
        last_synced_at: syncedAt,
        status: {
          id: row.id,
          hos_badge_color: row.hos_badge_color,
          is_in_violation: Boolean(row.is_in_violation),
          minutes_until_violation: minutesUntilViolation,
        },
      };
      return payload;
    });

    if (!snapshot) return reply.code(404).send({ error: "hos_not_found" });
    return snapshot;
  });
}
