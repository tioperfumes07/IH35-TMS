#!/usr/bin/env node
/**
 * TEST-DATA-BANK-MATCH-EXPENSES-DOUBLE-SEEDED-6210
 *
 * POST /api/v1/expenses had no per-call idempotency key, so a caller (script retry, or a UI
 * double-click racing the "submitting" disable state) that POSTs an identical
 * (operating_company_id, memo) body twice silently creates a second real GL-posting expense with no
 * error surfaced. Confirmed live on prod: 12 exact-duplicate pairs on account 6210, $23,773.38
 * double-counted. This guard locks the fix: a memo-scoped duplicate-submission rejection inside the
 * INSERT transaction, mapped to a 409 in the response.
 */
import fs from "node:fs";

const ROUTES_REL = "apps/backend/src/accounting/expenses.routes.ts";

export function run(root = process.cwd()) {
  const failures = [];
  let routes;
  try {
    routes = fs.readFileSync(`${root}/${ROUTES_REL}`, "utf8");
  } catch {
    return [`${ROUTES_REL}: missing`];
  }

  const postIdx = routes.indexOf('app.post("/api/v1/expenses",');
  if (postIdx < 0) {
    failures.push("POST /api/v1/expenses handler not found");
    return failures;
  }
  // Scope the search to this one handler, not the whole file (other routes may have unrelated
  // duplicate-ish text) — bounded by the next top-level app.<verb>( registration after it.
  const nextRouteIdx = routes.indexOf("\n  app.", postIdx + 1);
  const handler = routes.slice(postIdx, nextRouteIdx > 0 ? nextRouteIdx : undefined);

  if (!handler.includes("duplicateSubmission")) failures.push("handler missing duplicateSubmission branch");
  if (!handler.includes("interval '2 minutes'")) failures.push("handler missing the 2-minute dedup window");
  if (!handler.includes("voided_at IS NULL")) failures.push("dedup query must exclude voided rows");
  if (!/memo\s*=\s*\$2/.test(handler)) failures.push("dedup query must match on memo");

  const insertIdx = handler.indexOf("INSERT INTO accounting.expenses");
  const dupCheckIdx = handler.indexOf("duplicateSubmission");
  if (insertIdx >= 0 && dupCheckIdx >= 0 && dupCheckIdx > insertIdx) {
    failures.push("duplicate-submission check must run BEFORE the INSERT, not after");
  }

  if (!routes.includes('"duplicateSubmission" in payload')) {
    failures.push("response mapping missing duplicateSubmission branch");
  }
  if (!routes.includes("duplicate_expense_submission")) {
    failures.push("response mapping missing the duplicate_expense_submission error code");
  }
  // The 409 for this branch must be a real reply.code(409) call, not just adjacent text.
  const mapIdx = routes.indexOf('"duplicateSubmission" in payload');
  const mapSlice = mapIdx >= 0 ? routes.slice(mapIdx, mapIdx + 300) : "";
  if (!/reply\.code\(409\)/.test(mapSlice)) failures.push("duplicateSubmission must map to HTTP 409");

  return failures;
}

if (process.argv.includes("--selftest")) {
  const tmp = fs.mkdtempSync("/tmp/verify-expense-dup-submit-");
  const dir = `${tmp}/apps/backend/src/accounting`;
  fs.mkdirSync(dir, { recursive: true });
  const good = `
  app.post("/api/v1/expenses", { config: {} }, async (req, reply) => {
    try {
      const payload = await withCompanyScope(user.uuid, body.operating_company_id, async (client) => {
        if (hasMemo && body.memo && body.memo.trim()) {
          const dup = await client.query(
            \`SELECT id FROM accounting.expenses
              WHERE operating_company_id = $1::uuid
                AND memo = $2
                AND voided_at IS NULL
                AND created_at > now() - interval '2 minutes'
              LIMIT 1\`,
            [body.operating_company_id, body.memo]
          );
          if (dup.rows[0]) {
            return { duplicateSubmission: true, existingExpenseId: String(dup.rows[0].id) };
          }
        }
        const inserted = await client.query("INSERT INTO accounting.expenses (a) VALUES ($1) RETURNING id", []);
        return { expense_id: "x" };
      });
      if ("duplicateSubmission" in payload)
        return reply.code(409).send({ error: "duplicate_expense_submission" });
    } catch {}
  });
  app.post("/api/v1/expenses/:expenseId/void", async (req, reply) => {});
`;
  fs.writeFileSync(`${dir}/expenses.routes.ts`, good);
  const passFailures = run(tmp);
  if (passFailures.length) throw new Error("PASS fail: " + JSON.stringify(passFailures));

  // Mutation 1: drop the duplicate-submission branch entirely.
  const broken1 = good.replace(
    /if \(hasMemo[\s\S]*?\n        }\n/,
    ""
  );
  fs.writeFileSync(`${dir}/expenses.routes.ts`, broken1);
  if (!run(tmp).length) throw new Error("FAIL fail: removing the dedup check should have been caught");

  // Mutation 2: dedup check present but placed AFTER the insert (order regression).
  fs.writeFileSync(`${dir}/expenses.routes.ts`, good);
  const dupBlockMatch = good.match(/if \(hasMemo[\s\S]*?\n        }\n/);
  const dupBlock = dupBlockMatch ? dupBlockMatch[0] : "";
  const withoutBlock = good.replace(dupBlock, "");
  const insertMarker = 'const inserted = await client.query("INSERT INTO accounting.expenses (a) VALUES ($1) RETURNING id", []);\n        return { expense_id: "x" };';
  const broken2 = withoutBlock.replace(insertMarker, `${insertMarker}\n        ${dupBlock}`);
  if (broken2 === withoutBlock) throw new Error("selftest setup error: insert marker not found");
  fs.writeFileSync(`${dir}/expenses.routes.ts`, broken2);
  if (!run(tmp).length) throw new Error("FAIL fail: dedup check after INSERT should have been caught");

  // Mutation 3: response mapping downgraded from 409.
  fs.writeFileSync(`${dir}/expenses.routes.ts`, good.replace("reply.code(409)", "reply.code(200)"));
  if (!run(tmp).length) throw new Error("FAIL fail: non-409 response mapping should have been caught");

  fs.rmSync(tmp, { recursive: true, force: true });
  console.log("verify-expense-create-duplicate-submission-guard --selftest OK");
} else {
  const failures = run();
  if (failures.length) {
    console.error(failures.join("\n"));
    process.exit(1);
  }
  console.log("verify-expense-create-duplicate-submission-guard — OK");
}
