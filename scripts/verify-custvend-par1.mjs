#!/usr/bin/env node
/** @matrix-built {"modules":["dispatch"],"cols":["connectivity"],"leaves":["dispatch.modal.book_load_modal_v4"],"task":"DSP-F7068-CREDIT-OVERRIDE-AUDIT-ATOMIC","vertical":"class-sweep"} */
import fs from "node:fs";
import path from "node:path";

const ROOT = process.cwd();

function fail(messages) {
  console.error("verify:custvend-par1 — FAILED");
  for (const message of messages) {
    console.error(`- ${message}`);
  }
  process.exit(1);
}

const failures = [];
const loadRouteRel = "apps/backend/src/dispatch/loads.routes.ts";
const bookLoadRel = "apps/backend/src/dispatch/book-load.service.ts";

function auditDispatchCreditOverride(routeText, bookText) {
  const problems = [];
  if (!routeText.includes("creditLimitOverrideAuthorized:")) problems.push("dispatch route must pass an authorization-derived override signal");
  if (!routeText.includes('Boolean(body.data.override_credit_limit && ["Owner", "Administrator", "Manager"].includes(authUser.role))')) problems.push("dispatch route must derive override authorization from the authenticated role");
  if (/dispatch\.loads\.credit_limit_override[\s\S]{0,500}\.catch\(\(\) => \{\}\)/.test(routeText)) problems.push("credit override audit must not remain fire-and-forget/swallowed in the route");
  if (!bookText.includes("creditLimitOverrideAuthorized?: boolean")) problems.push("bookLoad input must carry the internal authorization-derived signal");
  if (!bookText.includes("if (input.creditLimitOverrideAuthorized)")) problems.push("bookLoad transaction must gate the audit on the internal signal");
  const eventAt = bookText.indexOf('"dispatch.loads.credit_limit_override"');
  if (eventAt < 0) problems.push("bookLoad transaction must append the credit override audit");
  const auditBlock = eventAt < 0 ? "" : bookText.slice(eventAt, eventAt + 450);
  if (!auditBlock.includes("load_uuid: load.id") || !auditBlock.includes("customer_id: input.customer_id")) problems.push("override audit must identify the created load and customer");
  return problems;
}

const loadRouteText = fs.readFileSync(path.join(ROOT, loadRouteRel), "utf8");
const bookLoadText = fs.readFileSync(path.join(ROOT, bookLoadRel), "utf8");
failures.push(...auditDispatchCreditOverride(loadRouteText, bookLoadText));

// G1: Credit limit enforcement in invoices.routes.ts
{
  const rel = "apps/backend/src/accounting/invoices.routes.ts";
  const abs = path.join(ROOT, rel);
  if (!fs.existsSync(abs)) {
    failures.push(`${rel}:1 file missing`);
  } else {
    const text = fs.readFileSync(abs, "utf8");
    if (!text.includes("credit_limit_cents")) {
      failures.push(`${rel}:1 missing credit_limit_cents check (G1 enforcement)`);
    }
    if (!text.includes("credit_limit_exceeded")) {
      failures.push(`${rel}:1 missing credit_limit_exceeded error code (G1 enforcement)`);
    }
    if (!text.includes("override_credit_limit")) {
      failures.push(`${rel}:1 missing override_credit_limit field (G1 manager override)`);
    }
    if (!text.includes("open_invoice_cents")) {
      failures.push(`${rel}:1 missing open_invoice_cents exposure query (G1 check)`);
    }
  }
}

// G1: Credit limit enforcement in loads.routes.ts
{
  const rel = "apps/backend/src/dispatch/loads.routes.ts";
  const abs = path.join(ROOT, rel);
  if (!fs.existsSync(abs)) {
    failures.push(`${rel}:1 file missing`);
  } else {
    const text = fs.readFileSync(abs, "utf8");
    if (!text.includes("credit_limit_cents")) {
      failures.push(`${rel}:1 missing credit_limit_cents check (G1 enforcement in dispatch)`);
    }
    if (!text.includes("credit_limit_exceeded")) {
      failures.push(`${rel}:1 missing credit_limit_exceeded error code (G1 dispatch path)`);
    }
    if (!text.includes("override_credit_limit")) {
      failures.push(`${rel}:1 missing override_credit_limit field (G1 dispatch override)`);
    }
  }
}

// G2: Vendor credits routes registered in index.ts
{
  const rel = "apps/backend/src/index.ts";
  const abs = path.join(ROOT, rel);
  if (!fs.existsSync(abs)) {
    failures.push(`${rel}:1 file missing`);
  } else {
    const text = fs.readFileSync(abs, "utf8");
    if (!text.includes("registerVendorCreditsRoutes")) {
      failures.push(`${rel}:1 missing registerVendorCreditsRoutes call (G2 vendor credits wiring)`);
    }
  }
}

// G2: Vendor credits routes file exists with required endpoints
{
  const rel = "apps/backend/src/accounting/vendor-credits.routes.ts";
  const abs = path.join(ROOT, rel);
  if (!fs.existsSync(abs)) {
    failures.push(`${rel}:1 vendor-credits.routes.ts missing (G2)`);
  } else {
    const text = fs.readFileSync(abs, "utf8");
    if (!text.includes("/api/v1/accounting/vendor-credits")) {
      failures.push(`${rel}:1 missing vendor-credits route path (G2)`);
    }
    if (!text.includes("vendor_credit_applications")) {
      failures.push(`${rel}:1 missing vendor_credit_applications table reference (G2 junction table)`);
    }
    if (!text.includes("over_apply_refused")) {
      failures.push(`${rel}:1 missing over_apply_refused guard (G2 apply protection)`);
    }
  }
}

// G2: Migration for vendor_credit_applications exists
{
  const migDir = path.join(ROOT, "db/migrations");
  const files = fs.readdirSync(migDir);
  const hasMig = files.some((f) => f.includes("custvend") && f.includes("vendor_credit_applications"));
  if (!hasMig) {
    failures.push(`db/migrations:1 missing vendor_credit_applications migration (G2)`);
  }
}

if (failures.length > 0) {
  fail(failures);
}

if (process.argv.includes("--selftest")) {
  const mutants = [
    ["derived signal", loadRouteText.replace("creditLimitOverrideAuthorized:", "creditLimitOverrideAuthorizedBroken:"), bookLoadText],
    ["role gate", loadRouteText.replace('Boolean(body.data.override_credit_limit && ["Owner", "Administrator", "Manager"].includes(authUser.role))', "Boolean(body.data.override_credit_limit)"), bookLoadText],
    ["transaction gate", loadRouteText, bookLoadText.replace("if (input.creditLimitOverrideAuthorized)", "if (false)")],
    ["load identity", loadRouteText, bookLoadText.replace(/("dispatch\.loads\.credit_limit_override"[\s\S]{0,300})load_uuid: load\.id/, "$1load_uuid: null")],
  ];
  for (const [name, routeMutant, bookMutant] of mutants) {
    if (auditDispatchCreditOverride(routeMutant, bookMutant).length === 0) fail([`selftest mutation survived: ${name}`]);
  }
  console.log(`verify:custvend-par1 — SELFTEST PASS (${mutants.length}/4 planted override-audit defects rejected)`);
  process.exit(0);
}

console.log("verify:custvend-par1 — OK");
