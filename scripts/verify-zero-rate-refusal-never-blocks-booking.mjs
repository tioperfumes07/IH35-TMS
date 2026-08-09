#!/usr/bin/env node
/**
 * ACCT-F289 — the zero-rate REFUSAL must never roll back a booking, and must never surface as a 500.
 *
 * ACCT-F267 taught accounting/from-load.ts to throw `load_has_no_rate` instead of minting a
 * permanently $0 invoice. Correct — but the refusal was never scoped to its blast radius:
 *
 *   1. dispatch/book-load.service.ts awaits buildInvoiceFromLoad INSIDE the booking transaction on
 *      the booking client. An uncaught throw there rolls the whole booking back, so a rate-late
 *      load (bookLoadRateTotalCents([]) === 0) could not be booked AT ALL. Verified live on prod
 *      br-fancy-credit-akjnd07a: broker_advance_applied_cents EXISTS (so the throwing branch is the
 *      one that runs) and INVOICE_PROFORMA_PIPELINE_ENABLED is enabled=true on all three entities.
 *
 *   2. accounting/invoices.routes.ts translated only `load_not_found`, so the user's own
 *      create-invoice-from-load action answered with an opaque 500.
 *
 * This guard asserts BOTH sites handle the code, and — critically — that book-load's catch is
 * NARROW: a bare `catch {}` there would satisfy a naive "is it caught" test while silently eating
 * every other booking failure, which is the exact opposite of the "failures are loud" policy the
 * surrounding code sets out. So the catch must re-throw anything that is not `load_has_no_rate`.
 *
 * Selftest mutates each real source and asserts the mutation APPLIED before reading the verdict —
 * a probe that silently fails to apply produces a green that means nothing.
 */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const BOOK = "apps/backend/src/dispatch/book-load.service.ts";
const ROUTES = "apps/backend/src/accounting/invoices.routes.ts";

const strip = (s) => s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

/** book-load must CATCH load_has_no_rate, and must RE-THROW everything else. */
function checkBookLoad(src) {
  const clean = strip(src);
  const failures = [];

  const idx = clean.indexOf("buildInvoiceFromLoad(client");
  if (idx === -1) {
    failures.push(`${BOOK}: buildInvoiceFromLoad call site not found — guard is looking at the wrong file`);
    return failures;
  }
  // Window around the call: the try/catch that wraps it.
  const window = clean.slice(Math.max(0, idx - 600), idx + 1600);

  if (!/try\s*\{/.test(window)) {
    failures.push(
      `${BOOK}: buildInvoiceFromLoad is awaited inside the booking transaction with no try/catch — ` +
        `a zero-rate load (ACCT-F267 throws load_has_no_rate) rolls the entire booking back (ACCT-F289)`
    );
  }
  if (!/load_has_no_rate/.test(window)) {
    failures.push(
      `${BOOK}: the booking call site does not handle load_has_no_rate — the ACCT-F267 refusal ` +
        `blocks dispatch from booking a rate-late load (ACCT-F289)`
    );
  }
  // The catch must be narrow. Require an explicit re-throw of non-matching errors.
  const hasNarrowRethrow = /code\s*!==\s*["']load_has_no_rate["'][\s\S]{0,80}?throw\s+error/.test(window);
  if (!hasNarrowRethrow) {
    failures.push(
      `${BOOK}: the catch around buildInvoiceFromLoad does not re-throw non-load_has_no_rate errors — ` +
        `a broad catch silently swallows real booking failures ("failures are loud") (ACCT-F289)`
    );
  }
  return failures;
}

/** the from-load route must translate load_has_no_rate to a 4xx, not let it 500. */
function checkRoutes(src) {
  const clean = strip(src);
  const failures = [];
  if (!/load_has_no_rate/.test(clean)) {
    failures.push(
      `${ROUTES}: the from-load route does not translate load_has_no_rate — the ACCT-F267 refusal ` +
        `reaches the user as an opaque 500 (ACCT-F289)`
    );
    return failures;
  }
  if (!/load_has_no_rate[\s\S]{0,400}?reply\s*\.\s*code\(4\d\d\)/.test(clean)) {
    failures.push(
      `${ROUTES}: load_has_no_rate is mentioned but not answered with a 4xx (ACCT-F289)`
    );
  }
  return failures;
}

function selftest() {
  const bookSrc = readFileSync(join(ROOT, BOOK), "utf8");
  const routesSrc = readFileSync(join(ROOT, ROUTES), "utf8");

  // Each probe asserts the mutation APPLIED, then asserts the guard reddens on it.

  // 1. book-load with the narrow re-throw removed must RED.
  const mutatedRethrow = bookSrc.replace(/!==\s*"load_has_no_rate"\)\s*throw error;/, "!== \"__never__\") { /* swallowed */ }");
  if (mutatedRethrow === bookSrc) {
    console.error("SELFTEST INERT: the re-throw mutation did not apply — the guard proves nothing.");
    process.exit(1);
  }
  if (checkBookLoad(mutatedRethrow).length === 0) {
    console.error("SELFTEST FAILED: guard stayed green with a broad catch that swallows every booking error.");
    process.exit(1);
  }

  // 2. book-load with load_has_no_rate handling stripped entirely must RED.
  const mutatedNoHandle = bookSrc.replaceAll("load_has_no_rate", "load_has_no_rate_XX");
  if (mutatedNoHandle === bookSrc) {
    console.error("SELFTEST INERT: the handling mutation did not apply.");
    process.exit(1);
  }
  if (checkBookLoad(mutatedNoHandle).length === 0) {
    console.error("SELFTEST FAILED: guard stayed green with the booking call site unprotected.");
    process.exit(1);
  }

  // 3. the route with its 4xx downgraded to a re-throw must RED.
  const mutatedRoute = routesSrc.replace(/reply\.code\(422\)/, "reply.code(200)");
  if (mutatedRoute === routesSrc) {
    console.error("SELFTEST INERT: the route mutation did not apply.");
    process.exit(1);
  }
  if (checkRoutes(mutatedRoute).length === 0) {
    console.error("SELFTEST FAILED: guard stayed green with load_has_no_rate answered as a success.");
    process.exit(1);
  }

  return 3;
}

const probesRun = selftest();

const failures = [
  ...checkBookLoad(readFileSync(join(ROOT, BOOK), "utf8")),
  ...checkRoutes(readFileSync(join(ROOT, ROUTES), "utf8")),
];

if (failures.length > 0) {
  console.error("ACCT-F289 FAIL — the zero-rate refusal is not scoped to its blast radius:");
  for (const f of failures) console.error(`  - ${f}`);
  process.exit(1);
}

console.log(
  `ACCT-F289 PASS — call sites checked: 2 of 2 (${BOOK}, ${ROUTES}); ` +
    `mutation probes proven non-inert: ${probesRun}. ` +
    `detention-approval.service.ts is OUT OF SCOPE by construction: bridgeDetentionToBilling raises ` +
    `rate_total_cents before the call, so the rate is positive and the refusal cannot fire.`
);
