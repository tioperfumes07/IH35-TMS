import type { FastifyInstance } from "fastify";
import { registerPlaidWebhookReceiver } from "../../integrations/plaid/webhook-core.js";

export async function registerBankingPlaidWebhookRoutes(app: FastifyInstance) {
  registerPlaidWebhookReceiver(app, "/api/v1/banking/plaid/webhook");
}
