#!/usr/bin/env node
/**
 * acct-fmcsa-fire-and-forget-retry
 *
 * Fail-closed semantic guard. Self-test plants:
 *  - bad conflict target (missing WHERE on partial unique index)
 *  - lifetime reenqueue blocked (no dedupe_key release on terminal)
 *  - 429 → null swallow / missing Retry-After parse
 *  - cache-poison last_checked on retryable
 *  - manual verify swallows retryable into fake completion
 *
 * Rule 17: verify-step only (no package.json / workflow thrash).
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
  httpErrors: path.join(ROOT, "apps/backend/src/lib/fmcsa-http-errors.ts"),
  fmcsaClient: path.join(ROOT, "apps/backend/src/lib/fmcsa-client.ts"),
  handler: path.join(ROOT, "apps/backend/src/outbox/handlers/fmcsa-customer-verify.handler.ts"),
  registry: path.join(ROOT, "apps/backend/src/outbox/handlers/registry.ts"),
  processor: path.join(ROOT, "apps/backend/src/outbox/processor.ts"),
  reusableDedupe: path.join(ROOT, "apps/backend/src/outbox/reusable-dedupe.ts"),
  backoff: path.join(ROOT, "apps/backend/src/outbox/retry-backoff.ts"),
  deliveryErrors: path.join(ROOT, "apps/backend/src/outbox/delivery-errors.ts"),
  verifyStep: path.join(ROOT, "scripts/verify-steps/913-verify-fmcsa-fire-and-forget-retry.mjs"),
  dbTest: path.join(ROOT, "apps/backend/src/integrations/fmcsa/__tests__/fmcsa-outbox-dedupe.db.test.ts"),
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
  if (!sources.customersRoutes.includes("fmcsa_verify_retryable") || !sources.customersRoutes.includes("reply.code(503)")) {
    failures.push("manual verify must map transient failure to truthful 503 fmcsa_verify_retryable (no fake completion)");
  }
  if (!sources.customersRoutes.includes("retryable: true")) {
    failures.push("manual verify 503 body must include retryable: true");
  }

  if (!sources.chain.includes("INSERT INTO outbox.events")) {
    failures.push("fmcsa-customer-verify-chain must INSERT into outbox.events");
  }
  {
    // Require the conflict predicate on the INSERT statement (not only a comment).
    const insertIdx = sources.chain.search(/INSERT\s+INTO\s+outbox\.events/i);
    const insertSlice = insertIdx >= 0 ? sources.chain.slice(insertIdx, insertIdx + 500) : "";
    if (!/ON CONFLICT\s*\(\s*dedupe_key\s*\)\s*WHERE\s+dedupe_key\s+IS\s+NOT\s+NULL\s+DO\s+NOTHING/i.test(insertSlice)) {
      failures.push("chain must use ON CONFLICT (dedupe_key) WHERE dedupe_key IS NOT NULL (partial unique index predicate)");
    }
  }
  if (!sources.chain.includes("fmcsa_verify_enqueued") || !sources.chain.includes("fmcsa_verify_deduped")) {
    failures.push("chain must audit enqueue AND dedupe outcomes");
  }
  if (!sources.chain.includes("outbox-handler-parity: literal-types=[\"fmcsa.customer.verify_requested\"]")) {
    failures.push("chain must annotate outbox-handler-parity for fmcsa.customer.verify_requested");
  }

  if (!sources.reusableDedupe.includes("fmcsa.customer.verify_requested") || !sources.reusableDedupe.includes("shouldReleaseOutboxDedupeKey")) {
    failures.push("reusable-dedupe must list fmcsa.customer.verify_requested for terminal dedupe_key release");
  }
  if (!sources.processor.includes("dedupe_key = NULL") || !sources.processor.includes("shouldReleaseOutboxDedupeKey")) {
    failures.push("processor must release dedupe_key on terminal FMCSA events (lifetime re-enqueue)");
  }
  if (!sources.processor.includes("OUTBOX_CLAIM_IS_GLOBAL_ARCHITECTURAL")) {
    failures.push("processor must document global claim + payload tenant safety contract");
  }
  if (!sources.processor.includes("retryAfterMsFromError")) {
    failures.push("processor must honor bounded Retry-After from typed FMCSA errors");
  }

  if (!sources.handler.includes("operating_company_id = $2") && !sources.handler.includes("operating_company_id = $2::uuid")) {
    failures.push("handler must tenant-scope customer load (no cross-tenant processing)");
  }
  if (!sources.handler.includes("fmcsa_customer_missing_or_cross_tenant")) {
    failures.push("handler must permanently fail cross-tenant / missing customer");
  }

  if (!sources.httpErrors.includes("parseRetryAfterMs") || !sources.httpErrors.includes("FmcsaRetryableError")) {
    failures.push("fmcsa-http-errors must export typed retryable + parseRetryAfterMs");
  }
  if (!sources.fmcsaClient.includes("FmcsaRetryableError") || !sources.fmcsaClient.includes("429")) {
    failures.push("fmcsa-client must throw typed retryable on 429");
  }
  if (!sources.fmcsaClient.includes("parseRetryAfterMs") && !sources.fmcsaClient.includes("retry-after")) {
    failures.push("fmcsa-client must read Retry-After header");
  }
  if (/status === 429[\s\S]{0,80}return null/.test(sources.fmcsaClient)) {
    failures.push("fmcsa-client must not swallow 429 as null");
  }
  if (!sources.fmcsaClient.includes("FmcsaPermanentError")) {
    failures.push("fmcsa-client must classify non-404 4xx as permanent");
  }

  if (!sources.safer.includes("isFmcsaRetryableError") && !sources.safer.includes("RetryableFmcsaError")) {
    failures.push("safer.service must rethrow retryable without last_checked stamp");
  }
  if (!sources.safer.includes("isFmcsaPermanentError") && !sources.safer.includes("FmcsaPermanentError")) {
    failures.push("safer.service must rethrow permanent without last_checked stamp");
  }

  if (!sources.registry.includes("FmcsaCustomerVerifyHandler")) {
    failures.push("outbox registry must register FmcsaCustomerVerifyHandler");
  }
  if (!sources.backoff.includes("computeOutboxRetryDelayMs") || !/jitter/i.test(sources.backoff)) {
    failures.push("retry-backoff must implement bounded exponential backoff + jitter");
  }
  if (!sources.deliveryErrors.includes("PermanentDeliveryError")) {
    failures.push("delivery-errors.ts must export PermanentDeliveryError");
  }

  if (!sources.dbTest || !sources.dbTest.includes("ON CONFLICT") || !sources.dbTest.includes("ux_outbox_events_dedupe_key")) {
    failures.push("db integration test must exercise real PG partial unique index concurrent dedupe");
  }
  if (!sources.dbTest.includes("ROLLBACK") || !sources.dbTest.includes("re-enqueue")) {
    failures.push("db integration test must cover same-txn rollback and terminal re-enqueue");
  }

  if (!fs.existsSync(paths.verifyStep) && sources.verifyStep === undefined) {
    failures.push("Rule-17 verify-step 913-verify-fmcsa-fire-and-forget-retry.mjs must exist");
  } else if (sources.verifyStep !== undefined && !sources.verifyStep.includes("--selftest")) {
    failures.push("verify-step must invoke --selftest");
  }

  return failures;
}

function selftest() {
  const live = {
    customersRoutes: read(paths.customersRoutes),
    chain: read(paths.chain),
    safer: read(paths.safer),
    errors: read(paths.errors),
    httpErrors: read(paths.httpErrors),
    fmcsaClient: read(paths.fmcsaClient),
    handler: read(paths.handler),
    registry: read(paths.registry),
    processor: read(paths.processor),
    reusableDedupe: read(paths.reusableDedupe),
    backoff: read(paths.backoff),
    deliveryErrors: read(paths.deliveryErrors),
    verifyStep: read(paths.verifyStep),
    dbTest: read(paths.dbTest),
  };
  const good = collectFailures(live);
  if (good.length) {
    console.error(`${LABEL} SELFTEST FAIL — live sources should pass before selftest`);
    for (const f of good) console.error(`  - ${f}`);
    process.exit(1);
  }

  const plants = [
    {
      name: "fire-and-forget void",
      mutate: (s) => ({
        ...s,
        customersRoutes: s.customersRoutes.replace(/await enqueueFmcsaCustomerVerifyRequested/g, "void verifyCustomerWithSafer"),
      }),
      expect: (f) => f.some((x) => /void verifyCustomerWithSafer|enqueue/i.test(x)),
    },
    {
      name: "bad conflict target (missing WHERE predicate)",
      mutate: (s) => ({
        ...s,
        chain: s.chain.replace(
          /ON CONFLICT\s*\(\s*dedupe_key\s*\)\s*WHERE\s+dedupe_key\s+IS\s+NOT\s+NULL\s+DO\s+NOTHING/gi,
          "ON CONFLICT (dedupe_key) DO NOTHING"
        ),
      }),
      expect: (f) => f.some((x) => /WHERE dedupe_key IS NOT NULL|partial unique/i.test(x)),
    },
    {
      name: "lifetime reenqueue blocked (no dedupe release)",
      mutate: (s) => ({
        ...s,
        processor: s.processor.replace(/dedupe_key = NULL/g, "/* no release */"),
      }),
      expect: (f) => f.some((x) => /release dedupe_key|lifetime re-enqueue/i.test(x)),
    },
    {
      name: "429 swallowed as null",
      mutate: (s) => ({
        ...s,
        fmcsaClient: s.fmcsaClient.replace(/if \(status === 429\) return "retryable";/, 'if (status === 429) return null;'),
      }),
      expect: (f) => f.some((x) => /429/i.test(x)),
    },
    {
      name: "missing Retry-After parse",
      mutate: (s) => ({
        ...s,
        httpErrors: s.httpErrors.replace(/parseRetryAfterMs/g, "parseRetryAfterMissing"),
        fmcsaClient: s.fmcsaClient.replace(/parseRetryAfterMs/g, "parseRetryAfterMissing").replace(/retry-after/g, "x-no-retry"),
      }),
      expect: (f) => f.some((x) => /Retry-After|parseRetryAfter/i.test(x)),
    },
    {
      name: "manual swallow retryable",
      mutate: (s) => ({
        ...s,
        customersRoutes: s.customersRoutes
          .replace(/fmcsa_verify_retryable/g, "fmcsa_ok")
          .replace(/reply\.code\(503\)/g, "reply.code(200)"),
      }),
      expect: (f) => f.some((x) => /503|fmcsa_verify_retryable|fake completion/i.test(x)),
    },
    {
      name: "cache-poison path (safer drops retryable rethrow)",
      mutate: (s) => ({
        ...s,
        safer: s.safer.replace(/isFmcsaRetryableError/g, "isNeverRetryable").replace(/RetryableFmcsaError/g, "NeverRetryable"),
      }),
      expect: (f) => f.some((x) => /rethrow retryable|last_checked/i.test(x)),
    },
  ];

  for (const plant of plants) {
    const planted = collectFailures(plant.mutate(live));
    if (!plant.expect(planted)) {
      console.error(`${LABEL} SELFTEST FAIL — plant "${plant.name}" not detected`);
      console.error(planted);
      process.exit(1);
    }
  }

  console.log(`${LABEL} SELFTEST PASS (${plants.length} plants)`);
}

function main() {
  const failures = collectFailures({
    customersRoutes: read(paths.customersRoutes),
    chain: read(paths.chain),
    safer: read(paths.safer),
    errors: read(paths.errors),
    httpErrors: read(paths.httpErrors),
    fmcsaClient: read(paths.fmcsaClient),
    handler: read(paths.handler),
    registry: read(paths.registry),
    processor: read(paths.processor),
    reusableDedupe: read(paths.reusableDedupe),
    backoff: read(paths.backoff),
    deliveryErrors: read(paths.deliveryErrors),
    verifyStep: read(paths.verifyStep),
    dbTest: read(paths.dbTest),
  });

  if (failures.length) {
    console.error(`${LABEL} FAIL:`);
    for (const f of failures) console.error(`  - ${f}`);
    process.exit(1);
  }

  console.log(`${LABEL} OK — FMCSA SAFER durable outbox retry (conflict predicate + lifetime reenqueue + typed HTTP)`);
}

const isMain = path.resolve(process.argv[1] ?? "") === path.resolve(new URL(import.meta.url).pathname);
if (isMain) {
  if (process.argv.includes("--selftest")) selftest();
  else main();
}
