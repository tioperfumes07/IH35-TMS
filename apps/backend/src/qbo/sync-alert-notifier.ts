import { withLuciaBypass } from "../auth/db.js";
import { enqueueEmail } from "../email/queue.service.js";

const DEFAULT_ALERT_EMAIL = "tioperfumes07@gmail.com";

export type DeadLetterNotifyInput = {
  operatingCompanyId: string;
  kind: string;
  syncRunId: string;
  errorMessage: string;
};

export async function notifyQboSyncDeadLetter(input: DeadLetterNotifyInput): Promise<{ sent: boolean; reason?: string }> {
  const toEmail = process.env.QBO_SYNC_ALERT_EMAIL?.trim() || DEFAULT_ALERT_EMAIL;
  const alertDay = new Date().toISOString().slice(0, 10);

  return withLuciaBypass(async (client) => {
    await client.query(`SELECT set_config('app.operating_company_id', $1, true)`, [input.operatingCompanyId]);

    const throttleReg = await client.query(`SELECT to_regclass('qbo.sync_dead_letter_email_throttle') IS NOT NULL AS ok`);
    if (!throttleReg.rows[0]?.ok) {
      return { sent: false, reason: "throttle_schema_missing" };
    }

    const dup = await client.query(
      `
        SELECT 1
        FROM qbo.sync_dead_letter_email_throttle
        WHERE operating_company_id = $1::uuid
          AND kind = $2
          AND alert_day = $3::date
        LIMIT 1
      `,
      [input.operatingCompanyId, input.kind, alertDay]
    );
    if (dup.rows.length > 0) {
      return { sent: false, reason: "throttled" };
    }

    const subject = `⚠️ QBO Sync Dead Letter — ${input.kind}`;
    const lines = [
      `Sync run ${input.syncRunId} failed after 5 retries.`,
      "",
      `Last error: ${input.errorMessage}`,
      "",
      "Inspect: https://api.ih35dispatch.com/api/v1/qbo/sync/health",
    ];

    try {
      await enqueueEmail({
        operatingCompanyId: input.operatingCompanyId,
        toAddresses: [toEmail],
        subject,
        templateKey: "qbo-sync-alert",
        templateVars: {
          headline: subject,
          bodyText: lines.join("\n"),
        },
        queuedByUserId: null,
      });
    } catch {
      return { sent: false, reason: "enqueue_failed" };
    }

    await client.query(
      `
        INSERT INTO qbo.sync_dead_letter_email_throttle (operating_company_id, kind, alert_day)
        VALUES ($1,$2,$3::date)
      `,
      [input.operatingCompanyId, input.kind, alertDay]
    );

    return { sent: true };
  });
}
