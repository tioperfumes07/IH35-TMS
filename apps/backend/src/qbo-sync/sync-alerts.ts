import { withLuciaBypass } from "../auth/db.js";
import { enqueueEmail } from "../email/queue.service.js";
import { dispatchNotification, listCompanyUserIdsByRoles } from "../notifications/dispatcher.js";
import type { DriftEntityType } from "./drift-detector.js";

const DEFAULT_ALERT_EMAIL = "tioperfumes07@gmail.com";
const DEFAULT_DRIFT_THRESHOLD = 5;

function driftThreshold(entityType: DriftEntityType): number {
  const envKey = `QBO_DRIFT_THRESHOLD_${entityType.toUpperCase()}`;
  const raw = process.env[envKey]?.trim() ?? process.env.QBO_DRIFT_THRESHOLD?.trim();
  const parsed = raw ? Number(raw) : DEFAULT_DRIFT_THRESHOLD;
  return Number.isFinite(parsed) && parsed > 0 ? parsed : DEFAULT_DRIFT_THRESHOLD;
}

export type DriftAlertInput = {
  operatingCompanyId: string;
  entityType: DriftEntityType;
  driftCount: number;
};

export async function maybeFireDriftAlert(input: DriftAlertInput): Promise<{ sent: boolean; reason?: string }> {
  const threshold = driftThreshold(input.entityType);
  if (input.driftCount < threshold) {
    return { sent: false, reason: "below_threshold" };
  }

  const toEmail = process.env.QBO_SYNC_ALERT_EMAIL?.trim() || DEFAULT_ALERT_EMAIL;
  const alertDay = new Date().toISOString().slice(0, 10);

  return withLuciaBypass(async (client) => {
    await client.query(`SELECT set_config('app.operating_company_id', $1, true)`, [input.operatingCompanyId]);

    const throttleExists = await client.query(`SELECT to_regclass('qbo_sync.drift_alert_throttle') IS NOT NULL AS ok`);
    if (!throttleExists.rows[0]?.ok) {
      return { sent: false, reason: "throttle_schema_missing" };
    }

    const dup = await client.query(
      `
        SELECT 1
        FROM qbo_sync.drift_alert_throttle
        WHERE operating_company_id = $1::uuid
          AND entity_type = $2
          AND alert_day = $3::date
        LIMIT 1
      `,
      [input.operatingCompanyId, input.entityType, alertDay]
    );
    if (dup.rows.length > 0) {
      return { sent: false, reason: "throttled" };
    }

    const subject = `⚠️ QBO Drift Alert — ${input.entityType.replace(/_/g, " ")} (${input.driftCount} unresolved)`;
    const lines = [
      `${input.driftCount} unresolved drift entries detected for ${input.entityType}.`,
      `Threshold: ${threshold}`,
      "",
      "Review: /accounting/qbo-sync",
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

    const recipients = await listCompanyUserIdsByRoles(input.operatingCompanyId, [
      "Owner",
      "Administrator",
      "Accountant",
    ]);
    await Promise.all(
      recipients.map((userId) =>
        dispatchNotification({
          user_id: userId,
          event_type: "qbo.sync.failed",
          actor_user_id: null,
          payload: {
            operating_company_id: input.operatingCompanyId,
            headline: subject,
            bodyText: lines.join("\n"),
            entity_type: input.entityType,
            drift_count: input.driftCount,
            sms_body_short: `QBO drift (${input.entityType}): ${input.driftCount}.`,
            whatsapp_skip: true,
          },
        }).catch(() => undefined)
      )
    );

    await client.query(
      `
        INSERT INTO qbo_sync.drift_alert_throttle (operating_company_id, entity_type, alert_day, drift_count)
        VALUES ($1::uuid, $2, $3::date, $4)
      `,
      [input.operatingCompanyId, input.entityType, alertDay, input.driftCount]
    );

    return { sent: true };
  });
}
