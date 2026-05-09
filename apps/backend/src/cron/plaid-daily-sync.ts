import type { FastifyBaseLogger } from "fastify";
import cron from "node-cron";
import { withLuciaBypass } from "../auth/db.js";
import { syncTransactions, handleItemError } from "../integrations/plaid/plaid.service.js";
import { sendEmail } from "../notifications/email.service.js";

const TIMEZONE = "America/Chicago";
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

export function initializePlaidDailySyncCron(logger: FastifyBaseLogger) {
  if (initialized) return;
  initialized = true;
  if (process.env.ENABLE_PLAID_DAILY_SYNC_CRON === "false") {
    logger.info("Plaid daily sync cron disabled via ENABLE_PLAID_DAILY_SYNC_CRON=false");
    return;
  }

  cron.schedule(
    "0 2 * * *",
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
          await syncTransactions(account.plaid_item_id);
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
    { timezone: TIMEZONE }
  );

  logger.info("Plaid daily sync cron initialized: 1 job at 2am CT");
}

