#!/usr/bin/env node
// GLB-25158 CI guard: the shared integration-test fixture
// (apps/backend/test-helpers/db-fixture.ts, ensureIntegrationPrerequisites()) upserts a
// TEST_OWNER row with role='Owner'. Since 202613312000_permission_model.sql,
// identity.guard_role_escalation() blocks any INSERT/UPDATE setting role='Owner' unless
// the acting session is already a primary owner — there is deliberately NO lucia
// bypass_rls escape for this trigger. A fresh test connection has no
// identity.current_user_id() at all, so it can never pass that check; the migration's own
// dedicated recovery GUC (app.allow_owner_bootstrap) is the only sanctioned way to seed the
// very first Owner row.
//
// Without the SET LOCAL below, EVERY integration test that calls
// ensureIntegrationPrerequisites() throws "role_escalation_blocked: only a primary owner
// can assign the Owner role" and the failure cascades (isolate:false shares module state
// across files in a worker) into unrelated 500/503 failures in completely different test
// files. Live-measured 2026-09-10: this was the dominant cause of 144 of 144 failed
// vitest test files on origin/main's own build-typecheck-heavy CI job (confirmed on
// GitHub Actions run 34427106844, a push straight to main, not a PR) — re-running the
// full backend suite locally with only this one fix applied dropped failing files from
// 144 to 15 (the remainder are unrelated pre-existing issues, not this guard's class).
//
// This guard fails CLOSED if that SET LOCAL is ever removed or reordered after the INSERT.

import { readFileSync } from "node:fs";

const FIXTURE_PATH = "apps/backend/test-helpers/db-fixture.ts";

function checkSource(src) {
  const errors = [];

  const bootstrapIdx = src.indexOf("SET LOCAL app.allow_owner_bootstrap");
  if (bootstrapIdx === -1) {
    errors.push(
      "db-fixture.ts no longer sets app.allow_owner_bootstrap before seeding the TEST_OWNER row " +
        "— every integration test using ensureIntegrationPrerequisites() will fail closed with " +
        "role_escalation_blocked (identity.guard_role_escalation, 202613312000_permission_model.sql)."
    );
    return errors;
  }

  const insertMatch = src.match(
    /INSERT INTO identity\.users[\s\S]*?VALUES[\s\S]*?'Owner'/
  );
  if (!insertMatch) {
    errors.push(
      "could not find the expected 'INSERT INTO identity.users ... VALUES (... 'Owner' ...)' " +
        "statement in db-fixture.ts — fixture shape changed; re-verify the bootstrap GUC still " +
        "precedes whichever statement now assigns role='Owner'."
    );
    return errors;
  }

  const insertIdx = src.indexOf(insertMatch[0]);
  if (bootstrapIdx > insertIdx) {
    errors.push(
      "SET LOCAL app.allow_owner_bootstrap runs AFTER the role='Owner' INSERT, not before — " +
        "Postgres will still enforce identity.guard_role_escalation() on the INSERT itself."
    );
  }

  return errors;
}

function runSelftest() {
  const cases = [
    {
      name: "bootstrap GUC removed entirely",
      src: `
        await client.query("BEGIN");
        await client.query(
          \`INSERT INTO identity.users (id, email, role) VALUES ($1, $2, 'Owner')\`,
          [id, email]
        );
      `,
      wantError: true,
    },
    {
      name: "bootstrap GUC set AFTER the INSERT (order regression)",
      src: `
        await client.query(
          \`INSERT INTO identity.users (id, email, role) VALUES ($1, $2, 'Owner')\`,
          [id, email]
        );
        await client.query(\`SET LOCAL app.allow_owner_bootstrap = '1'\`);
      `,
      wantError: true,
    },
    {
      name: "correctly ordered (real fixed shape)",
      src: `
        await client.query(\`SET LOCAL app.allow_owner_bootstrap = '1'\`);
        await client.query(
          \`INSERT INTO identity.users (id, email, role) VALUES ($1, $2, 'Owner')\`,
          [id, email]
        );
      `,
      wantError: false,
    },
  ];

  let failed = 0;
  for (const c of cases) {
    const errors = checkSource(c.src);
    const gotError = errors.length > 0;
    if (gotError !== c.wantError) {
      failed++;
      console.error(
        `  ✗ ${c.name}: expected ${c.wantError ? "an error" : "no error"}, got ${
          gotError ? `error(s): ${errors.join(" | ")}` : "no error"
        }`
      );
    } else {
      console.log(`  ok    ${c.name} → ${c.wantError ? "FAIL (caught)" : "PASS"}`);
    }
  }

  if (failed > 0) {
    console.error(`verify-integration-fixture-owner-bootstrap --selftest FAILED (${failed} case(s))`);
    process.exit(1);
  }
  console.log("verify-integration-fixture-owner-bootstrap --selftest PASS (3/3)");
}

if (process.argv.includes("--selftest")) {
  runSelftest();
  process.exit(0);
}

const src = readFileSync(FIXTURE_PATH, "utf8");
const errors = checkSource(src);
if (errors.length > 0) {
  console.error(`verify-integration-fixture-owner-bootstrap FAILED (${FIXTURE_PATH}):`);
  for (const e of errors) console.error(`  ✗ ${e}`);
  process.exit(1);
}
console.log(
  "verify-integration-fixture-owner-bootstrap OK — db-fixture.ts still sets app.allow_owner_bootstrap before the TEST_OWNER role='Owner' upsert."
);
