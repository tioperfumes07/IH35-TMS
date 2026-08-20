#!/usr/bin/env node
/**
 * ACCT-F5636 — POST /api/v1/accounting/payments/:id/void read the payment row with a plain SELECT
 * (no FOR UPDATE), then updated it with no WHERE voided_at IS NULL guard either — the only void
 * writer in the codebase missing the row-lock pattern every sibling already uses (bills.service.ts's
 * voidBillInClientTx, this same payment's own governance/void-cancel-executors.ts executor, both
 * SELECT ... FOR UPDATE). Two concurrent void requests on the same payment (double-click, two tabs)
 * could both pass the unlocked "already voided?" check before either commits, then both run the GL
 * reversal poster — the second call's journal_entries header INSERT has no idempotency protection
 * (only the posting-line INSERT does), producing an orphan, zero-line, posted JE header in the
 * ledger, plus a silently overwritten voided_by_user_id/void_reason from the redundant second call.
 */
import fs from "node:fs";

export function run(root = process.cwd()) {
  const failures = [];
  const src = fs.readFileSync(`${root}/apps/backend/src/accounting/payments.routes.ts`, "utf8");

  const routeMatch = src.match(
    /app\.post\(\s*"\/api\/v1\/accounting\/payments\/:id\/void"[\s\S]*?\n {2}\}\);/
  );
  if (!routeMatch) {
    failures.push("could not locate the payment void route in payments.routes.ts");
    return failures;
  }
  const routeBody = routeMatch[0];

  const selectMatch = routeBody.match(/SELECT \*[\s\S]*?FROM accounting\.payments[\s\S]*?LIMIT 1[\s\S]*?\)/);
  if (!selectMatch || !/FOR UPDATE/i.test(selectMatch[0])) {
    failures.push("the payment SELECT before void must use FOR UPDATE to lock the row against a concurrent void");
  }

  if (!/UPDATE accounting\.payments[\s\S]{0,300}?AND voided_at IS NULL/i.test(routeBody)) {
    failures.push("the void UPDATE must carry AND voided_at IS NULL as a belt-and-suspenders guard alongside the row lock");
  }

  if (!/rowCount[\s\S]{0,80}?=== 0[\s\S]{0,80}?payment_already_voided/.test(routeBody)) {
    failures.push("a zero-row UPDATE result (the race case) must be treated as payment_already_voided, not silently ignored");
  }

  return failures;
}

if (process.argv.includes("--selftest")) {
  const tmp = fs.mkdtempSync("/tmp/verify-payment-void-lock-");
  const mk = (rel, body) => {
    fs.mkdirSync(`${tmp}/${rel.split("/").slice(0, -1).join("/")}`, { recursive: true });
    fs.writeFileSync(`${tmp}/${rel}`, body);
  };
  const good = `
  app.post("/api/v1/accounting/payments/:id/void", async (req, reply) => {
    const result = await withCompanyScope(user.uuid, query.data.operating_company_id, async (client) => {
      const paymentRes = await client.query(
        \`SELECT *, payment_date::text AS payment_date_iso
          FROM accounting.payments
          WHERE id = $1
          LIMIT 1
          FOR UPDATE\`,
        []
      );
      const payment = paymentRes.rows[0] ?? null;
      if (!payment) return { code: 404, error: "payment_not_found" };
      if (payment.voided_at) return { code: 409, error: "payment_already_voided" };

      const flipped = await client.query(
        \`UPDATE accounting.payments
          SET voided_at = now()
          WHERE id = $1
            AND voided_at IS NULL\`,
        []
      );
      if ((flipped.rowCount ?? 0) === 0) return { code: 409, error: "payment_already_voided" };
      return { code: 200, ok: true };
    });
  });
`;
  mk("apps/backend/src/accounting/payments.routes.ts", good);
  if (run(tmp).length) throw new Error("PASS fail: " + run(tmp).join("; "));

  // Regression 1: FOR UPDATE dropped (the original bug).
  mk("apps/backend/src/accounting/payments.routes.ts", good.replace("\n          FOR UPDATE", ""));
  let f = run(tmp);
  if (!f.length) throw new Error("FAIL fail: missing FOR UPDATE should be caught");
  mk("apps/backend/src/accounting/payments.routes.ts", good); // restore

  // Regression 2: the belt-and-suspenders WHERE voided_at IS NULL dropped from the UPDATE.
  mk("apps/backend/src/accounting/payments.routes.ts", good.replace("\n            AND voided_at IS NULL", ""));
  f = run(tmp);
  if (!f.length) throw new Error("FAIL fail: missing AND voided_at IS NULL on the UPDATE should be caught");
  mk("apps/backend/src/accounting/payments.routes.ts", good); // restore

  // Regression 3: the zero-row UPDATE result is silently ignored (race case unhandled).
  mk(
    "apps/backend/src/accounting/payments.routes.ts",
    good.replace('if ((flipped.rowCount ?? 0) === 0) return { code: 409, error: "payment_already_voided" };\n      ', "")
  );
  f = run(tmp);
  if (!f.length) throw new Error("FAIL fail: silently ignored zero-row UPDATE result should be caught");

  fs.rmSync(tmp, { recursive: true, force: true });
  console.log("verify-payment-void-row-locked --selftest OK");
} else {
  const f = run();
  if (f.length) {
    console.error(f.join("\n"));
    process.exit(1);
  }
  console.log("verify-payment-void-row-locked — OK");
}
