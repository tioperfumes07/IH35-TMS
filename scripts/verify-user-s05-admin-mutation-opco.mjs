#!/usr/bin/env node
/**
 * USER-S05 — RLS / operating_company_id isolation on user-admin mutations.
 * Static ratchet (no verify-steps / CLAIMED — Rule 37; ITEM-14-TXN-COMPANY-ISOLATION-GUARD pattern for users).
 *
 * identity.users RLS is role-only (Owner/Administrator may UPDATE any row). Application mutations
 * MUST therefore re-apply the same company-scope predicate as GET list/detail, or admins can
 * cross-tenant patch/deactivate by UUID.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = "verify-user-s05-admin-mutation-opco";
const SELFTEST = process.argv.includes("--selftest");
const USERS_ROUTES = "apps/backend/src/identity/users.routes.ts";

function read(rel) {
  return fs.readFileSync(path.join(ROOT, rel), "utf8");
}

function extractHandler(src, method, routePath) {
  const needle = `app.${method}("${routePath}"`;
  const start = src.indexOf(needle);
  if (start < 0) return "";
  // Next top-level app.get/post/patch/put/delete after this handler open
  const rest = src.slice(start + needle.length);
  const next = rest.search(/\n  app\.(get|post|patch|put|delete)\(/);
  return next < 0 ? src.slice(start) : src.slice(start, start + needle.length + next);
}

function assertLive() {
  const problems = [];
  const src = read(USERS_ROUTES);

  if (!src.includes("TARGET_USER_IN_ACTOR_COMPANY_SCOPE_SQL")) {
    problems.push("users.routes must define TARGET_USER_IN_ACTOR_COMPANY_SCOPE_SQL");
  }
  if (!src.includes("user_accessible_company_ids()")) {
    problems.push("users.routes must reference org.user_accessible_company_ids()");
  }
  if (!src.includes("activeCompanyFilterSql")) {
    problems.push("users.routes must offer optional operating_company_id active-company filter");
  }

  const patch = extractHandler(src, "patch", "/api/v1/identity/users/:id");
  if (!patch) problems.push('missing PATCH /api/v1/identity/users/:id');
  if (patch && !patch.includes("TARGET_USER_IN_ACTOR_COMPANY_SCOPE_SQL")) {
    problems.push("PATCH users/:id must apply TARGET_USER_IN_ACTOR_COMPANY_SCOPE_SQL");
  }
  if (patch && !patch.includes("tenantQuerySchema")) {
    problems.push("PATCH users/:id must parse tenantQuerySchema (operating_company_id)");
  }
  // Forbid unscoped UPDATE by id alone inside the PATCH handler.
  if (patch && /UPDATE identity\.users[\s\S]*?WHERE id = \$2\s*\n/.test(patch) && !patch.includes("TARGET_USER_IN_ACTOR_COMPANY_SCOPE_SQL")) {
    problems.push("PATCH users/:id UPDATE must not be bare WHERE id = $2");
  }

  const create = extractHandler(src, "post", "/api/v1/identity/users");
  if (!create) problems.push('missing POST /api/v1/identity/users');
  if (create && !create.includes("operating_company_id")) {
    problems.push("POST users create must accept/resolve operating_company_id");
  }
  if (create && !create.includes("user_accessible_company_ids()")) {
    problems.push("POST users create must validate company via user_accessible_company_ids()");
  }
  if (create && !create.includes("operating_company_forbidden")) {
    problems.push("POST users create must reject inaccessible operating_company_id");
  }

  const deactivate = extractHandler(src, "post", "/api/v1/identity/users/:id/deactivate");
  if (!deactivate) problems.push('missing POST /api/v1/identity/users/:id/deactivate');
  if (deactivate && !deactivate.includes("TARGET_USER_IN_ACTOR_COMPANY_SCOPE_SQL")) {
    problems.push("deactivate must apply TARGET_USER_IN_ACTOR_COMPANY_SCOPE_SQL");
  }
  if (deactivate && !deactivate.includes("tenantQuerySchema")) {
    problems.push("deactivate must parse tenantQuerySchema (operating_company_id)");
  }

  return problems;
}

if (SELFTEST) {
  const live = assertLive();
  if (live.length) {
    console.error(`${LABEL} SELFTEST FAILED live: ${live.join(" | ")}`);
    process.exit(1);
  }
  const routesPath = path.join(ROOT, USERS_ROUTES);
  const orig = fs.readFileSync(routesPath, "utf8");
  const broken = orig.replaceAll("TARGET_USER_IN_ACTOR_COMPANY_SCOPE_SQL", "TARGET_USER_SCOPE_REMOVED");
  fs.writeFileSync(routesPath, broken);
  try {
    if (!assertLive().length) {
      console.error(`${LABEL} SELFTEST FAILED: planted defect not caught`);
      process.exit(1);
    }
  } finally {
    fs.writeFileSync(routesPath, orig);
  }
  console.log(`${LABEL} SELFTEST PASS`);
  process.exit(0);
}

const problems = assertLive();
if (problems.length) {
  console.error(`${LABEL} FAILED:`);
  for (const p of problems) console.error(`  ${p}`);
  process.exit(1);
}
console.log(`${LABEL} OK`);
