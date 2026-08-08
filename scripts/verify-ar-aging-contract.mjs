#!/usr/bin/env node
import fs from "node:fs";

function read(path) {
  return fs.readFileSync(path, "utf8");
}

function assertIncludes(source, needle, message) {
  if (!source.includes(needle)) throw new Error(message);
}

function assertMatches(source, regex, message) {
  if (!regex.test(source)) throw new Error(message);
}

function assertRoutesLoaded(indexSource, legacyNeedle, message) {
  if (indexSource.includes(legacyNeedle)) return;
  if (indexSource.includes("app.register(autoload")) return;
  throw new Error(message);
}

try {
  const routesPath = "apps/backend/src/accounting/ar-aging.routes.ts";
  const servicePath = "apps/backend/src/accounting/ar-aging.service.ts";
  const indexPath = "apps/backend/src/accounting/index.ts";

  const routes = read(routesPath);
  const service = read(servicePath);
  const index = read(indexPath);

  assertIncludes(routes, 'app.get("/api/v1/accounting/ar-aging"', "AR Aging route is missing");
  if (routes.includes('app.post("/api/v1/accounting/ar-aging"')) {
    throw new Error("AR Aging route must be GET-only");
  }

  if (/\b(INSERT|UPDATE|DELETE|CREATE|ALTER|DROP)\b/i.test(service)) {
    throw new Error("AR Aging service must be SQL read-only (write SQL keyword found)");
  }

  assertMatches(service, /i\.amount_open_cents IS NOT NULL/, "AR Aging must exclude null outstanding balances");
  assertMatches(service, /i\.amount_open_cents > 0/, "AR Aging must enforce positive outstanding balances");
  assertMatches(service, /i\.voided_at IS NULL/, "AR Aging must exclude voided invoices");
  // ACCT-F171 / CLS-GUARD-PINS-CALLSITE — this used to assert the EXACT tuple
  // `i.status NOT IN ('paid', 'voided', 'draft')`, which pinned the defect instead of the
  // requirement. `accounting.invoices.status` spells a void as 'void' and `invoices_status_check`
  // FORBIDS 'voided', so that predicate excluded nothing: one invoice with status='void' and
  // voided_at NULL was counted, and USMCA reported $4,325.50 of receivables where $1,875.50 was real.
  // Adding the missing 'void' — the fix — turned this guard RED, which is a guard punishing a correct
  // change. It now asserts each element the exclusion MUST contain, so a superset or a different
  // ordering passes and a missing element still fails.
  const statusExclusion = /i\.status NOT IN \(([^)]*)\)/.exec(service);
  if (!statusExclusion) {
    throw new Error("AR Aging must include a status safety-net exclusion (i.status NOT IN (...))");
  }
  for (const required of ["paid", "void", "draft"]) {
    if (!new RegExp(`'${required}'`).test(statusExclusion[1])) {
      throw new Error(
        `AR Aging status exclusion is missing '${required}'. Found: ${statusExclusion[0]}. ` +
          `Note 'void' is the ONLY spelling accounting.invoices.status can hold — ` +
          `invoices_status_check forbids 'voided', so excluding that alone excludes nothing (ACCT-F171).`,
      );
    }
  }

  assertIncludes(
    service,
    "customer.total_outstanding =",
    "Per-customer total_outstanding must be derived from bucket amounts",
  );
  assertIncludes(
    service,
    "acc.total_outstanding += row.total_outstanding;",
    "Grand total_outstanding must be derived from report customer rows",
  );

  assertRoutesLoaded(index, "registerArAgingRoutes", "AR Aging routes are not registered in accounting index");

  console.log("verify:ar-aging-contract — OK");
} catch (error) {
  console.error(`verify:ar-aging-contract — FAILED: ${error.message}`);
  process.exit(1);
}
