#!/usr/bin/env node
/**
 * SAFETY-MONEY-F6822A-INTERNAL-FINE-NESTED-COMMIT
 *
 * POST /api/v1/safety/internal-fines' callback ran inside withCompany -> withCurrentUser
 * (apps/backend/src/auth/db.ts), which already opens its own BEGIN...COMMIT/ROLLBACK around the
 * whole callback. The handler ALSO issued its own explicit BEGIN/COMMIT/ROLLBACK inside that
 * callback. Postgres has no real nested transactions: a BEGIN while one is already open is a
 * no-op WARNING, but the inner COMMIT genuinely commits the OUTER transaction early, mid-handler.
 * Every statement issued afterward (the final "internal_fine.created" audit call) then ran with no
 * open transaction and no SET LOCAL tenant GUC / forced app role (both are transaction-scoped in
 * withCurrentUser), so a later failure rolled back nothing — the fine/liability/settlement
 * deduction stayed durably committed while the request still reported failure to the caller. This
 * guard locks the fix: no explicit transaction control inside the internal-fines POST callback —
 * the wrapper owns the one and only transaction.
 */
import fs from "node:fs";

const ROUTES_REL = "apps/backend/src/safety/safety-v5.routes.ts";
const ROUTE_MARKER = 'app.post("/api/v1/safety/internal-fines"';

export function run(root = process.cwd()) {
  const failures = [];
  let routes;
  try {
    routes = fs.readFileSync(`${root}/${ROUTES_REL}`, "utf8");
  } catch {
    return [`${ROUTES_REL}: missing`];
  }

  const postIdx = routes.indexOf(ROUTE_MARKER);
  if (postIdx < 0) {
    failures.push("POST /api/v1/safety/internal-fines handler not found");
    return failures;
  }
  // Scope the search to this one handler, not the whole file — other routes in this file (or a
  // future one) may legitimately manage their own transaction.
  const nextRouteIdx = routes.indexOf("\n  app.", postIdx + 1);
  const handler = routes.slice(postIdx, nextRouteIdx > 0 ? nextRouteIdx : undefined);

  // Positive control — make sure we are actually scanning the real handler body, not an empty slice.
  if (!handler.includes("createSettlementDeduction")) {
    failures.push("handler slice does not look like the internal-fines POST body (missing createSettlementDeduction call) — marker/scoping broken");
  }
  if (!handler.includes("INSERT INTO safety.internal_fines")) {
    failures.push("handler slice does not look like the internal-fines POST body (missing the fine INSERT) — marker/scoping broken");
  }

  if (/client\.query\(\s*["'`]BEGIN["'`]\s*\)/.test(handler)) {
    failures.push('handler must not open its own BEGIN — withCompany/withCurrentUser already owns one transaction for this callback');
  }
  if (/client\.query\(\s*["'`]COMMIT["'`]\s*\)/.test(handler)) {
    failures.push('handler must not issue its own COMMIT — an early inner COMMIT commits the outer transaction mid-handler, breaking atomicity');
  }
  if (/client\.query\(\s*["'`]ROLLBACK["'`]\s*\)/.test(handler)) {
    failures.push('handler must not issue its own ROLLBACK — the wrapper already rolls back on any thrown error');
  }
  if (/}\s*catch\s*\(error\)\s*{\s*await client\.query\(["'`]ROLLBACK["'`]\)/.test(handler)) {
    failures.push('handler must not catch-and-rollback-and-rethrow — let the thrown error propagate to the wrapper unchanged');
  }

  return failures;
}

if (process.argv.includes("--selftest")) {
  const tmp = fs.mkdtempSync("/tmp/verify-internal-fine-nested-txn-");
  const dir = `${tmp}/apps/backend/src/safety`;
  fs.mkdirSync(dir, { recursive: true });

  const fixed = `
  app.post("/api/v1/safety/internal-fines", async (req, reply) => {
    const created = await withCompany(user.uuid, user.role, query.data.operating_company_id, async (client) => {
        const fineRes = await client.query("INSERT INTO safety.internal_fines (a) VALUES ($1) RETURNING *", []);
        const fine = fineRes.rows[0];
        if (body.data.status === "approved") {
          const deduction = await createSettlementDeduction(client, { driverId: "x" });
        }
        return { fine };
    });
    return reply.code(201).send(created);
  });
  app.get("/api/v1/safety/internal-fines", async (req, reply) => {});
`;
  fs.writeFileSync(`${dir}/safety-v5.routes.ts`, fixed);
  const passFailures = run(tmp);
  if (passFailures.length) throw new Error("PASS fail (should be clean): " + JSON.stringify(passFailures));

  // Mutation 1: reintroduce the exact pre-fix pattern — nested BEGIN + COMMIT + catch/ROLLBACK.
  const broken1 = fixed
    .replace(
      "async (client) => {\n        const fineRes",
      'async (client) => {\n      await client.query("BEGIN");\n      try {\n        const fineRes'
    )
    .replace(
      "        return { fine };\n    });",
      '        await client.query("COMMIT");\n        return { fine };\n      } catch (error) {\n        await client.query("ROLLBACK");\n        throw error;\n      }\n    });'
    );
  fs.writeFileSync(`${dir}/safety-v5.routes.ts`, broken1);
  const f1 = run(tmp);
  if (f1.length === 0) throw new Error("FAIL to catch: nested BEGIN/COMMIT/ROLLBACK went undetected");

  // Mutation 2: only the inner COMMIT reintroduced (no BEGIN/catch) — still must be caught.
  const broken2 = fixed.replace("        return { fine };\n    });", '        await client.query("COMMIT");\n        return { fine };\n    });');
  fs.writeFileSync(`${dir}/safety-v5.routes.ts`, broken2);
  const f2 = run(tmp);
  if (f2.length === 0) throw new Error("FAIL to catch: lone inner COMMIT went undetected");

  fs.rmSync(tmp, { recursive: true, force: true });
  console.log("verify-internal-fine-no-nested-transaction SELFTEST PASS");
  process.exit(0);
}

const failures = run();
if (failures.length) {
  console.error("verify-internal-fine-no-nested-transaction FAILED:");
  for (const f of failures) console.error(`  - ${f}`);
  process.exit(1);
}
console.log("verify-internal-fine-no-nested-transaction OK — internal-fines POST callback owns no nested transaction control");
