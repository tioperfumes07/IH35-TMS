#!/usr/bin/env node
/**
 * ACCT-F289 — the zero-rate REFUSAL must never roll back a booking, and must never surface as a 500
 * on the operator from-load route.
 *
 * After GO-19 slice 04 the pickup mint lives in accounting/proforma-mint-on-first-pickup.ts.
 * Booking must not call buildInvoiceFromLoad at all (so the refusal cannot abort a book).
 * The pickup helper must CATCH load_has_no_rate narrowly and re-throw anything else into its
 * savepoint wrapper. invoices.routes.ts still answers load_has_no_rate with a 4xx.
 */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const BOOK = "apps/backend/src/dispatch/book-load.service.ts";
const MINT = "apps/backend/src/accounting/proforma-mint-on-first-pickup.ts";
const ROUTES = "apps/backend/src/accounting/invoices.routes.ts";

const strip = (s) => s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

function checkBookLoad(src) {
  const clean = strip(src);
  const failures = [];
  if (/buildInvoiceFromLoad\(/.test(clean)) {
    failures.push(`${BOOK}: still calls buildInvoiceFromLoad — a zero-rate throw can roll back booking`);
  }
  return failures;
}

function checkMint(src) {
  const clean = strip(src);
  const failures = [];
  const idx = clean.indexOf("buildInvoiceFromLoad(client");
  if (idx === -1) {
    failures.push(`${MINT}: buildInvoiceFromLoad call site not found`);
    return failures;
  }
  const window = clean.slice(Math.max(0, idx - 600), idx + 1600);
  if (!/try\s*\{/.test(window)) {
    failures.push(`${MINT}: buildInvoiceFromLoad has no try/catch — load_has_no_rate can poison pickup`);
  }
  if (!/load_has_no_rate/.test(window)) {
    failures.push(`${MINT}: pickup mint does not handle load_has_no_rate`);
  }
  const hasNarrowRethrow = /code\s*!==\s*["']load_has_no_rate["'][\s\S]{0,80}?throw\s+error/.test(window);
  if (!hasNarrowRethrow) {
    failures.push(`${MINT}: catch around buildInvoiceFromLoad does not re-throw non-load_has_no_rate errors`);
  }
  return failures;
}

function checkRoutes(src) {
  const clean = strip(src);
  const failures = [];
  if (!/load_has_no_rate/.test(clean)) {
    failures.push(`${ROUTES}: the from-load route does not translate load_has_no_rate`);
    return failures;
  }
  if (!/load_has_no_rate[\s\S]{0,400}?reply\s*\.\s*code\(4\d\d\)/.test(clean)) {
    failures.push(`${ROUTES}: load_has_no_rate is mentioned but not answered with a 4xx`);
  }
  return failures;
}

function selftest() {
  const bookSrc = readFileSync(join(ROOT, BOOK), "utf8");
  const mintSrc = readFileSync(join(ROOT, MINT), "utf8");
  const routesSrc = readFileSync(join(ROOT, ROUTES), "utf8");

  const mutatedBook = bookSrc.replace("const load = loadRes.rows[0]", "await buildInvoiceFromLoad(client, {});\n    const load = loadRes.rows[0]");
  if (mutatedBook === bookSrc) {
    console.error("SELFTEST INERT: the book-load mutation did not apply.");
    process.exit(1);
  }
  if (checkBookLoad(mutatedBook).length === 0) {
    console.error("SELFTEST FAILED: guard stayed green when booking calls buildInvoiceFromLoad.");
    process.exit(1);
  }

  const mutatedRethrow = mintSrc.replace(/!==\s*"load_has_no_rate"\)\s*throw error;/, "!== \"__never__\") { /* swallowed */ }");
  if (mutatedRethrow === mintSrc) {
    console.error("SELFTEST INERT: the re-throw mutation did not apply — the guard proves nothing.");
    process.exit(1);
  }
  if (checkMint(mutatedRethrow).length === 0) {
    console.error("SELFTEST FAILED: guard stayed green with a broad catch.");
    process.exit(1);
  }

  const mutatedNoHandle = mintSrc.replaceAll("load_has_no_rate", "load_has_no_rate_XX");
  if (mutatedNoHandle === mintSrc) {
    console.error("SELFTEST INERT: the handling mutation did not apply.");
    process.exit(1);
  }
  if (checkMint(mutatedNoHandle).length === 0) {
    console.error("SELFTEST FAILED: guard stayed green with the pickup call site unprotected.");
    process.exit(1);
  }

  const mutatedRoute = routesSrc.replace(/reply\.code\(422\)/, "reply.code(200)");
  if (mutatedRoute === routesSrc) {
    console.error("SELFTEST INERT: the route mutation did not apply.");
    process.exit(1);
  }
  if (checkRoutes(mutatedRoute).length === 0) {
    console.error("SELFTEST FAILED: guard stayed green with load_has_no_rate answered as a success.");
    process.exit(1);
  }

  return 4;
}

const probesRun = selftest();

const failures = [
  ...checkBookLoad(readFileSync(join(ROOT, BOOK), "utf8")),
  ...checkMint(readFileSync(join(ROOT, MINT), "utf8")),
  ...checkRoutes(readFileSync(join(ROOT, ROUTES), "utf8")),
];

if (failures.length > 0) {
  console.error("ACCT-F289 FAIL — the zero-rate refusal is not scoped to its blast radius:");
  for (const f of failures) console.error(`  - ${f}`);
  process.exit(1);
}

console.log(
  `ACCT-F289 PASS — call sites checked: book does not mint, ${MINT} + ${ROUTES}; ` +
    `mutation probes proven non-inert: ${probesRun}.`
);
