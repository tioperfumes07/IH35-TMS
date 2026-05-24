#!/usr/bin/env node
import fs from "node:fs";

const routePath = "apps/backend/src/integrations/qbo/qbo-webhook.routes.ts";
const source = fs.readFileSync(routePath, "utf8");

const requiredSnippets = [
  "QBO_WEBHOOK_VERIFIER_TOKEN",
  "QBO_WEBHOOK_ALLOW_INSECURE_DEV",
  "process.env.NODE_ENV === \"production\"",
  "throw new Error(\"qbo_webhook_verifier_token_required_in_production\")",
  "verifyIntuitWebhookSignature",
  "reply.code(401).send({ error: \"invalid_signature\" })",
];

const missing = requiredSnippets.filter((snippet) => !source.includes(snippet));
if (missing.length > 0) {
  console.error("verify-qbo-webhook-fail-closed failed");
  for (const snippet of missing) {
    console.error(`  missing: ${snippet}`);
  }
  process.exit(1);
}

console.log("verify-qbo-webhook-fail-closed: ok");
