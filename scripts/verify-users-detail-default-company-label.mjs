#!/usr/bin/env node
/**
 * verify-users-detail-default-company-label.mjs
 * LV-USERS-DETAIL-DEFAULT-COMPANY-LABEL-MISSING — identity user detail must
 * include the target's default_company_id in accessible_companies when the
 * actor can see that company (user_accessible_company_ids), not only via
 * explicit org.user_company_access grants.
 */
import fs from "node:fs";
import path from "node:path";
import process from "node:process";

const LABEL = "verify-users-detail-default-company-label";
const TARGET = "apps/backend/src/identity/users.routes.ts";

function analyze(src) {
  const detailIdx = src.indexOf('"/api/v1/identity/users/:id/detail"');
  if (detailIdx < 0) return { ok: false, reason: "missing users/:id/detail route" };
  // Scope to this route handler (until next app.get/patch at similar indent or EOF)
  const rest = src.slice(detailIdx);
  const nextRoute = rest.search(/\n\s*app\.(get|patch|post|put|delete)\(/);
  const block = nextRoute > 0 ? rest.slice(0, nextRoute) : rest;

  if (!/user_accessible_company_ids\(\)/.test(block)) {
    return { ok: false, reason: "detail company query missing actor-scoped user_accessible_company_ids()" };
  }
  if (!/\$3::uuid/.test(block) || !/default_company_id/.test(block)) {
    return {
      ok: false,
      reason: "detail company query must bind target default_company_id ($3) into accessible_companies OR",
    };
  }
  // Must not be grants-only (Owner OR EXISTS access) without the default OR branch
  const companySelect = block.match(/SELECT c\.id[\s\S]*?ORDER BY c\.legal_name/);
  if (!companySelect) return { ok: false, reason: "missing accessible companies SELECT" };
  const sql = companySelect[0];
  if (!/c\.id = \$3::uuid/.test(sql) && !/c\.id = \$3/.test(sql)) {
    return { ok: false, reason: "accessible companies SQL missing OR c.id = $3::uuid default-company branch" };
  }
  if (!/IN \(SELECT org\.user_accessible_company_ids\(\)\)/.test(sql)) {
    return { ok: false, reason: "default-company branch must gate on actor user_accessible_company_ids()" };
  }
  return { ok: true };
}

function fail(msg) {
  console.error(`${LABEL} FAIL: ${msg}`);
  process.exit(1);
}

function selftest() {
  const bad = `
  app.get("/api/v1/identity/users/:id/detail", RL_READ, async () => {
    const companyRes = await client.query(\`
      SELECT c.id, c.code, c.legal_name, c.short_name
      FROM org.companies c
      WHERE c.is_active = true
        AND (
          $2 = 'Owner'
          OR EXISTS (SELECT 1 FROM org.user_company_access a WHERE a.user_id = $1 AND a.company_id = c.id)
        )
      ORDER BY c.legal_name
    \`, [id, role]);
  });
`;
  const good = `
  app.get("/api/v1/identity/users/:id/detail", RL_READ, async () => {
    const companyRes = await client.query(\`
      SELECT c.id, c.code, c.legal_name, c.short_name
      FROM org.companies c
      WHERE c.is_active = true
        AND (
          $2 = 'Owner'
          OR EXISTS (SELECT 1 FROM org.user_company_access a WHERE a.user_id = $1 AND a.company_id = c.id)
          OR (
            $3::uuid IS NOT NULL
            AND c.id = $3::uuid
            AND c.id IN (SELECT org.user_accessible_company_ids())
          )
        )
      ORDER BY c.legal_name
    \`, [id, role, default_company_id]);
  });
`;
  if (analyze(bad).ok) fail("selftest expected BAD grants-only query to fail");
  const g = analyze(good);
  if (!g.ok) fail(`selftest expected GOOD query to pass: ${g.reason}`);
  console.log(`${LABEL} selftest PASS`);
}

if (process.argv.includes("--selftest")) {
  selftest();
  process.exit(0);
}

const src = fs.readFileSync(path.join(process.cwd(), TARGET), "utf8");
const hit = analyze(src);
if (!hit.ok) fail(hit.reason);
console.log(`${LABEL} PASS — detail accessible_companies includes actor-scoped default_company_id`);
