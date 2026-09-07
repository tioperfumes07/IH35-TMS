#!/usr/bin/env node
/**
 * USER-S06 (2026-09-07, live P0) — `POST /api/v1/identity/users` (the admin "create user" endpoint)
 * stamps `default_company_id` on the new user but was never inserting the matching
 * `org.user_company_access` grant row. The operating-company picker (`GET /api/v1/org/me/companies`,
 * `company-context.routes.ts`'s `loadAccessibleCompanies`) sources its available-companies list
 * STRICTLY from `org.user_company_access` for every role except 'Owner' — `default_company_id` alone
 * grants nothing. Every non-Owner user created through this endpoint got a company stamped that they
 * could not actually see or select: "select an operating company" with nothing to pick.
 *
 * Live-confirmed on prod 2026-09-07: 6 real users silently broken since 2026-06-10, including the
 * owner's own second login (jorge@ih35trucking.net) and the newest hire (Alberto,
 * dispatch@ih35trucking.net) who reported it. Fixed with a one-time backfill INSERT for the 6 affected
 * rows, and this code fix + guard so the next admin-created user is never silently locked out.
 *
 * This guard is intentionally scoped to the one handler implicated in the live incident
 * (`POST /api/v1/identity/users` in users.routes.ts) — the driver-creation paths in
 * applicants.routes.ts / driver-app-access.service.ts / drivers.routes.ts all set role='Driver' via a
 * separate mobile-app auth flow that was NOT part of this incident and has not been verified to share
 * this defect; do not widen this guard to them without live-verifying that flow separately first.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = "verify-create-user-grants-company-access";
const TARGET = path.join(ROOT, "apps/backend/src/identity/users.routes.ts");

/** Extracts the source text from `startIdx` (an opening `(` or `{`) to its matching close, counting
 * nesting depth over both () and {} pairs. Returns null if unbalanced. */
function extractBalanced(source, openIdx) {
  let depth = 0;
  for (let i = openIdx; i < source.length; i++) {
    const ch = source[i];
    if (ch === "(" || ch === "{") depth++;
    else if (ch === ")" || ch === "}") {
      depth--;
      if (depth === 0) return source.slice(openIdx, i + 1);
    }
  }
  return null;
}

export function checkCreateUserGrantsCompanyAccess(source) {
  const failures = [];

  const routeMarker = /app\.post\(\s*["']\/api\/v1\/identity\/users["']/;
  const routeMatch = routeMarker.exec(source);
  if (!routeMatch) {
    failures.push('POST "/api/v1/identity/users" handler not found.');
    return failures;
  }
  // Isolate the handler body: from the route's opening "(" of app.post(...) to its matching close.
  const openIdx = source.indexOf("(", routeMatch.index + "app.post".length);
  const handler = extractBalanced(source, openIdx);
  if (!handler) {
    failures.push("Could not isolate the POST /api/v1/identity/users handler body.");
    return failures;
  }

  if (!/INSERT INTO identity\.users/.test(handler)) {
    failures.push("Handler no longer inserts into identity.users — guard assumption changed, review.");
    return failures;
  }
  if (!/INSERT INTO org\.user_company_access/.test(handler)) {
    failures.push(
      "Handler creates a user with default_company_id but never inserts the matching " +
        "org.user_company_access grant row — this is the exact USER-S06 regression."
    );
  }
  if (/INSERT INTO org\.user_company_access/.test(handler) && !/ON CONFLICT/.test(handler)) {
    failures.push(
      "org.user_company_access insert has no ON CONFLICT DO NOTHING — a duplicate grant call would " +
        "throw instead of being a safe no-op."
    );
  }

  return failures;
}

function main() {
  if (process.argv.includes("--selftest")) {
    const good = `
      app.post("/api/v1/identity/users", RL_MUTATE, async (req, reply) => {
        const res = await client.query(
          \`INSERT INTO identity.users (email, role, default_company_id) VALUES ($1,$2,$3) RETURNING id\`,
          [a, b, c]
        );
        const row = res.rows[0];
        await client.query(
          \`INSERT INTO org.user_company_access (user_id, company_id, granted_by_user_id)
           VALUES ($1, $2, $3) ON CONFLICT (user_id, company_id) DO NOTHING\`,
          [row.id, inheritedCompanyId, authUser.uuid]
        );
      });
    `;
    const bad = `
      app.post("/api/v1/identity/users", RL_MUTATE, async (req, reply) => {
        const res = await client.query(
          \`INSERT INTO identity.users (email, role, default_company_id) VALUES ($1,$2,$3) RETURNING id\`,
          [a, b, c]
        );
        const row = res.rows[0];
      });
    `;
    const goodFailures = checkCreateUserGrantsCompanyAccess(good);
    const badFailures = checkCreateUserGrantsCompanyAccess(bad);
    if (goodFailures.length !== 0) {
      console.error(`[${LABEL}] SELFTEST FAILED: expected good fixture to pass, got`, goodFailures);
      process.exit(1);
    }
    if (badFailures.length === 0) {
      console.error(`[${LABEL}] SELFTEST FAILED: expected bad fixture to fail, got none`);
      process.exit(1);
    }
    console.log(`[${LABEL}] selftest OK (good=0 failures, bad=${badFailures.length} failures)`);
    process.exit(0);
  }

  if (!fs.existsSync(TARGET)) {
    console.error(`[${LABEL}] FAIL: target file not found: ${TARGET}`);
    process.exit(1);
  }
  const source = fs.readFileSync(TARGET, "utf8");
  const failures = checkCreateUserGrantsCompanyAccess(source);
  if (failures.length > 0) {
    console.error(`[${LABEL}] FAIL:`);
    for (const f of failures) console.error(`  - ${f}`);
    process.exit(1);
  }
  console.log(`[${LABEL}] PASS`);
}

main();
