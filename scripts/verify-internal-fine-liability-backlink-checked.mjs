#!/usr/bin/env node
/**
 * SAFETY-MONEY-F6741-INTERNAL-FINE-LIABILITY-BACKLINK-SILENT-NOOP
 *
 * The internal-fines POST callback inserts a real driver_finance.driver_liabilities row and a real
 * settlement deduction, then updates the source fine's status/driver_liability_id by UUID alone,
 * ignoring the affected-row result. A zero-row mutation (wrong company, or a fine that already
 * carries a driver_liability_id) would leave the just-created liability + deduction as an orphan
 * money recovery with no backlink, while the request still reports 201. This guard locks the fix:
 * the backlink UPDATE must be company-scoped, guarded by driver_liability_id IS NULL, and its
 * result checked for exactly one affected row before the handler proceeds.
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
  const nextRouteIdx = routes.indexOf("\n  app.", postIdx + 1);
  const handler = routes.slice(postIdx, nextRouteIdx > 0 ? nextRouteIdx : undefined);

  const updateIdx = handler.indexOf("UPDATE safety.internal_fines");
  if (updateIdx < 0) {
    failures.push("handler slice is missing the fine->liability backlink UPDATE — marker/scoping broken");
    return failures;
  }
  // Scope the checks to the UPDATE statement + the ~400 chars after it (its bound params and the
  // result check), not the whole handler — avoids false green from an unrelated rowCount check
  // elsewhere in the same handler (e.g. the DOT-inspection backlink earlier in this file).
  const updateSlice = handler.slice(updateIdx, updateIdx + 700);

  if (!/operating_company_id\s*=\s*\$3::uuid/.test(updateSlice)) {
    failures.push("backlink UPDATE must scope WHERE by operating_company_id");
  }
  if (!/driver_liability_id\s+IS\s+NULL/.test(updateSlice)) {
    failures.push("backlink UPDATE must guard WHERE driver_liability_id IS NULL (never re-link an already-linked fine)");
  }
  if (!/\.rowCount\s*\?\?\s*0\)\s*!==\s*1/.test(updateSlice) && !/rowCount\s*!==\s*1/.test(updateSlice)) {
    failures.push("backlink UPDATE result must be checked for exactly one affected row");
  }
  if (!/throw new Error/.test(updateSlice)) {
    failures.push("a zero/multi-row backlink UPDATE must throw (fail loud), not silently continue to the audit call");
  }

  return failures;
}

if (process.argv.includes("--selftest")) {
  const tmp = fs.mkdtempSync("/tmp/verify-internal-fine-backlink-");
  const dir = `${tmp}/apps/backend/src/safety`;
  fs.mkdirSync(dir, { recursive: true });

  const fixed = `
  app.post("/api/v1/safety/internal-fines", async (req, reply) => {
    const created = await withCompany(user.uuid, user.role, query.data.operating_company_id, async (client) => {
        const fineRes = await client.query("INSERT INTO safety.internal_fines (a) VALUES ($1) RETURNING *", []);
        const fine = fineRes.rows[0];
        if (body.data.status === "approved") {
          const deduction = await createSettlementDeduction(client, { driverId: "x" });
          const fineLinked = await client.query(
            \`UPDATE safety.internal_fines
                SET status = 'converted_to_liability', driver_liability_id = $2
              WHERE id = $1
                AND operating_company_id = $3::uuid
                AND driver_liability_id IS NULL\`,
            [fine.id, "liab", query.data.operating_company_id]
          );
          if ((fineLinked.rowCount ?? 0) !== 1) {
            throw new Error("safety_internal_fine_liability_backlink_failed");
          }
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

  // Mutation 1: the exact pre-fix pattern — fire-and-forget UPDATE, no scope, no result check.
  const broken1 = fixed.replace(
    /const fineLinked = await client\.query\([\s\S]*?throw new Error\("safety_internal_fine_liability_backlink_failed"\);\s*\}/,
    `await client.query(
            \`UPDATE safety.internal_fines SET status = 'converted_to_liability', driver_liability_id = $2 WHERE id = $1\`,
            [fine.id, "liab"]
          );`
  );
  fs.writeFileSync(`${dir}/safety-v5.routes.ts`, broken1);
  const f1 = run(tmp);
  if (f1.length === 0) throw new Error("FAIL to catch: unscoped, unchecked backlink UPDATE went undetected");

  // Mutation 2: scoped correctly but the result is never checked (no throw).
  const broken2 = fixed.replace(
    /if \(\(fineLinked\.rowCount \?\? 0\) !== 1\) \{\s*throw new Error\("safety_internal_fine_liability_backlink_failed"\);\s*\}/,
    ""
  );
  fs.writeFileSync(`${dir}/safety-v5.routes.ts`, broken2);
  const f2 = run(tmp);
  if (f2.length === 0) throw new Error("FAIL to catch: missing rowCount check went undetected");

  fs.rmSync(tmp, { recursive: true, force: true });
  console.log("verify-internal-fine-liability-backlink-checked SELFTEST PASS");
  process.exit(0);
}

const failures = run();
if (failures.length) {
  console.error("verify-internal-fine-liability-backlink-checked FAILED:");
  for (const f of failures) console.error(`  - ${f}`);
  process.exit(1);
}
console.log("verify-internal-fine-liability-backlink-checked OK — backlink UPDATE is company-scoped, guarded, and its result is checked");
