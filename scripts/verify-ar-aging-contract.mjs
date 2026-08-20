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

  // ACCT-F5658 — the two assertions this block replaces (`i.amount_open_cents IS NOT NULL` /
  // `i.amount_open_cents > 0`) PINNED the as-of defect: they forced the service onto the LIVE
  // generated column (today's payments) even when the caller asked for a historical as_of_date, so
  // the exported statement invented invoices issued after the date and dropped invoices paid since
  // it — while ap-aging.service.ts already reconstructed open-as-of correctly. Same guard mistake
  // this file's own ACCT-F171 note documents: asserting the callsite instead of the requirement.
  // The contract now asserted is the A/P sibling's own decided pattern, ported:
  assertMatches(
    service,
    /i\.issue_date <= \$2::date/,
    "AR Aging must gate invoice existence on issue_date <= as_of (ACCT-F5658 — never count an invoice issued after the statement date)",
  );
  assertMatches(
    service,
    /p\.payment_date <= \$2::date/,
    "AR Aging must reconstruct paid-as-of from payment_applications joined to payments.payment_date <= as_of (ACCT-F5658 — never read the live amount_open_cents for a dated statement)",
  );
  assertMatches(
    service,
    /GREATEST\(/,
    "AR Aging must clamp the reconstructed outstanding at zero (GREATEST(..., 0))",
  );
  assertMatches(
    service,
    /, 0\) > 0/,
    "AR Aging must enforce a positive reconstructed outstanding in the WHERE clause",
  );
  if (/i\.amount_open_cents/.test(service)) {
    throw new Error(
      "AR Aging must NOT read the live i.amount_open_cents generated column — it reflects TODAY's payments and cannot answer a historical as_of (ACCT-F5658).",
    );
  }
  assertMatches(service, /i\.voided_at IS NULL/, "AR Aging must exclude voided invoices (as-of-aware: voided after the as_of date still counts on it)");
  // ACCT-F171 / CLS-GUARD-PINS-CALLSITE — asserts each element the exclusion MUST contain, so a
  // superset or different ordering passes and a missing element still fails. 'void' is the ONLY
  // spelling invoices_status_check permits; 'proforma' posts NO journal entry (ACCT-F223).
  const statusExclusion = /i\.status NOT IN \(([^)]*)\)/.exec(service);
  if (!statusExclusion) {
    throw new Error("AR Aging must include a status safety-net exclusion (i.status NOT IN (...))");
  }
  for (const required of ["void", "draft", "proforma"]) {
    if (!new RegExp(`'${required}'`).test(statusExclusion[1])) {
      throw new Error(
        `AR Aging status exclusion is missing '${required}'. Found: ${statusExclusion[0]}. ` +
          `Note 'void' is the ONLY spelling accounting.invoices.status can hold — ` +
          `invoices_status_check forbids 'voided', so excluding that alone excludes nothing (ACCT-F171).`,
      );
    }
  }
  // ACCT-F5658 — 'paid' must NOT be excluded by current-state status: an invoice paid TODAY was
  // still open on a historical as_of date. Paid-ness is decided by the dated reconstruction above;
  // a current-state 'paid' exclusion re-introduces the dropped-invoice half of the export bug.
  if (/'paid'/.test(statusExclusion[1])) {
    throw new Error(
      "AR Aging must NOT exclude status='paid' — a since-paid invoice was still open on a historical " +
        "as_of date; the dated payment reconstruction decides paid-ness (ACCT-F5658). Found: " +
        statusExclusion[0],
    );
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
