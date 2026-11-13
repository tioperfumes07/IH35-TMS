/**
 * verify-invoice-total-below-paid-422 (ROW 21 gap / step 20039)
 *
 * Guards that the 23514 → 422 invoice_total_below_paid mapping is wired in
 * invoice-lines.routes.ts for both PATCH and DELETE handlers.
 *
 * --selftest: static source checks (no DB)
 * default:    static checks + live constraint-existence check (skips when DATABASE_URL absent)
 */

import { readFileSync, existsSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { requireLiveDbOrExit } from "./lib/require-live-db.mjs";

export const ALLOW_OFFLINE_SKIP =
  "invoice-total-below-paid guard verifies source patterns via static selftest; live constraint check skips when DATABASE_URL absent";

const __dir = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dir, "..");

const isSelftest = process.argv.includes("--selftest");

await runSelftest();
if (!isSelftest) {
  await runLive();
}

async function runSelftest() {
  const failures = [];

  const routesPath = resolve(root, "apps/backend/src/accounting/invoice-lines.routes.ts");
  if (!existsSync(routesPath)) {
    failures.push("ROUTES-MISSING: apps/backend/src/accounting/invoice-lines.routes.ts not found");
  } else {
    const src = readFileSync(routesPath, "utf8");

    // 1. 23514 mapped in PATCH handler (appears at least twice — once per handler)
    const count23514 = (src.match(/\.code === "23514"/g) ?? []).length;
    if (count23514 < 2) {
      failures.push(
        `PATCH-23514: invoice-lines.routes.ts must handle 23514 in both PATCH and DELETE, found ${count23514} occurrence(s)`
      );
    }

    // 2. error key is invoice_total_below_paid
    if (!src.includes('"invoice_total_below_paid"')) {
      failures.push('ERROR-KEY: invoice-lines.routes.ts missing "invoice_total_below_paid"');
    }

    // 3. message is the directed string
    if (!src.includes('"Issue a credit memo for the difference"')) {
      failures.push('MESSAGE: invoice-lines.routes.ts missing directed message "Issue a credit memo for the difference"');
    }

    // 4. reply.code(422) used for the mapping (at least twice)
    const count422 = (src.match(/reply\.code\(422\)/g) ?? []).length;
    if (count422 < 2) {
      failures.push(`422-COUNT: reply.code(422) must appear at least twice (one per handler), found ${count422}`);
    }
  }

  // 5. Test file exists
  const testPath = resolve(
    root,
    "apps/backend/src/accounting/__tests__/invoice-total-below-paid.test.ts"
  );
  if (!existsSync(testPath)) {
    failures.push("TEST-MISSING: apps/backend/src/accounting/__tests__/invoice-total-below-paid.test.ts not found");
  } else {
    const test = readFileSync(testPath, "utf8");
    if (!test.includes('"invoice_total_below_paid"')) {
      failures.push("TEST-ERROR-KEY: test file must assert invoice_total_below_paid error key");
    }
    if (!test.includes("23514")) {
      failures.push("TEST-CODE: test file must reference 23514");
    }
  }

  if (failures.length > 0) {
    for (const f of failures) console.error("SELFTEST FAIL:", f);
    process.exit(1);
  }
  console.log("SELFTEST PASS: 5/5 static checks — invoice_total_below_paid 422 mapping intact");
}

async function runLive() {
  if (!process.env.DATABASE_URL) {
    console.log(
      "SKIP: DATABASE_URL not set — skipping live constraint check (static selftest still runs)"
    );
    return;
  }
  const { client, pool } = await requireLiveDbOrExit({
    label: "verify-invoice-total-below-paid-422",
  });
  try {
    await client.query("BEGIN");
    await client.query("SET LOCAL app.bypass_rls = 'on'");

    // Verify the CHECK constraint exists on accounting.invoices
    const conRes = await client.query(`
      SELECT conname
        FROM pg_constraint
       WHERE conrelid = 'accounting.invoices'::regclass
         AND contype = 'c'
         AND pg_get_constraintdef(oid) LIKE '%amount_paid_cents%total_cents%'
    `);

    if (conRes.rows.length === 0) {
      console.error(
        "FAIL: accounting.invoices has no CHECK(amount_paid_cents <= total_cents) — constraint missing or renamed"
      );
      await client.query("ROLLBACK");
      process.exit(1);
    }
    const conName = conRes.rows[0].conname;
    console.log(`CONSTRAINT EXISTS: ${conName} on accounting.invoices ✓`);

    console.log("PASS");
    await client.query("ROLLBACK");
  } finally {
    client.release();
    await pool.end();
  }
}
