#!/usr/bin/env node
import fs from "node:fs";

const routePathArgIndex = process.argv.indexOf("--route");
const routePath =
  routePathArgIndex >= 0 && process.argv[routePathArgIndex + 1]
    ? process.argv[routePathArgIndex + 1]
    : "apps/backend/src/integrations/qbo/qbo-webhook.routes.ts";
const source = fs.readFileSync(routePath, "utf8");

function lineOf(snippet) {
  const idx = source.indexOf(snippet);
  if (idx < 0) return 1;
  return source.slice(0, idx).split("\n").length;
}

const failures = [];

const forbiddenPatterns = [
  /QBO_WEBHOOK_ALLOW_INSECURE_DEV/,
  /qbo_webhook_verifier_token_required_in_production/,
  /throw\s+new\s+Error\([^)]*QBO_WEBHOOK_VERIFIER_TOKEN/i,
];
for (const pattern of forbiddenPatterns) {
  if (pattern.test(source)) {
    failures.push({ rule: 1, line: lineOf(String(pattern)), message: `forbidden legacy pattern: ${pattern}` });
  }
}

if (!source.includes("getRequiredEnvSpec") || !source.includes("getEnvStatus")) {
  failures.push({ rule: 3, line: 1, message: "route does not consult REQUIRED_ENV for QBO_WEBHOOK_VERIFIER_TOKEN" });
}

if (!source.includes('error: "qbo_webhook_verifier_not_configured"') || !source.includes("reply.code(503)")) {
  failures.push({ rule: 4, line: 1, message: "missing fail-closed 503 qbo_webhook_verifier_not_configured handler" });
}

if (!source.includes("verifyIntuitWebhookSignature") || !source.includes('error: "qbo_webhook_signature_invalid"')) {
  failures.push({ rule: 5, line: 1, message: "missing HMAC-SHA256 verification path or invalid-signature 401 response" });
}

if (!source.includes('scoped.post("/api/v1/qbo/webhook"')) {
  failures.push({ rule: 4, line: 1, message: "expected route path /api/v1/qbo/webhook" });
}

if (failures.length > 0) {
  console.error("verify-qbo-webhook-fail-closed failed");
  for (const f of failures) {
    console.error(`${routePath}:${f.line} rule-${f.rule} ${f.message}`);
  }
  process.exit(1);
}

console.log("verify-qbo-webhook-fail-closed: ok");
