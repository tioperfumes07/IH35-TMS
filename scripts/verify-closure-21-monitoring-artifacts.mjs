#!/usr/bin/env node
/** CLOSURE-21 CI guard — production monitoring + alerting artifacts present. */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = "verify-closure-21-monitoring-artifacts";

const REQUIRED = [
  "apps/backend/src/observability/sentry.ts",
  "apps/backend/src/observability/structured-logger.ts",
  "apps/frontend/src/observability/sentry-client.ts",
  "apps/driver-pwa/src/observability/sentry-pwa.ts",
  "docs/runbooks/MONITORING-PLAYBOOK.md",
  "docs/runbooks/INCIDENT-RESPONSE.md",
  "scripts/uptime-monitor-config.mjs",
  "scripts/verify-sentry-receives-test-error.mjs",
  ".block-ready/CLOSURE-21-MONITORING-SETUP.json",
];

for (const rel of REQUIRED) {
  if (!fs.existsSync(path.join(ROOT, rel))) {
    console.error(`[${LABEL}] FAIL missing ${rel}`);
    process.exit(1);
  }
}

console.log(`[${LABEL}] PASS (${REQUIRED.length} monitoring artifacts present)`);
