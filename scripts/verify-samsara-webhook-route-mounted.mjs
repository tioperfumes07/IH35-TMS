#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";

const ROOT = process.cwd();

function fail(message) {
  console.error(`verify:samsara-webhook-route-mounted FAILED\n- ${message}`);
  process.exit(1);
}

const indexPath = path.join(ROOT, "apps/backend/src/index.ts");
const routesPath = path.join(ROOT, "apps/backend/src/integrations/samsara/samsara-webhook.routes.ts");

for (const p of [indexPath, routesPath]) {
  if (!fs.existsSync(p)) fail(`missing ${p}`);
}

const indexSrc = fs.readFileSync(indexPath, "utf8");
const routesSrc = fs.readFileSync(routesPath, "utf8");

if (!indexSrc.includes("registerSamsaraWebhookRoutes")) {
  fail("index.ts must call registerSamsaraWebhookRoutes");
}
if (!indexSrc.includes("await registerSamsaraWebhookRoutes(app)")) {
  fail("index.ts must await registerSamsaraWebhookRoutes(app)");
}

const requiredPaths = [
  "/api/v1/integrations/samsara/webhook",
  "/api/v1/samsara/webhooks",
];
for (const mountPath of requiredPaths) {
  if (!routesSrc.includes(mountPath)) {
    fail(`samsara-webhook.routes.ts must register POST ${mountPath}`);
  }
}

if (!routesSrc.includes("resolveSamsaraWebhookSigningSecret")) {
  fail("webhook handler must resolve per-tenant signing secret");
}

console.log("verify:samsara-webhook-route-mounted OK");
