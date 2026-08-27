#!/usr/bin/env node
/**
 * INS-MONEY-F6810A-RENEWAL-COMMITS-POLICY-BEFORE-BILL-SCHEDULE
 *
 * POST /api/v1/insurance/policies/:policy_id/renew used to commit the cloned policy + units in
 * withCompanyScope's own transaction, then create the bill schedule in a SEPARATE withCurrentUser
 * transaction. A schedule failure returned 502 while the renewed policy (and its cloned units)
 * stayed committed with no bill schedule. This guard locks the fix: createPolicyBillSchedule must
 * be called INSIDE the same withCompanyScope callback (the one transaction that also inserts the
 * policy and policy_unit rows), not via a second, separate withCurrentUser call after that
 * transaction has already returned.
 */
import fs from "node:fs";

const ROUTES_REL = "apps/backend/src/insurance/policy.routes.ts";
const ROUTE_MARKER = 'app.post("/api/v1/insurance/policies/:policy_id/renew"';

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
    failures.push("POST .../policies/:policy_id/renew handler not found");
    return failures;
  }
  const nextRouteIdx = routes.indexOf("\n  app.", postIdx + 1);
  const handler = routes.slice(postIdx, nextRouteIdx > 0 ? nextRouteIdx : undefined);

  const scopeIdx = handler.indexOf("withCompanyScope(");
  const scheduleIdx = handler.indexOf("createPolicyBillSchedule(");
  if (scopeIdx < 0) {
    failures.push("handler slice is missing its withCompanyScope call — marker/scoping broken");
    return failures;
  }
  if (scheduleIdx < 0) {
    failures.push("handler slice is missing its createPolicyBillSchedule call — marker/scoping broken");
    return failures;
  }

  // Find the withCompanyScope callback's closing `});` — the createPolicyBillSchedule call must be
  // textually BEFORE it (inside the callback), not after (a second, separate transaction).
  const afterScope = handler.slice(scopeIdx);
  const closeMatch = afterScope.match(/\n\s*\}\);/);
  const scopeCloseIdx = closeMatch ? scopeIdx + closeMatch.index + closeMatch[0].length : -1;
  if (scopeCloseIdx < 0) {
    failures.push("could not locate the withCompanyScope callback's closing `});`");
    return failures;
  }
  if (scheduleIdx > scopeCloseIdx) {
    failures.push(
      "createPolicyBillSchedule is called AFTER withCompanyScope's transaction closes — this is the exact pre-fix two-transaction bug (clone commits before the schedule is attempted)"
    );
  }

  // A second, direct withCurrentUser call anywhere in the handler (outside withCompanyScope's own
  // internal one) reintroduces the second transaction even if createPolicyBillSchedule itself is
  // textually inside the scope call above.
  const directWithCurrentUser = handler.match(/withCurrentUser\(user\.uuid/g) ?? [];
  if (directWithCurrentUser.length > 0) {
    failures.push("handler must not open a second, direct withCurrentUser(user.uuid, ...) transaction outside withCompanyScope");
  }

  return failures;
}

if (process.argv.includes("--selftest")) {
  const tmp = fs.mkdtempSync("/tmp/verify-insurance-renewal-atomic-");
  const dir = `${tmp}/apps/backend/src/insurance`;
  fs.mkdirSync(dir, { recursive: true });

  const fixed = `
  app.post("/api/v1/insurance/policies/:policy_id/renew", async (req, reply) => {
    const result = await withCompanyScope(user.uuid, body.operating_company_id, async (client) => {
      const insertRes = await client.query("INSERT INTO insurance.policy (a) VALUES ($1) RETURNING id", []);
      const newPolicy = insertRes.rows[0];
      if (!newPolicy) return { kind: "policy_not_found" };
      await client.query("INSERT INTO insurance.policy_unit (a) VALUES ($1)", []);
      if (body.installment_count > 0) {
        await createPolicyBillSchedule(String(newPolicy.id), user.uuid, client);
      }
      await appendCrudAudit(client, user.uuid, "insurance.policy.renewed", {});
      return { kind: "ok", newPolicy };
    });
    if (result.kind === "policy_not_found") return reply.code(404).send({ error: "policy_not_found" });
    return reply.code(201).send(result.newPolicy);
  });
  app.patch("/api/v1/insurance/policy-units/:id", async (req, reply) => {});
`;
  fs.writeFileSync(`${dir}/policy.routes.ts`, fixed);
  const passFailures = run(tmp);
  if (passFailures.length) throw new Error("PASS fail (should be clean): " + JSON.stringify(passFailures));

  // Mutation 1: exact pre-fix pattern — schedule created via a SEPARATE, direct withCurrentUser
  // call AFTER withCompanyScope's transaction has already returned.
  const broken1 = fixed
    .replace(
      `      if (body.installment_count > 0) {
        await createPolicyBillSchedule(String(newPolicy.id), user.uuid, client);
      }
      await appendCrudAudit(client, user.uuid, "insurance.policy.renewed", {});
      return { kind: "ok", newPolicy };
    });`,
      `      await appendCrudAudit(client, user.uuid, "insurance.policy.renewed", {});
      return { kind: "ok", newPolicy };
    });`
    )
    .replace(
      'if (result.kind === "policy_not_found") return reply.code(404).send({ error: "policy_not_found" });',
      `if (result.kind === "policy_not_found") return reply.code(404).send({ error: "policy_not_found" });
    if (body.installment_count > 0) {
      try {
        await withCurrentUser(user.uuid, async (client) => {
          await createPolicyBillSchedule(String(result.newPolicy.id), user.uuid, client);
        });
      } catch {
        return reply.code(502).send({ error: "bill_schedule_failed" });
      }
    }`
    );
  fs.writeFileSync(`${dir}/policy.routes.ts`, broken1);
  const f1 = run(tmp);
  if (f1.length === 0) throw new Error("FAIL to catch: separate post-transaction bill-schedule call went undetected");

  fs.rmSync(tmp, { recursive: true, force: true });
  console.log("verify-insurance-renewal-atomic-bill-schedule SELFTEST PASS");
  process.exit(0);
}

const failures = run();
if (failures.length) {
  console.error("verify-insurance-renewal-atomic-bill-schedule FAILED:");
  for (const f of failures) console.error(`  - ${f}`);
  process.exit(1);
}
console.log("verify-insurance-renewal-atomic-bill-schedule OK — bill schedule composes into the same renewal transaction");
