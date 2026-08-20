#!/usr/bin/env node
/**
 * ACCT-F5595 regression guard — PATCH /:uuid, POST /:uuid/deactivate, and POST /:uuid/generate-now
 * in accounting/bills/recurring/routes.ts must resolve the template's real owning company and
 * assert membership before mutating it.
 *
 * All 3 routes took ONLY a template uuid (no operating_company_id anywhere in params/query/body)
 * and had zero ownership check -- a caller who knew/guessed another company's recurring-bill-
 * template uuid could update it, deactivate it, or (via generate-now) trigger creation of a REAL
 * bill in that company's books. generateFromTemplate() itself fetches the template via
 * withLuciaBypass (a full RLS bypass, since it also serves the company-agnostic cron tick that
 * processes every company's due templates in one pass) -- so RLS was never even a partial backstop
 * on this path. The sibling create/list/get-by-id routes in this file already correctly derive and
 * assert membership; update/deactivate/generate-now had simply never been given the same treatment.
 *
 * Fix: template.service.ts's resolveTemplateOperatingCompanyId(uuid) looks up the template's real
 * owner (also via withLuciaBypass, since resolving an owner for an authz check is not itself a
 * data read that needs company scoping); each route then calls assertCompanyMembership against
 * that resolved id before calling the actual mutator.
 *
 * This static check (no DB connection) asserts each of the 3 routes calls
 * resolveTemplateOperatingCompanyId followed by assertCompanyMembership before its mutator.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = "verify:recurring-bill-template-ownership-check";
const SELFTEST = process.argv.includes("--selftest");
const FILE = "apps/backend/src/accounting/bills/recurring/routes.ts";

const RESOLVE_LINE = "resolveTemplateOperatingCompanyId(params.data.uuid);";
const ASSERT_LINE = "await assertCompanyMembership(String(user.uuid), ownerCompanyId);";

const ROUTES = [
  ['app.patch("/api/v1/accounting/recurring-bill-templates/:uuid"', "PATCH /:uuid"],
  ['app.post("/api/v1/accounting/recurring-bill-templates/:uuid/deactivate"', "POST /:uuid/deactivate"],
  ['app.post("/api/v1/accounting/recurring-bill-templates/:uuid/generate-now"', "POST /:uuid/generate-now"],
];
const WINDOW = 1700;

function assertAll(src) {
  const problems = [];
  for (const [needle, label] of ROUTES) {
    const idx = src.indexOf(needle);
    if (idx === -1) {
      problems.push(`${label}: route not found (guard target moved; update this guard)`);
      continue;
    }
    const window = src.slice(idx, idx + WINDOW);
    if (!window.includes(RESOLVE_LINE)) {
      problems.push(`${label}: does not resolve the template's real owning company before mutating`);
    }
    if (!window.includes(ASSERT_LINE)) {
      problems.push(`${label}: does not assert membership against the resolved owner before mutating`);
    }
  }
  return problems;
}

const read = () => fs.readFileSync(path.join(ROOT, FILE), "utf8");

if (SELFTEST) {
  const src = read();
  // Plant the defect on generate-now -- the most severe of the 3 (creates a real bill).
  const [needle, label] = ROUTES[2];
  const idx = src.indexOf(needle);
  if (idx === -1) {
    console.error(`${LABEL} SELFTEST SETUP FAILED: ${label} route not found in real code`);
    process.exit(1);
  }
  const assertIdx = src.indexOf(ASSERT_LINE, idx);
  if (assertIdx === -1 || assertIdx - idx > WINDOW) {
    console.error(`${LABEL} SELFTEST SETUP FAILED: assert line not found near ${label} (guard text drifted from real code)`);
    process.exit(1);
  }
  const lineStart = src.lastIndexOf("\n", assertIdx) + 1;
  const lineEnd = src.indexOf("\n", assertIdx) + 1;
  const planted = src.slice(0, lineStart) + src.slice(lineEnd);

  const plantedProblems = assertAll(planted);
  if (!plantedProblems.some((p) => p.startsWith(label))) {
    console.error(`${LABEL} SELFTEST FAILED: planted defect (${label} membership assert dropped) not caught`);
    process.exit(1);
  }

  const live = assertAll(src);
  if (live.length) {
    console.error(`${LABEL} SELFTEST FAILED live: ${live.join(" | ")}`);
    process.exit(1);
  }
  console.log(`${LABEL} SELFTEST PASS`);
  process.exit(0);
}

const problems = assertAll(read());
if (problems.length) {
  console.error(`${LABEL} FAILED:`);
  for (const p of problems) console.error(`  ${p}`);
  process.exit(1);
}
console.log(`${LABEL} OK`);
