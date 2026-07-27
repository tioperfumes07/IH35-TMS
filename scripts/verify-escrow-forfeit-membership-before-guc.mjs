#!/usr/bin/env node
/**
 * ND-ESC-01 / cross-tenant: escrow forfeit must assert membership on the SAME
 * client before every caller-derived app.operating_company_id GUC set.
 * Pre-fix shape: outer assert(userId, opco) + two withCurrentUser GUC sets
 * without client-scoped asserts → verify-company-membership-assert RED.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const REL = "apps/backend/src/driver-finance/escrow-forfeit.routes.ts";
const LABEL = "verify-escrow-forfeit-membership-before-guc";

function assertSource(src) {
  const problems = [];
  const guc = [...src.matchAll(/set_config\(\s*['"]app\.operating_company_id['"]/g)];
  const clientAssert = [...src.matchAll(/assertCompanyMembership\(\s*client\s*,/g)];
  if (guc.length < 1) {
    problems.push(`${REL}: expected at least one caller-derived app.operating_company_id GUC set`);
  }
  if (clientAssert.length < guc.length) {
    problems.push(
      `${REL}: ${clientAssert.length} assertCompanyMembership(client,…) < ${guc.length} GUC set(s) — membership must precede every caller-derived tenant GUC on the same client`
    );
  }
  // Single withCurrentUser gate (no second txn that re-sets GUC without assert)
  const withUser = [...src.matchAll(/withCurrentUser\s*\(/g)];
  if (withUser.length !== 1) {
    problems.push(
      `${REL}: expected exactly one withCurrentUser gate for clause+catalog (got ${withUser.length}) — split txns reintroduce assert/GUC skew`
    );
  }
  if (!/assertCompanyMembership\(\s*client\s*,[\s\S]{0,200}set_config\(\s*['"]app\.operating_company_id['"]/m.test(src)) {
    problems.push(`${REL}: assertCompanyMembership(client,…) must appear before set_config(app.operating_company_id)`);
  }
  return problems;
}

function selftest() {
  const good = `
    const gate = await withCurrentUser(user.uuid, async (client) => {
      await assertCompanyMembership(client, user.uuid, opco);
      await client.query("SELECT set_config('app.operating_company_id', $1, true)", [opco]);
      return { status: "ok" };
    });
  `;
  const badDual = `
    await assertCompanyMembership(user.uuid, opco);
    await withCurrentUser(user.uuid, async (client) => {
      await client.query("SELECT set_config('app.operating_company_id', $1, true)", [opco]);
    });
    await withCurrentUser(user.uuid, async (client) => {
      await client.query("SELECT set_config('app.operating_company_id', $1, true)", [opco]);
    });
  `;
  const failures = [];
  if (assertSource(good).length) failures.push("good fixture rejected");
  if (!assertSource(badDual).some((p) => p.includes("GUC"))) {
    failures.push("dual-GUC without client assert not caught");
  }
  if (failures.length) {
    console.error(`${LABEL} SELFTEST FAILED:`);
    for (const f of failures) console.error(`  ${f}`);
    process.exit(1);
  }
  console.log(`${LABEL} --selftest PASS`);
}

if (process.argv.includes("--selftest")) {
  selftest();
  process.exit(0);
}

const abs = path.join(ROOT, REL);
if (!fs.existsSync(abs)) {
  console.error(`${LABEL} FAIL: missing ${REL}`);
  process.exit(1);
}
const problems = assertSource(fs.readFileSync(abs, "utf8"));
if (problems.length) {
  console.error(`${LABEL} FAIL:`);
  for (const p of problems) console.error(`  ${p}`);
  process.exit(1);
}
console.log(`${LABEL} PASS — escrow forfeit asserts membership on the same client before GUC`);
