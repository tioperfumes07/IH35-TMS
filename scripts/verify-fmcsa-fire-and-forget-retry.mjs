#!/usr/bin/env node
/**
 * acct-fmcsa-fire-and-forget-retry
 *
 * Fail-closed static guard: customer create/update must durable-enqueue FMCSA SAFER
 * verification via outbox.events (no void fire-and-forget). Handler + processor must
 * honor retryable vs permanent errors with backoff+jitter. Rule 17: verify-step only
 * (no package.json / workflow hot-file edits).
 *
 * Self-test: node scripts/verify-fmcsa-fire-and-forget-retry.mjs --selftest
 */
import fs from "node:fs";
import path from "node:path";
import process from "node:process";

const ROOT = process.cwd();
const LABEL = "verify:fmcsa-fire-and-forget-retry";

const paths = {
  customersRoutes: path.join(ROOT, "apps/backend/src/mdata/customers.routes.ts"),
  chain: path.join(ROOT, "apps/backend/src/integrations/fmcsa/fmcsa-customer-verify-chain.service.ts"),
  safer: path.join(ROOT, "apps/backend/src/integrations/fmcsa/safer.service.ts"),
  errors: path.join(ROOT, "apps/backend/src/integrations/fmcsa/errors.ts"),
  handler: path.join(ROOT, "apps/backend/src/outbox/handlers/fmcsa-customer-verify.handler.ts"),
  registry: path.join(ROOT, "apps/backend/src/outbox/handlers/registry.ts"),
  processor: path.join(ROOT, "apps/backend/src/outbox/processor.ts"),
  backoff: path.join(ROOT, "apps/backend/src/outbox/retry-backoff.ts"),
  deliveryErrors: path.join(ROOT, "apps/backend/src/outbox/delivery-errors.ts"),
  verifyStep: path.join(ROOT, "scripts/verify-steps/913-verify-fmcsa-fire-and-forget-retry.mjs"),
};

function read(filePath) {
  if (!fs.existsSync(filePath)) throw new Error(`missing file: ${filePath}`);
  return fs.readFileSync(filePath, "utf8");
}

/** @param {Record<string, string>} sources */
export function collectFailures(sources) {
  const failures = [];

  if (/void\s+verifyCustomerWithSafer\s*\(/.test(sources.customersRoutes)) {
    failures.push("customers.routes.ts must not fire-and-forget via void verifyCustomerWithSafer");
  }
  if (!sources.customersRoutes.includes("enqueueFmcsaCustomerVerifyRequested")) {
    failures.push("customers.routes.ts must enqueue FMCSA verify via enqueueFmcsaCustomerVerifyRequested");
  }
  if (!/trigger:\s*"create"/.test(sources.customersRoutes) || !/trigger:\s*"update"/.test(sources.customersRoutes)) {
    failures.push("customers.routes.ts must enqueue on both create and update (MC/DOT change) paths");
  }
  if (!sources.customersRoutes.includes("/api/v1/mdata/customers/:id/verify-fmcsa")) {
    failures.push("manual force verify endpoint must remain");
  }

  if (!sources.chain.includes("INSERT INTO outbox.events")) {
    failures.push("fmcsa-customer-verify-chain must INSERT into outbox.events");
  }
  if (!sources.chain.includes("fmcsa.customer.verify_requested")) {
    failures.push("chain must use event_type fmcsa.customer.verify_requested");
  }
  if (!sources.chain.includes("dedupe_key") || !sources.chain.includes("ON CONFLICT")) {
    failures.push("chain must idempotently enqueue with dedupe_key / ON CONFLICT");
  }
  if (!sources.chain.includes("outbox-handler-parity: literal-types=[\"fmcsa.customer.verify_requested\"]")) {
    failures.push("chain must annotate outbox-handler-parity for fmcsa.customer.verify_requested");
  }
  if (!sources.chain.includes("appendCrudAudit") || !sources.chain.includes("fmcsa_verify_enqueued")) {
    failures.push("chain must emit audit evidence on enqueue (fmcsa_verify_enqueued)");
  }

  if (!sources.registry.includes("FmcsaCustomerVerifyHandler")) {
    failures.push("outbox registry must register FmcsaCustomerVerifyHandler");
  }
  if (!sources.handler.includes("PermanentDeliveryError") || !sources.handler.includes("isRetryableFmcsaError")) {
    failures.push("handler must honor permanent vs retryable errors");
  }
  if (!sources.handler.includes("operating_company_id")) {
    failures.push("handler must tenant-scope via operating_company_id");
  }

  if (!sources.safer.includes("RetryableFmcsaError") || !sources.safer.includes("classifyFmcsaLookupFailure")) {
    failures.push("safer.service must rethrow retryable FMCSA failures (no silent last_checked stamp)");
  }
  if (!sources.errors.includes("RetryableFmcsaError")) {
    failures.push("integrations/fmcsa/errors.ts must export RetryableFmcsaError");
  }

  if (!sources.processor.includes("isPermanentDeliveryError")) {
    failures.push("processor must short-circuit permanent delivery errors to failed_at");
  }
  if (!sources.processor.includes("computeOutboxRetryDelayMs")) {
    failures.push("processor must use bounded exponential backoff helper");
  }
  if (!sources.backoff.includes("computeOutboxRetryDelayMs") || !sources.backoff.includes("OUTBOX_MAX_RETRIES")) {
    failures.push("retry-backoff.ts must export computeOutboxRetryDelayMs + OUTBOX_MAX_RETRIES");
  }
  if (!/jitter/i.test(sources.backoff)) {
    failures.push("retry-backoff.ts must document/implement jitter");
  }
  if (!/Math\.random|random\s*\(/.test(sources.backoff)) {
    failures.push("retry-backoff must apply jitter (random)");
  }

  if (!sources.deliveryErrors.includes("PermanentDeliveryError")) {
    failures.push("delivery-errors.ts must export PermanentDeliveryError");
  }

  if (!fs.existsSync(paths.verifyStep) && !sources.verifyStep) {
    failures.push("Rule-17 verify-step scripts/verify-steps/913-verify-fmcsa-fire-and-forget-retry.mjs must exist");
  } else if (sources.verifyStep !== undefined && !sources.verifyStep.includes("verify-fmcsa-fire-and-forget-retry")) {
    failures.push("verify-step must invoke verify-fmcsa-fire-and-forget-retry (+ --selftest)");
  }

  // No fake verification fixtures in prod path
  if (/NODE_ENV\s*!==\s*['"]production['"].*verifyCustomerWithSafer|fake.*fmcsa|fixture.*safer/i.test(sources.safer)) {
    failures.push("safer.service must not serve fake verification in production");
  }

  return failures;
}

function selftest() {
  const live = {
    customersRoutes: read(paths.customersRoutes),
    chain: read(paths.chain),
    safer: read(paths.safer),
    errors: read(paths.errors),
    handler: read(paths.handler),
    registry: read(paths.registry),
    processor: read(paths.processor),
    backoff: read(paths.backoff),
    deliveryErrors: read(paths.deliveryErrors),
    verifyStep: read(paths.verifyStep),
  };
  const good = collectFailures(live);
  if (good.length) {
    console.error(`${LABEL} SELFTEST FAIL — live sources should pass before selftest`);
    for (const f of good) console.error(`  - ${f}`);
    process.exit(1);
  }

  const planted = collectFailures({
    ...live,
    customersRoutes: live.customersRoutes.replace(
      /await enqueueFmcsaCustomerVerifyRequested/g,
      "void verifyCustomerWithSafer"
    ),
  });
  if (!planted.some((f) => f.includes("void verifyCustomerWithSafer") || f.includes("enqueue"))) {
    console.error(`${LABEL} SELFTEST FAIL — did not detect planted fire-and-forget regression`);
    process.exit(1);
  }

  console.log(`${LABEL} SELFTEST PASS`);
}

function main() {
  const failures = collectFailures({
    customersRoutes: read(paths.customersRoutes),
    chain: read(paths.chain),
    safer: read(paths.safer),
    errors: read(paths.errors),
    handler: read(paths.handler),
    registry: read(paths.registry),
    processor: read(paths.processor),
    backoff: read(paths.backoff),
    deliveryErrors: read(paths.deliveryErrors),
    verifyStep: read(paths.verifyStep),
  });

  if (failures.length) {
    console.error(`${LABEL} FAIL:`);
    for (const f of failures) console.error(`  - ${f}`);
    process.exit(1);
  }

  console.log(`${LABEL} OK — FMCSA SAFER verify uses durable outbox retry (no void drop)`);
}

const isMain = path.resolve(process.argv[1] ?? "") === path.resolve(new URL(import.meta.url).pathname);
if (isMain) {
  if (process.argv.includes("--selftest")) selftest();
  else main();
}
