import { withLuciaBypass } from "../../auth/db.js";
import { sendEmail } from "../../notifications/email.service.js";

type ForensicZombieAlertParams = {
  batch_id: string;
  operating_company_id: string;
  company_name: string;
  started_at: string | null;
  last_heartbeat_at: string | null;
  minutes_stale: number;
};

async function getOwnerEmailForCompany(operatingCompanyId: string) {
  return withLuciaBypass(async (client) => {
    const primary = await client.query<{ email: string }>(
      `
        SELECT iu.email
        FROM org.user_company_access uca
        JOIN identity.users iu ON iu.id = uca.user_id
        WHERE uca.company_id = $1
          AND iu.role = 'Owner'
          AND iu.email IS NOT NULL
          AND uca.deactivated_at IS NULL
        ORDER BY uca.granted_at ASC
        LIMIT 1
      `,
      [operatingCompanyId]
    );
    return primary.rows[0]?.email ?? null;
  });
}

export async function sendForensicZombieAlert(params: ForensicZombieAlertParams) {
  const ownerEmail = (await getOwnerEmailForCompany(params.operating_company_id)) ?? "jorge@ih35trucking.net";
  const html = `
    <h2>Forensic batch auto-failed</h2>
    <p><strong>Batch ID:</strong> ${params.batch_id}</p>
    <p><strong>Company:</strong> ${params.company_name}</p>
    <p><strong>Started:</strong> ${params.started_at ?? "n/a"}</p>
    <p><strong>Last heartbeat:</strong> ${params.last_heartbeat_at ?? "n/a"} (${params.minutes_stale} min ago)</p>
    <p><strong>Suggested action:</strong> Open <a href="https://app.ih35dispatch.com/admin/forensic-review">Forensic Review</a>, verify QBO connection, and start a new import.</p>
  `;
  await sendEmail({
    to: ownerEmail,
    sender: "noreply",
    subject: `[IH35-TMS] Forensic batch stalled - ${params.company_name}`,
    html,
    text: `Forensic batch auto-failed. Batch ${params.batch_id}; company ${params.company_name}; last heartbeat ${params.last_heartbeat_at ?? "n/a"}.`,
    eventClass: "notifications.forensic_zombie_alert_sent",
    actorUserId: null,
  });
  await withLuciaBypass(async (client) => {
    await client.query(`SELECT audit.append_event($1, $2, $3::jsonb, NULL, $4)`, [
      "notifications.forensic_zombie_alert_sent",
      "warning",
      JSON.stringify({
        batch_id: params.batch_id,
        operating_company_id: params.operating_company_id,
        company_name: params.company_name,
        minutes_stale: params.minutes_stale,
      }),
      "P6-FOUNDATION-OPS",
    ]);
  });
}
