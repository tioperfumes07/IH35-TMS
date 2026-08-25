import type { FastifyInstance } from "fastify";
import cron from "node-cron";
import { withLuciaBypass } from "../auth/db.js";
import { assertTenantContext } from "../cron/_helpers/tenant-context-guard.js";
import { wrapBackgroundJobTick } from "../lib/background-jobs.js";
import { createNotification } from "../notifications/notification.service.js";
import { enqueueOutboxEvent } from "../outbox/enqueue-outbox-event.js";
import { buildComplianceCredentials } from "./compliance-aggregate.service.js";

let initialized = false;

export async function runComplianceReminderTick(operatingCompanyId: string) {
  await withLuciaBypass(async (client) => {
    await client.query(`SELECT set_config('app.operating_company_id', $1::text, true)`, [operatingCompanyId]);
    const rulesRes = await client.query<{
      id: string;
      credential_type: string;
      notify_days_before: number[];
      channel: string[];
      recipient_emails: string[] | null;
      recipient_user_ids: string[] | null;
    }>(
      `
        SELECT id::text, credential_type, notify_days_before, channel, recipient_emails, recipient_user_ids
        FROM compliance.notification_rules
        WHERE operating_company_id = $1::uuid AND active = true
      `,
      [operatingCompanyId]
    );

    const credentials = await buildComplianceCredentials(client, operatingCompanyId);
    for (const rule of rulesRes.rows) {
      const daysSet = new Set(rule.notify_days_before ?? []);
      const matching = credentials.filter(
        (c) =>
          c.type === rule.credential_type &&
          c.days_until_expiration !== null &&
          daysSet.has(c.days_until_expiration)
      );
      for (const cred of matching) {
        if ((rule.channel ?? []).includes("email")) {
          const emailRecipients = (rule.recipient_emails ?? []).filter(Boolean);
          for (const recipient of emailRecipients.length ? emailRecipients : ["ops@ih35dispatch.com"]) {
            await enqueueOutboxEvent(
              client,
              "compliance.reminder_email",
              { aggregate_type: `compliance.${cred.owner_type}`, aggregate_id: cred.owner_id },
              {
                operating_company_id: operatingCompanyId,
                rule_id: rule.id,
                credential_type: cred.type,
                entity_type: cred.owner_type,
                entity_id: cred.owner_id,
                expiration_date: cred.expiration_date,
                days_until_expiration: cred.days_until_expiration,
                recipient,
                subject: `Compliance reminder: ${cred.label} for ${cred.owner_name}`,
                body_html: `<p>${cred.label} for ${cred.owner_name} expires ${cred.expiration_date ?? "soon"} (${cred.days_until_expiration} days).</p>`,
              },
              `compliance-reminder-email:${rule.id}:${cred.owner_type}:${cred.owner_id}:${cred.expiration_date ?? "none"}:${cred.days_until_expiration}:${recipient}`
            );
          }
        }

        if ((rule.channel ?? []).includes("in_app")) {
          const userIds = (rule.recipient_user_ids ?? []).filter(Boolean);
          const notifType =
            cred.days_until_expiration !== null && cred.days_until_expiration <= 0
              ? "compliance_expired"
              : "compliance_expiring";
          const severity =
            cred.days_until_expiration !== null && cred.days_until_expiration <= 7 ? "high" : "medium";
          for (const userId of userIds) {
            await createNotification(
              {
                operating_company_id: operatingCompanyId,
                user_id: userId,
                type: notifType,
                severity,
                title: `Compliance: ${cred.label}`,
                body: `${cred.label} for ${cred.owner_name} expires ${cred.expiration_date ?? "soon"}.`,
                action_link: cred.action_link ?? `/compliance`,
                entity_type: cred.owner_type,
                entity_id: cred.owner_id,
                source_block: "compliance_reminder",
              },
              client
            );
            await client.query(
              `
                INSERT INTO compliance.notification_log (
                  operating_company_id, rule_id, credential_type, entity_type, entity_id,
                  expiration_date, days_until_expiration, channel, recipient, status
                ) VALUES ($1::uuid, $2::uuid, $3, $4, $5::uuid, $6::date, $7, $8, $9, $10)
              `,
              [
                operatingCompanyId,
                rule.id,
                cred.type,
                cred.owner_type,
                cred.owner_id,
                cred.expiration_date,
                cred.days_until_expiration,
                "in_app",
                userId,
                "sent",
              ]
            );
          }
        }
      }
    }
  });
}

export function initializeComplianceReminderCron(app: FastifyInstance) {
  if (initialized) return;
  initialized = true;
  if (process.env.ENABLE_COMPLIANCE_REMINDER_CRON === "false") {
    app.log.info("Compliance reminder cron disabled via ENABLE_COMPLIANCE_REMINDER_CRON=false");
    return;
  }

  cron.schedule(
    "0 6 * * *",
    async () => {
      await wrapBackgroundJobTick(
        "compliance.reminder_cron",
        async () => {
          await withLuciaBypass(async (client) => {
            const companies = await client.query<{ id: string }>(`SELECT id::text FROM org.companies WHERE is_active = true`);
            for (const company of companies.rows) {
              assertTenantContext(company.id, "compliance.reminder_cron");
              await runComplianceReminderTick(company.id);
            }
          });
        },
        app.log
      );
    },
    {
      maxRandomDelay: 20000 /* cron-stagger (code only) — see PROD-OUTAGE-STEADY-STATE-CRON-PILEUP-CONFIRMED */, timezone: "America/Chicago" }
  );
  app.log.info("Compliance reminder cron scheduled (daily 06:00 America/Chicago)");
}
