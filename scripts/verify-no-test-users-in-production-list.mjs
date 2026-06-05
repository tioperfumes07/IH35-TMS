#!/usr/bin/env node
/**
 * CLOSURE-8 — production identity users list must hide archived test/seed emails.
 */
import dotenv from "dotenv";
import fs from "node:fs";
import path from "node:path";

dotenv.config();

const ROOT = process.cwd();

const paths = {
  migration: path.join(ROOT, "apps/backend/src/migrations/0396-archive-test-users.sql"),
  routes: path.join(ROOT, "apps/backend/src/identity/seed-cleanup/archive-test-users.routes.ts"),
  tests: path.join(ROOT, "apps/backend/src/identity/seed-cleanup/archive-test-users.test.ts"),
  usersRoutes: path.join(ROOT, "apps/backend/src/identity/users.routes.ts"),
};

function read(filePath) {
  if (!fs.existsSync(filePath)) return null;
  return fs.readFileSync(filePath, "utf8");
}

function fail(message) {
  console.error(`verify:no-test-users-in-production-list FAILED\n- ${message}`);
  process.exit(1);
}

async function runtimeProbe() {
  const baseUrl = process.env.API_BASE_URL?.replace(/\/$/, "") ?? process.env.FRONTEND_BASE_URL?.replace(/\/$/, "");
  const sessionCookie = process.env.VERIFY_LIST_PAGES_SESSION_COOKIE?.trim();
  if (!baseUrl || !sessionCookie) {
    console.log("verify:no-test-users-in-production-list SKIP runtime probe (API_BASE_URL or session cookie unset)");
    return;
  }

  const res = await fetch(`${baseUrl}/api/v1/identity/users`, {
    headers: { cookie: sessionCookie },
    redirect: "manual",
  });
  if (res.status >= 500) fail(`GET /api/v1/identity/users returned HTTP ${res.status}`);
  if (res.status !== 200) {
    console.log(`verify:no-test-users-in-production-list SKIP runtime probe (HTTP ${res.status})`);
    return;
  }

  const payload = await res.json();
  for (const user of payload.users ?? []) {
    const email = String(user.email ?? "").toLowerCase();
    if (email.endsWith("@test.invalid") || email.endsWith("@example.com") || email.startsWith("integration.")) {
      fail(`production users list still exposes test seed email: ${user.email}`);
    }
  }
}

async function main() {
  const migration = read(paths.migration);
  const routes = read(paths.routes);
  const tests = read(paths.tests);
  const usersRoutes = read(paths.usersRoutes);

  if (!migration) fail("missing migration 0396-archive-test-users.sql");
  if (!routes) fail("missing archive-test-users.routes.ts");
  if (!tests) fail("missing archive-test-users.test.ts");
  if (!usersRoutes) fail("missing identity/users.routes.ts");

  if (!migration.includes("archived_at")) fail("migration must add archived_at");
  if (!migration.includes("archived_reason")) fail("migration must add archived_reason");
  if (!migration.includes("@test.invalid")) fail("migration must archive @test.invalid users");
  if (!migration.includes("@example.com")) fail("migration must archive @example.com users");
  if (!migration.includes("integration.")) fail("migration must archive integration.* users");

  if (!routes.includes("include_archived")) fail("routes must support include_archived query param");
  if (!routes.includes("registerArchiveTestUsersRoutes")) fail("routes must export registerArchiveTestUsersRoutes");
  if (!routes.includes("isArchivedTestUserEmail")) fail("routes must export isArchivedTestUserEmail helper");

  if (!usersRoutes.includes("EXCLUDE_ARCHIVED_IDENTITY_USERS_SQL")) {
    fail("identity users list must filter archived rows by default");
  }

  if (!tests.includes("include_archived=true")) {
    fail("tests must cover include_archived=true on identity users list");
  }

  await runtimeProbe();
  console.log("verify:no-test-users-in-production-list OK");
}

main().catch((error) => {
  fail(String(error?.message ?? error));
});
