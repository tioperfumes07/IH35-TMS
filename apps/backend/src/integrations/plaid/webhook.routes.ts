import type { FastifyInstance } from "fastify";
import { registerPlaidWebhookReceiver } from "./webhook-core.js";

export async function registerPlaidWebhookRoutes(app: FastifyInstance) {
  registerPlaidWebhookReceiver(app, "/api/v1/webhooks/plaid");
}
