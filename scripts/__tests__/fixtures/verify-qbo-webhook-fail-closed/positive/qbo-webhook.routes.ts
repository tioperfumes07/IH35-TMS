import { getEnvStatus, getRequiredEnvSpec } from "../../config/required-env.js";
import { verifyIntuitWebhookSignature } from "./qbo-webhook-signature.js";

const response = { error: "qbo_webhook_verifier_not_configured" };

export async function registerQboWebhookRoutes(scoped) {
  const spec = getRequiredEnvSpec("QBO_WEBHOOK_VERIFIER_TOKEN");
  const status = spec ? getEnvStatus(spec) : { state: "missing" };

  scoped.post("/api/v1/qbo/webhook", async (req, reply) => {
    if (status.state !== "present") return reply.code(503).send(response);
    const verified = verifyIntuitWebhookSignature(req.body, status.value, req.headers["intuit-signature"]);
    if (!verified) return reply.code(401).send({ error: "qbo_webhook_signature_invalid" });
    return reply.code(200).send({ ok: true });
  });
}
