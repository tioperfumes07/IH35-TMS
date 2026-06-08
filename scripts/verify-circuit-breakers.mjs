#!/usr/bin/env node
/**
 * BLOCK-05 — Circuit breaker integration audit.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

const REQUIRED = [
  {
    file: "apps/backend/src/lib/circuit-breaker/registry.ts",
    needles: ["BREAKER_CONFIGS", "withCircuitBreaker", "qbo", "samsara", "plaid", "sentry", "openai", "comdata", "relay"],
  },
  {
    file: "apps/backend/src/integrations/qbo/qbo-client.ts",
    needles: ["withCircuitBreaker", '"qbo"'],
  },
  {
    file: "apps/backend/src/integrations/samsara/samsara-client.ts",
    needles: ["withCircuitBreaker", '"samsara"'],
  },
  {
    file: "apps/backend/src/integrations/samsara/vehicle-driver-pairing/pairing.service.ts",
    needles: ["withCircuitBreaker", '"samsara"'],
  },
  {
    file: "apps/backend/src/integrations/plaid/plaid.service.ts",
    needles: ["withCircuitBreaker", "withPlaidCircuit", '"plaid"'],
  },
  {
    file: "apps/backend/src/safety/photo-comparison/anthropic-client.ts",
    needles: ["withCircuitBreaker", '"openai"'],
    optional: true,
  },
  {
    file: "docs/runbooks/external-deps-degradation.md",
    needles: ["QBO", "Samsara", "Plaid", "Half-open"],
  },
  {
    file: "apps/backend/src/lib/circuit-breaker/__tests__/circuit-breaker.test.ts",
    needles: ["CircuitBreakerOpenError", "half-open"],
  },
];

function fail(msg) {
  console.error(`verify:circuit-breakers FAIL: ${msg}`);
  process.exit(1);
}

for (const req of REQUIRED) {
  const abs = path.join(ROOT, req.file);
  if (!fs.existsSync(abs)) {
    if (req.optional) continue;
    fail(`missing ${req.file}`);
  }
  const src = fs.readFileSync(abs, "utf8");
  for (const needle of req.needles) {
    if (!src.includes(needle)) fail(`${req.file} must contain ${needle}`);
  }
}

const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, "package.json"), "utf8"));
if (!pkg.dependencies?.opossum) fail("package.json must list opossum dependency");

console.log("verify:circuit-breakers OK");
