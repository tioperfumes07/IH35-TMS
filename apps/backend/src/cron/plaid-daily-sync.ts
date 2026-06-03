import type { FastifyInstance } from "fastify";
import cron from "node-cron";
import { wrapBackgroundJobTick } from "../lib/background-jobs.js";
import { withLuciaBypass } from "../auth/db.js";
import { syncTransactions, handleItemError } from "../integrations/plaid/plaid.service.js";
import { sendEmail } from "../notifications/email.service.js";

export const PLAID_DAILY_SYNC_JOB = "banking.plaid_daily_sync_cron";

const CRON_EXPRESSION = "0 2 * * *";
const CRON_TZ = "America/Chicago";

let initialized = false;

type ActivePlaidAccount = {
  id: string;
  plaid_item_id: string;
  institution_name: string | null;
  account_name: string | null;
};

async function getAllActivePlaidAccounts() {
  return withLuciaBypass(async (client) => {
    const res = await client.query<ActivePlaidAccount>(
      `
        SELECT id, plaid_item_id, institution_name, account_name
        FROM banking.bank_accounts
        WHERE is_active = true
          AND plaid_item_id IS NOT NULL
      `
    );
    return res.rows;
  });
}

function buildFailureEmail(
  failures: Array<{
    plaid_item_id: string;
    account_name: string | null;
    institution_name: string | null;
    reason: string;
  }>
) {
  const items = failures
    .map(
      (failure) =>
        `<li><strong>${failure.institution_name ?? "Bank"} - ${failure.account_name ?? "Account"}</strong> (${failure.plaid_item_id})<br/>${failure.reason}</li>`
    )
    .join("");
  return `<p>Plaid daily sync reported failures:</p><ul>${items}</ul>`;
}

export function initializePlaidDailySyncCron(app: FastifyInstance) {
  if (initialized) return;
  initialized = true;
  if ((process.env.ENABLE_PLAID_DAILY_SYNC_CRON ?? "true").trim() === "false") {
    app.log.info("Plaid daily sync cron disabled via ENABLE_PLAID_DAILY_SYNC_CRON=false");
    return;
  }

  cron.schedule(
    CRON_EXPRESSION,
    async () => {
      await wrapBackgroundJobTick(
        PLAID_DAILY_SYNC_JOB,
        async () => {
          const accounts = await getAllActivePlaidAccounts();
          const uniqueItems = new Map<string, ActivePlaidAccount>();
          for (const account of accounts) {
            if (!uniqueItems.has(account.plaid_item_id)) {
              uniqueItems.set(account.plaid_item_id, account);
            }
          }

          const failures: Array<{
            plaid_item_id: string;
            account_name: string | null;
            institution_name: string | null;
            reason: string;
          }> = [];

          for (const account of uniqueItems.values()) {
            try {
              const result = await syncTransactions(account.plaid_item_id);
              app.log.info(
                {
                  plaid_item_id: account.plaid_item_id,
                  total: result.autoCategorizeTotal,
                  matched: result.autoCategorizeMatched,
                  unmatched: result.autoCategorizeUnmatched,
                },
                "[PLAID_AUTOCAT_BATCH]"
              );
            } catch (error) {
              const code =
                typeof error === "object" && error && "code" in error
                  ? String((error as { code?: unknown }).code ?? "SYNC_FAILED")
                  : "SYNC_FAILED";
              await handleItemError(account.plaid_item_id, code);
              failures.push({
                plaid_item_id: account.plaid_item_id,
                account_name: account.account_name,
                institution_name: account.institution_name,
                reason: error instanceof Error ? error.message : "unknown_error",
              });
            }
          }

          if (failures.length > 0) {
            await sendEmail({
              to: "tioperfumes07@gmail.com",
              subject: `[IH 35 TMS] Plaid daily sync: ${failures.length} account(s) failed`,
              sender: "noreply",
              html: buildFailureEmail(failures),
              text: `Plaid daily sync failed for ${failures.length} account(s).`,
              eventClass: "banking.plaid.error",
              tags: [{ name: "type", value: "plaid_alert" }],
              actorUserId: null,
            });
          }
        },
        app.log
      );
    },
    { timezone: CRON_TZ }
  );

  app.log.info("Plaid daily sync cron scheduled (daily 02:00 America/Chicago)");
}
