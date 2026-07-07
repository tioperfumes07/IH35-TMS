#!/usr/bin/env node
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

console.log("verify:custvend-par1 — OK");
