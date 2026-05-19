#!/usr/bin/env node
import fs from "node:fs";

function read(path) {
  return fs.readFileSync(path, "utf8");
}

function assertIncludes(source, needle, message) {
  if (!source.includes(needle)) throw new Error(message);
}

function assertMatches(source, regex, message) {
  if (!regex.test(source)) throw new Error(message);
}

try {
  const periodsRoutesPath = "apps/backend/src/accounting/periods.routes.ts";
  const p7Wave2Path = "apps/backend/src/accounting/p7-wave2.routes.ts";
  const postingEnginePath = "apps/backend/src/accounting/posting-engine.service.ts";
  const accountingIndexPath = "apps/backend/src/accounting/index.ts";

  const periodsRoutes = read(periodsRoutesPath);
  const p7Wave2 = read(p7Wave2Path);
  const postingEngine = read(postingEnginePath);
  const accountingIndex = read(accountingIndexPath);

  assertIncludes(
    periodsRoutes,
    'app.get("/api/v1/accounting/periods"',
    "Periods list read route is missing",
  );
  assertIncludes(
    periodsRoutes,
    'app.get("/api/v1/accounting/periods/:id"',
    "Single-period read route is missing",
  );
  if (periodsRoutes.includes('app.post("/api/v1/accounting/periods"')) {
    throw new Error("Periods read module must stay read-only (POST found)");
  }

  if (/\b(INSERT|UPDATE|DELETE|CREATE|ALTER|DROP)\b/i.test(periodsRoutes)) {
    throw new Error("Periods read module must be SQL read-only (write SQL keyword found)");
  }

  assertIncludes(
    accountingIndex,
    "registerAccountingPeriodsReadRoutes",
    "Accounting periods read routes are not registered",
  );

  assertIncludes(
    p7Wave2,
    'app.post("/api/v1/accounting/periods/:id/close"',
    "Close period route is missing",
  );
  assertIncludes(
    p7Wave2,
    'app.post("/api/v1/accounting/periods/:id/reopen"',
    "Reopen period route is missing",
  );
  assertMatches(
    p7Wave2,
    /const periodCloseRoles = new Set\(\["Owner", "Administrator", "Accountant"\]\)/,
    "Close route roles must be Owner/Administrator/Accountant",
  );
  assertIncludes(
    p7Wave2,
    "if (!periodCloseRoles.has(String(user.role ?? \"\"))) return reply.code(403).send({ error: \"forbidden\" });",
    "Close route must enforce period close role restriction",
  );
  assertIncludes(
    p7Wave2,
    'if (user.role !== "Owner") return reply.code(403).send({ error: "forbidden" });',
    "Reopen route must remain role-restricted",
  );

  assertIncludes(
    postingEngine,
    "async function ensureOpenPeriod(",
    "Posting engine closed-period helper is missing",
  );
  assertIncludes(
    postingEngine,
    "await ensureOpenPeriod(client, input.operating_company_id, draft.postingDate);",
    "Posting path must call ensureOpenPeriod",
  );
  assertIncludes(
    postingEngine,
    "await ensureOpenPeriod(client, input.operating_company_id, reversalDate);",
    "Reversal path must call ensureOpenPeriod",
  );

  console.log("verify:accounting-periods-contract — OK");
} catch (error) {
  console.error(`verify:accounting-periods-contract — FAILED: ${error.message}`);
  process.exit(1);
}
