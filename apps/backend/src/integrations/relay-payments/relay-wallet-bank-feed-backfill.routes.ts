/**
 * Owner-triggered backfill: mirror existing integrations.relay_fuel_transactions into
 * banking.bank_transactions on the Relay Fuel Wallet account (visibility + linkage, no GL).
 */
import type { FastifyInstance } from "fastify";
import { requireAuth } from "../../auth/session-middleware.js";
import { withLuciaBypass } from "../../auth/db.js";
import {
  backfillRelayWalletBankFeedForCompany,
  backfillRelayWalletDepositFeedForCompany,
} from "./relay-wallet-bank-feed.service.js";

export async function registerRelayWalletBankFeedBackfillRoute(app: FastifyInstance) {
  app.post(
    "/api/integrations/relay/wallet-bank-feed/backfill",
    { config: { rateLimit: { max: 10, timeWindow: "1 minute" } } },
    async (req, reply) => {
      if (!requireAuth(req, reply)) return reply;
      const role = String((req.user as { role?: string } | undefined)?.role ?? "");
      if (!["Owner", "Administrator"].includes(role)) {
        return reply.code(403).send({ error: "forbidden" });
      }

      const body = req.body as { operating_company_id?: string } | undefined;
      const companyId = body?.operating_company_id?.trim();
      if (!companyId) {
        return reply.code(400).send({ error: "operating_company_id_required" });
      }

      void (async () => {
        try {
          const summary = await withLuciaBypass(async (client) => {
            await client.query(`SELECT set_config('app.operating_company_id', $1::text, true)`, [companyId]);
            const fuel = await backfillRelayWalletBankFeedForCompany(client, companyId);
            const deposits = await backfillRelayWalletDepositFeedForCompany(client, companyId);
            return { fuel, deposits };
          });
          app.log.info({ companyId, ...summary }, "[RELAY_WALLET_BANK_FEED] backfill complete");
        } catch (err) {
          app.log.error({ err, companyId }, "[RELAY_WALLET_BANK_FEED] backfill failed");
        }
      })();

      return reply.code(202).send({ status: "relay_wallet_bank_feed_backfill_started", operating_company_id: companyId });
    },
  );
}
