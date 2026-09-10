#!/usr/bin/env node
// GLB-25158 CI guard: two throwaway test/CI-environment seed sites upsert a fixture user with
// role='Owner':
//   - apps/backend/test-helpers/db-fixture.ts (ensureIntegrationPrerequisites(), the TEST_OWNER row
//     every integration test shares)
//   - scripts/verify-db-reset.mjs (CI-F06, the shared DB-test fixture actor four accounting scenario
//     suites FK against)
//
// Since 202613312000_permission_model.sql, identity.guard_role_escalation() blocks any INSERT/UPDATE
// setting role='Owner' unless the acting session is already a primary owner — there is deliberately
// NO lucia bypass_rls escape for this trigger. Both seed connections are fresh, with no
// identity.current_user_id() at all, so neither can ever pass that check; the migration's own
// dedicated recovery GUC (app.allow_owner_bootstrap) is the only sanctioned way to seed the very
// first Owner row.
//
// Without a `SET [LOCAL] app.allow_owner_bootstrap = '1'` immediately before each INSERT, every
// integration test that depends on that seed throws "role_escalation_blocked: only a primary owner
// can assign the Owner role" (db-fixture.ts) or silently warns and skips the insert, cascading into
// downstream FK-violation failures in every suite that FKs the missing actor row (verify-db-reset.mjs).
// Live-measured 2026-09-10: this was the dominant cause of 144 of 1031 failed vitest test files on
// origin/main's own build-typecheck-heavy CI job (GitHub Actions run 34427106844, a push straight to
// main, not a PR) — fixing db-fixture.ts alone dropped local failures from 144 to 15; the
// verify-db-reset.mjs seed explains a further slice of CI-only failures (four accounting .db.test.ts
// scenario suites) that a local scratch DB without CI's exact reset flow doesn't reproduce.
//
// This guard fails CLOSED if either bootstrap GUC is ever removed or reordered after its INSERT.

import { readFileSync } from "node:fs";

const TARGETS = [
  {
    path: "apps/backend/test-helpers/db-fixture.ts",
    guc: "SET LOCAL app.allow_owner_bootstrap",
  },
  {
    path: "scripts/verify-db-reset.mjs",
    guc: "SET app.allow_owner_bootstrap",
  },
];

function checkOne(path, guc, src) {
  const errors = [];

  const bootstrapIdx = src.indexOf(guc);
  if (bootstrapIdx === -1) {
    errors.push(
      `${path} no longer sets app.allow_owner_bootstrap before its role='Owner' seed insert — ` +
        "that insert will now fail closed with role_escalation_blocked " +
        "(identity.guard_role_escalation, 202613312000_permission_model.sql)."
    );
    return errors;
  }

  const insertMatch = src.match(/INSERT INTO identity\.users[\s\S]*?VALUES[\s\S]*?'Owner'/);
  if (!insertMatch) {
    errors.push(
      `could not find the expected 'INSERT INTO identity.users ... VALUES (... 'Owner' ...)' ` +
        `statement in ${path} — fixture shape changed; re-verify the bootstrap GUC still ` +
        "precedes whichever statement now assigns role='Owner'."
    );
    return errors;
  }

  const insertIdx = src.indexOf(insertMatch[0]);
  if (bootstrapIdx > insertIdx) {
    errors.push(
      `${guc} runs AFTER the role='Owner' INSERT in ${path}, not before — Postgres will still ` +
        "enforce identity.guard_role_escalation() on the INSERT itself."
    );
  }

  return errors;
}

function runSelftest() {
  const cases = [
    {
      name: "bootstrap GUC removed entirely",
      guc: "SET LOCAL app.allow_owner_bootstrap",
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
      guc: "SET LOCAL app.allow_owner_bootstrap",
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
      name: "correctly ordered (real fixed shape, SET LOCAL)",
      guc: "SET LOCAL app.allow_owner_bootstrap",
      src: `
        await client.query(\`SET LOCAL app.allow_owner_bootstrap = '1'\`);
        await client.query(
          \`INSERT INTO identity.users (id, email, role) VALUES ($1, $2, 'Owner')\`,
          [id, email]
        );
      `,
      wantError: false,
    },
    {
      name: "correctly ordered (real fixed shape, session SET)",
      guc: "SET app.allow_owner_bootstrap",
      src: `
        await seedClient.query(\`SET app.allow_owner_bootstrap = '1'\`);
        await seedClient.query(
          \`INSERT INTO identity.users (id, email, role) VALUES ($1, $2, 'Owner')\`,
          [id, email]
        );
      `,
      wantError: false,
    },
  ];

  let failed = 0;
  for (const c of cases) {
    const errors = checkOne("<selftest>", c.guc, c.src);
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
  console.log(`verify-integration-fixture-owner-bootstrap --selftest PASS (${cases.length}/${cases.length})`);
}

if (process.argv.includes("--selftest")) {
  runSelftest();
  process.exit(0);
}

let allErrors = [];
for (const { path, guc } of TARGETS) {
  const src = readFileSync(path, "utf8");
  const errors = checkOne(path, guc, src);
  allErrors = allErrors.concat(errors);
}

if (allErrors.length > 0) {
  console.error("verify-integration-fixture-owner-bootstrap FAILED:");
  for (const e of allErrors) console.error(`  ✗ ${e}`);
  process.exit(1);
}
console.log(
  `verify-integration-fixture-owner-bootstrap OK — both seed sites (${TARGETS.map((t) => t.path).join(", ")}) still set app.allow_owner_bootstrap before their role='Owner' insert.`
);
