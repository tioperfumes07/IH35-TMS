import type { FastifyInstance } from "fastify";
import cron from "node-cron";
import { withLuciaBypass } from "../auth/db.js";
import { enqueueEmail } from "../email/queue.service.js";
import { wrapBackgroundJobTick } from "../lib/background-jobs.js";

let initialized = false;

export function initializeVendorCoiWarningCron(app: FastifyInstance) {
  if (initialized) return;
  initialized = true;
  if (process.env.ENABLE_VENDOR_COI_WARNING_CRON === "false") {
    app.log.info("Vendor COI warning cron disabled");
    return;
  }

  cron.schedule(
    "30 7 * * *",
    async () => {
      await wrapBackgroundJobTick(
        "vendor.coi_expiry_warnings",
        async () => {
          await withLuciaBypass(async (client) => {
            const extOk = await client.query(`SELECT to_regclass('mdata.vendor_extensions') IS NOT NULL AS ok`);
            if (!extOk.rows[0]?.ok) return;

            const alertTo = process.env.VENDOR_COI_ALERT_TO?.trim();
            if (!alertTo) return;

            const res = await client.query<{
              vendor_id: string;
              operating_company_id: string;
              coi_expires_on: string;
              warn_day: string;
            }>(
              `
                SELECT
                  vendor_id::text,
                  operating_company_id::text,
                  coi_expires_on::text,
                  CASE
                    WHEN coi_expires_on <= current_date + interval '7 days' THEN '7'
                    WHEN coi_expires_on <= current_date + interval '14 days' THEN '14'
                    ELSE '30'
                  END AS warn_day
                FROM mdata.vendor_extensions
                WHERE coi_expires_on IS NOT NULL
                  AND coi_expires_on > current_date
                  AND coi_expires_on <= current_date + interval '30 days'
                  AND (coi_warn_last_sent_on IS NULL OR coi_warn_last_sent_on < current_date)
              `
            );

            for (const row of res.rows) {
              await enqueueEmail({
                operatingCompanyId: row.operating_company_id,
                toAddresses: [alertTo],
                subject: `Vendor COI expiring (${row.warn_day}d)`,
                templateKey: "notification-dispatch",
                templateVars: {
                  title: "Certificate of insurance expiry",
                  bodyText: `Vendor ${row.vendor_id} COI expires on ${row.coi_expires_on} (${row.warn_day}-day window).`,
                },
              });
              await client.query(`UPDATE mdata.vendor_extensions SET coi_warn_last_sent_on = current_date WHERE vendor_id = $1::uuid`, [
                row.vendor_id,
              ]);
            }
          });
        },
        app.log
      );
    },
    { timezone: "America/Chicago" }
  );

  app.log.info("Vendor COI warning cron scheduled (daily 07:30 America/Chicago)");
}
