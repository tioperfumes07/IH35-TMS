import type { FastifyInstance, FastifyReply } from "fastify";
import { withCurrentUser } from "../auth/db.js";
import { maybeNotifyHosShiftWarning } from "../services/push-notification.service.js";
import { getCurrentClocks } from "../telematics/hos-clocks.service.js";
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

function inferDutyStatusFromEvent(value: string | null): DutyStatus {
  if (value === "driving") return "driving";
  if (value === "on_duty_not_driving" || value === "yard_moves") return "on_duty_not_driving";
  if (value === "sleeper") return "sleeper_berth";
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
          FROM mdata.drivers
          WHERE id = $1::uuid
          LIMIT 1
        `,
        [driver.id]
      );
      const operatingCompanyId = companyRes.rows[0]?.operating_company_id ?? null;
      if (!operatingCompanyId) return null;

      const clocks = await getCurrentClocks(client, operatingCompanyId, driver.id);
      const latestEventRes = await client.query<{ duty_status: string | null }>(
        `
          SELECT duty_status
          FROM hos.duty_status_events
          WHERE operating_company_id = $1::uuid
            AND driver_id = $2::uuid
          ORDER BY started_at DESC
          LIMIT 1
        `,
        [operatingCompanyId, driver.id]
      );
      const dutyStatus = inferDutyStatusFromEvent(latestEventRes.rows[0]?.duty_status ?? null);
      const syncedAt = nowIso();
      const payload: HosSnapshot = {
        duty_status: dutyStatus,
        clocks: [
          { key: "drive", remaining_minutes: clocks.drive_remaining_min, max_minutes: 11 * 60, next_reset_at: clocks.last_reset_at },
          { key: "shift", remaining_minutes: clocks.window_remaining_min, max_minutes: 14 * 60, next_reset_at: clocks.last_reset_at },
          { key: "cycle", remaining_minutes: clocks.cycle_remaining_min, max_minutes: 70 * 60, next_reset_at: null },
          { key: "break", remaining_minutes: clocks.break_remaining_min, max_minutes: 30, next_reset_at: null },
        ],
        last_synced_at: syncedAt,
        status: {
          id: driver.id,
          hos_badge_color: clocks.status === "violation" ? "red" : clocks.status === "ok" ? "green" : "yellow",
          is_in_violation: clocks.status === "violation",
          minutes_until_violation: Math.min(
            clocks.drive_remaining_min,
            clocks.window_remaining_min,
            clocks.break_remaining_min,
            clocks.cycle_remaining_min
          ),
        },
      };
      const shiftRemaining =
        payload.clocks.find((clock) => clock.key === "shift")?.remaining_minutes ?? 14 * 60;
      maybeNotifyHosShiftWarning({
        operatingCompanyId,
        driverId: driver.id,
        shiftRemainingMinutes: shiftRemaining,
      });
      return payload;
    });

    if (!snapshot) return reply.code(404).send({ error: "hos_not_found" });
    return snapshot;
  });
}
