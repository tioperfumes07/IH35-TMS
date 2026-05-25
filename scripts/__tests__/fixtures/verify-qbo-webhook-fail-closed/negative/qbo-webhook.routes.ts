export async function registerQboWebhookRoutes(scoped) {
  if (!process.env.QBO_WEBHOOK_VERIFIER_TOKEN && process.env.NODE_ENV === "production") {
    throw new Error("qbo_webhook_verifier_token_required_in_production");
  }
  scoped.post("/api/v1/qbo/webhook", async (_req, reply) => reply.code(200).send({ ok: true }));
}
