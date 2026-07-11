#!/usr/bin/env node
/**
 * verify-manual-txn-date-patch.mjs  (Doc-18 GAP B — governed manual-transaction date PATCH)
 *
 * QBO lets you edit a MANUALLY-entered transaction's date; a bank-fed (Plaid/QBO/CSV import) row's date is
 * locked. The backend PATCH /api/v1/banking/transactions/:id must exist AND must be manual-only:
 *   - the UPDATE of transaction_date is gated on  source = 'manual'  AND  plaid_transaction_id IS NULL
 *   - a bank-fed row is rejected with a clear error (bank_fed_transaction_date_locked), never mutated.
 *
 * This guard FAILS if the PATCH route is missing, or if it could edit a bank-fed row (the manual-only
 * WHERE guard is absent). It keeps the fix from silently regressing into "any transaction date is editable".
 *
 * Usage:
 *   node scripts/verify-manual-txn-date-patch.mjs            # scan
 *   node scripts/verify-manual-txn-date-patch.mjs --selftest # inject a regression -> must FAIL
 */
import fs from "node:fs";
import path from "node:path";
import process from "node:process";

const repoRoot = process.cwd();
const ROUTE_FILE = "apps/backend/src/integrations/plaid/link.routes.ts";
const ROUTE_MARK = /app\.patch\(\s*["'`]\/api\/v1\/banking\/transactions\/:id["'`]/;

// Extract the PATCH route body (from the app.patch marker to the next `app.` registration or EOF).
function extractPatchRoute(src) {
  const m = ROUTE_MARK.exec(src);
  if (!m) return null;
  const start = m.index;
  const rest = src.slice(start + m[0].length);
  const next = rest.search(/\n\s*app\.(get|post|patch|put|delete)\(/);
  return next === -1 ? src.slice(start) : src.slice(start, start + m[0].length + next);
}

// The manual-only guard tokens that MUST all be present in the PATCH route for it to be bank-fed-safe.
const GUARD_TOKENS = [
  { re: /UPDATE\s+banking\.bank_transactions/i, label: "UPDATE banking.bank_transactions" },
  { re: /transaction_date\s*=/i, label: "transaction_date assignment" },
  { re: /source\s*=\s*'manual'/i, label: "source = 'manual' guard" },
  { re: /plaid_transaction_id\s+IS\s+NULL/i, label: "plaid_transaction_id IS NULL guard" },
  { re: /bank_fed_transaction_date_locked/, label: "bank-fed lock rejection error" },
];

function checkRouteBody(routeBody) {
  const missing = [];
  for (const t of GUARD_TOKENS) {
    if (!t.re.test(routeBody)) missing.push(t.label);
  }
  return missing;
}

function scan() {
  const failures = [];
  const full = path.join(repoRoot, ROUTE_FILE);
  if (!fs.existsSync(full)) {
    failures.push(`${ROUTE_FILE} — MISSING (PATCH manual-txn-date route lives here)`);
    return failures;
  }
  const src = fs.readFileSync(full, "utf8");
  const routeBody = extractPatchRoute(src);
  if (!routeBody) {
    failures.push(`${ROUTE_FILE} — PATCH /api/v1/banking/transactions/:id route is MISSING`);
    return failures;
  }
  const missing = checkRouteBody(routeBody);
  for (const label of missing) {
    failures.push(`${ROUTE_FILE} — PATCH route missing manual-only guard: ${label} (a bank-fed row could be edited)`);
  }
  return failures;
}

export function run() {
  const failures = scan();
  if (failures.length) {
    console.error("[verify-manual-txn-date-patch] FAIL:");
    for (const f of failures) console.error(`  - ${f}`);
    return { ok: false, offenders: failures };
  }
  console.log("[verify-manual-txn-date-patch] PASS — PATCH /api/v1/banking/transactions/:id exists and is manual-only (bank-fed rows locked)");
  return { ok: true, offenders: [] };
}

export function check() {
  return run().ok;
}

function selftest() {
  const goodRoute = `app.patch("/api/v1/banking/transactions/:id", async (req, reply) => {
    // ... reject bank-fed ...
    return reply.code(422).send({ error: "bank_fed_transaction_date_locked" });
    await client.query(\`UPDATE banking.bank_transactions SET transaction_date = $3 WHERE id = $1 AND source = 'manual' AND plaid_transaction_id IS NULL\`);
  });
  app.get("/next", () => {});`;
  const badRouteNoGuard = `app.patch("/api/v1/banking/transactions/:id", async (req, reply) => {
    await client.query(\`UPDATE banking.bank_transactions SET transaction_date = $3 WHERE id = $1\`);
    return { ok: true };
  });
  app.get("/next", () => {});`;
  const goodBody = extractPatchRoute(goodRoute);
  if (!goodBody || checkRouteBody(goodBody).length !== 0) {
    console.error("[verify-manual-txn-date-patch] SELFTEST FAIL — manual-only route mis-flagged");
    process.exit(1);
  }
  const badBody = extractPatchRoute(badRouteNoGuard);
  if (!badBody || checkRouteBody(badBody).length === 0) {
    console.error("[verify-manual-txn-date-patch] SELFTEST FAIL — unguarded (bank-fed-editable) route not flagged");
    process.exit(1);
  }
  if (extractPatchRoute(`app.get("/x", () => {});`) !== null) {
    console.error("[verify-manual-txn-date-patch] SELFTEST FAIL — missing route not detected");
    process.exit(1);
  }
  console.log("[verify-manual-txn-date-patch] SELFTEST PASS — flags missing route + missing manual-only guard, accepts guarded route");
}

const isMain = path.resolve(process.argv[1] ?? "") === path.resolve(new URL(import.meta.url).pathname);
if (isMain) {
  if (process.argv.includes("--selftest")) selftest();
  else process.exit(run().ok ? 0 : 1);
}
