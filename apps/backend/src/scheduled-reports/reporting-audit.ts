import { withLuciaBypass } from "../auth/db.js";

export async function appendReportingAuditEvent(
  eventClass: string,
  severity: "info" | "warning" | "critical",
  payload: Record<string, unknown>,
  actorUserId?: string | null
) {
  await withLuciaBypass(async (client) => {
    await client.query(`SELECT audit.append_event($1, $2, $3::jsonb, $4::uuid, $5)`, [
      eventClass,
      severity,
      JSON.stringify(payload),
      actorUserId ?? null,
      "P6-T11201-SCHEDULED-REPORTS",
    ]);
  });
}
