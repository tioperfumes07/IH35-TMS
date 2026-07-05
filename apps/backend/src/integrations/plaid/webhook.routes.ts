import type { FastifyInstance } from "fastify";
import { registerPlaidWebhookReceiver } from "./webhook-core.js";

export async function registerPlaidWebhookRoutes(app: FastifyInstance) {
  await registerPlaidWebhookReceiver(app, "/api/v1/webhooks/plaid");
}
