#!/usr/bin/env node
/**
 * ACCT-F5651 — the `/advance`, `/reserve-held`, `/release` routes in
 * `accounting/factoring-advances.routes.ts` each ran their own `UPDATE accounting.factoring_advances
 * SET status = ...` (taking and holding an exclusive row lock on the caller's connection) BEFORE
 * awaiting a poster call (`postFactoringAdvanceEvent` / `postFactoringCustomerPaymentEvent` /
 * `postFactoringReleaseEvent`) that opens its OWN separate connection and, on its write path, takes
 * `SELECT ... FOR UPDATE` on that exact same row (`lockFactoringAdvanceForSettlement` in
 * `factoring-posting/poster.service.ts`). The poster's connection blocks waiting for the route's
 * connection to release the lock; the route's connection is synchronously awaiting the poster's
 * promise before it can commit and release that lock. This is an application-level deadlock cycle
 * across two pooled connections that Postgres's own deadlock detector cannot see (same class already
 * fixed once for the bill-payment void executor, ACCT-F5637) — and since prod has
 * statement_timeout=0/lock_timeout=0, the blocked query hangs indefinitely instead of erroring,
 * permanently pinning two pool connections per stuck call.
 *
 * FAIL if any of the three routes' `factoring_advances` status UPDATE appears BEFORE its poster call
 * in the same handler. PASS when the UPDATE runs strictly after the poster call.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = "verify-factoring-advances-no-lock-order-deadlock";
const FILE = path.join(ROOT, "apps/backend/src/accounting/factoring-advances.routes.ts");

const ROUTES = [
  { route: "/advance", poster: "postFactoringAdvanceEvent", status: "'advanced'" },
  { route: "/reserve-held", poster: "postFactoringCustomerPaymentEvent", status: "'reserve_held'" },
  { route: "/release", poster: "postFactoringReleaseEvent", status: "'released'" },
];

export function analyzeRoutesSource(src) {
  const failures = [];
  const code = src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");

  for (const { route, poster, status } of ROUTES) {
    const posterCallIdx = code.indexOf(`await ${poster}(`);
    if (posterCallIdx < 0) {
      failures.push(`${path.relative(ROOT, FILE)}: could not locate the ${poster} call for the ${route} route`);
      continue;
    }
    // Find the UPDATE ... SET status = <status> statement that transitions THIS route's status.
    const updateRe = new RegExp(
      `UPDATE\\s+accounting\\.factoring_advances[\\s\\S]{0,200}?SET[\\s\\S]{0,200}?status\\s*=\\s*${status}`,
      "i"
    );
    const updateMatch = updateRe.exec(code);
    if (!updateMatch) {
      failures.push(`${path.relative(ROOT, FILE)}: could not locate the factoring_advances status=${status} UPDATE for the ${route} route`);
      continue;
    }
    if (updateMatch.index < posterCallIdx) {
      failures.push(
        `${path.relative(ROOT, FILE)}: the ${route} route's factoring_advances status=${status} UPDATE runs BEFORE ` +
          `its ${poster} call — this holds a row lock on the caller's connection while the poster's own ` +
          `connection tries to FOR-UPDATE-lock the same row, an application-level deadlock cycle (ACCT-F5651, same ` +
          `class as ACCT-F5637). Move the UPDATE to run AFTER the poster call.`
      );
    }
  }
  return failures;
}

export function run() {
  const src = fs.readFileSync(FILE, "utf8");
  return analyzeRoutesSource(src);
}

if (process.argv.includes("--selftest")) {
  const GOOD = `
app.post("/api/v1/accounting/factoring-advances/:id/advance", async (req, reply) => {
  const result = await withCompanyScope(user.uuid, opco, async (client) => {
    await client.query("UPDATE accounting.invoices SET factoring_status = 'advanced' WHERE x");
    await postFactoringAdvanceEvent({ x });
    await client.query(\`
      UPDATE accounting.factoring_advances
      SET status = 'advanced', advanced_at = $2
      WHERE id = $1
    \`);
  });
});
app.post("/api/v1/accounting/factoring-advances/:id/reserve-held", async (req, reply) => {
  const result = await withCompanyScope(user.uuid, opco, async (client) => {
    await postFactoringCustomerPaymentEvent({ x });
    await client.query(\`
      UPDATE accounting.factoring_advances
      SET status = 'reserve_held', collected_at = $2
      WHERE id = $1
    \`);
  });
});
app.post("/api/v1/accounting/factoring-advances/:id/release", async (req, reply) => {
  const result = await withCompanyScope(user.uuid, opco, async (client) => {
    await postFactoringReleaseEvent({ x });
    await postFactoringFeeExpenseEvent({ x });
    await client.query(\`
      UPDATE accounting.factoring_advances
      SET status = 'released', released_at = $2
      WHERE id = $1
    \`);
  });
});
`;
  const goodFailures = analyzeRoutesSource(GOOD);
  if (goodFailures.length) {
    throw new Error(`[${LABEL}] selftest PASS fixture FAILED: ${goodFailures.join("; ")}`);
  }

  const BAD = `
app.post("/api/v1/accounting/factoring-advances/:id/advance", async (req, reply) => {
  const result = await withCompanyScope(user.uuid, opco, async (client) => {
    await client.query(\`
      UPDATE accounting.factoring_advances
      SET status = 'advanced', advanced_at = $2
      WHERE id = $1
    \`);
    await client.query("UPDATE accounting.invoices SET factoring_status = 'advanced' WHERE x");
    await postFactoringAdvanceEvent({ x });
  });
});
app.post("/api/v1/accounting/factoring-advances/:id/reserve-held", async (req, reply) => {
  const result = await withCompanyScope(user.uuid, opco, async (client) => {
    await postFactoringCustomerPaymentEvent({ x });
    await client.query(\`
      UPDATE accounting.factoring_advances
      SET status = 'reserve_held', collected_at = $2
      WHERE id = $1
    \`);
  });
});
app.post("/api/v1/accounting/factoring-advances/:id/release", async (req, reply) => {
  const result = await withCompanyScope(user.uuid, opco, async (client) => {
    await postFactoringReleaseEvent({ x });
    await postFactoringFeeExpenseEvent({ x });
    await client.query(\`
      UPDATE accounting.factoring_advances
      SET status = 'released', released_at = $2
      WHERE id = $1
    \`);
  });
});
`;
  const badFailures = analyzeRoutesSource(BAD);
  if (!badFailures.some((f) => f.includes("/advance"))) {
    throw new Error(`[${LABEL}] selftest REGRESSION fixture (status UPDATE before poster on /advance) should FAIL but passed`);
  }

  console.log(`[${LABEL}] selftest: PASS — good/regressed fixtures classify correctly`);
  process.exit(0);
}

const failures = run();
if (failures.length) {
  console.error(`[${LABEL}] FAILED — ${failures.length} check(s) regressed:`);
  for (const f of failures) console.error("  ✗", f);
  process.exit(1);
}
console.log(`[${LABEL}] PASS — all 3 factoring-advance lifecycle routes call their poster BEFORE taking their own row lock, eliminating the cross-connection lock-order deadlock`);
