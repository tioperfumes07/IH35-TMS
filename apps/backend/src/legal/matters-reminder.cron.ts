import type { FastifyInstance } from "fastify";
import cron from "node-cron";
import { withLuciaBypass } from "../auth/db.js";
import { sendEmail } from "../notifications/email.service.js";
import { appendDeadlineReminderSent, listDeadlinesNeedingReminder } from "./matters.service.js";
import { wrapBackgroundJobTick } from "../lib/background-jobs.js";

let initialized = false;

async function ownerEmailsForCompany(operatingCompanyId: string): Promise<string[]> {
  const res = await withLuciaBypass(async (client) => {
    return client.query<{ email: string }>(
      `
        SELECT DISTINCT lower(u.email) AS email
        FROM identity.users u
        JOIN org.user_company_access uca ON uca.user_id = u.id
        WHERE u.role = 'Owner'
          AND u.deactivated_at IS NULL
          AND u.email IS NOT NULL
          AND uca.company_id = $1
          AND uca.deactivated_at IS NULL
      `,
      [operatingCompanyId]
    );
  });
  return res.rows.map((r) => r.email).filter(Boolean);
}

function appBaseUrl() {
  return (
    process.env.APP_BASE_URL ??
    process.env.WEB_APP_URL ??
    process.env.FRONTEND_BASE_URL ??
    "https://ih35-tms-web.onrender.com"
  ).replace(/\/+$/, "");
}

export function initializeLegalMattersReminderCron(app: FastifyInstance) {
  if (initialized) return;
  initialized = true;
  if (process.env.ENABLE_LEGAL_MATTERS_REMINDER_CRON === "false") {
    app.log.info("Legal matters reminder cron disabled via ENABLE_LEGAL_MATTERS_REMINDER_CRON=false");
    return;
  }

  cron.schedule(
    "0 8 * * *",
    async () => {
      await wrapBackgroundJobTick(
        "legal.matters_reminder_cron",
        async () => {
          const rows = await withLuciaBypass(async (client) => listDeadlinesNeedingReminder(client));
          for (const row of rows) {
            const companyId = String(row.operating_company_id ?? "");
            const matterNumber = String(row.matter_number ?? "");
            const title = String(row.title ?? "Deadline");
            const due = String(row.deadline_at ?? "");
            const dtype = String(row.deadline_type ?? "");
            const id = String(row.id ?? "");
            const recipients = (row.reminder_recipients as string[] | null) ?? [];
            const to = [...new Set([...recipients.map((e) => e.toLowerCase())])].filter(Boolean);
            const owners = dtype === "statute_of_limitations" ? await ownerEmailsForCompany(companyId) : [];
            const allTo = [...new Set([...to, ...owners])];
            if (allTo.length === 0) {
              await withLuciaBypass(async (client) => appendDeadlineReminderSent(client, id));
              continue;
            }
            const detailUrl = `${appBaseUrl()}/legal/matters/${String(row.matter_id ?? "")}`;
            await sendEmail({
              to: allTo,
              subject: `[Legal] Matter ${matterNumber}: ${title} due ${due}`,
              sender: "noreply",
              html: `<p>Legal matter deadline reminder.</p>
<p><strong>Matter:</strong> ${matterNumber}<br/>
<strong>Deadline:</strong> ${title} — ${due}<br/>
<strong>Type:</strong> ${dtype}</p>
<p><a href="${detailUrl}">Open matter</a></p>`,
              text: `Matter ${matterNumber}. ${title} due ${due} (${dtype}). ${detailUrl}`,
              eventClass: "legal.matter_deadline_reminder",
              actorUserId: process.env.SYSTEM_ACTOR_USER_ID ?? undefined,
            });

            try {
              await withLuciaBypass(async (client) => {
                const reg = await client.query(`SELECT to_regclass('pwa.driver_notifications') IS NOT NULL AS ok`);
                if (!reg.rows[0]?.ok) return;
                const driverId = row.related_driver_id;
                if (!driverId) return;
                await client.query(
                  `
                  INSERT INTO pwa.driver_notifications (operating_company_id, driver_id, title, message, payload)
                  VALUES ($1, $2, $3, $4, $5::jsonb)
                `,
                  [
                    companyId,
                    driverId,
                    `Legal deadline: ${matterNumber}`,
                    `${title} — due ${due}`,
                    JSON.stringify({ matter_id: row.matter_id, deadline_id: id, type: "legal_matter_deadline" }),
                  ]
                );
              });
            } catch {
              /* PWA optional */
            }

            await withLuciaBypass(async (client) => appendDeadlineReminderSent(client, id));
          }
          if (rows.length > 0) app.log.info({ count: rows.length }, "legal matter deadline reminders sent");
        },
        app.log
      );
    },
    { timezone: "America/Chicago" }
  );

  app.log.info("Legal matters reminder cron scheduled (daily 08:00 America/Chicago)");
}
