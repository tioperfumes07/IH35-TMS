#!/usr/bin/env node
/**
 * GUARD: DRVFIN-F6169 — GET /api/v1/drivers/:id/advances must not false-404 a driver with an
 * active canonical authorization at the selected company but a DIFFERENT home company.
 *
 * ROOT CAUSE this freezes shut: the parent driver existence check in
 * apps/backend/src/drivers/advances.routes.ts used strict `operating_company_id = $2` equality,
 * even though the advance/account rows themselves are correctly selected-company scoped
 * (`aa.operating_company_id = $1` / `driver_finance.driver_advances.operating_company_id = $1`).
 * A shared/authorized driver (mdata.driver_company_authorizations, is_authorized=true) whose home
 * company differs from the caller's selected company would get a 404 on real, visible data. Mirrors
 * the same home-OR-active-authorization fallback apps/backend/src/mdata/drivers.routes.ts already
 * uses for its own GET /:id.
 *
 * Static-only (text-pattern) check against the real route file.
 *
 * Run:  node scripts/verify-driver-advances-shared-company-reverse.mjs [--selftest]
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const ROUTE_PATH = path.join(root, "apps/backend/src/drivers/advances.routes.ts");
const LABEL = "verify-driver-advances-shared-company-reverse";

export function checkDriverLookup(src) {
  const problems = [];
  // Isolate the driverRes query block specifically (not the whole file), so a match elsewhere in
  // the file (e.g. a comment mentioning driver_company_authorizations) can't fake a pass.
  const m = /const driverRes = await client\.query[\s\S]{0,600}?LIMIT 1\s*`/.exec(src);
  if (!m) {
    problems.push("driverRes query block not found at all — route shape changed unexpectedly");
    return problems;
  }
  const block = m[0];
  if (!/driver_company_authorizations/.test(block)) {
    problems.push("driverRes no longer falls back to mdata.driver_company_authorizations — a shared/authorized driver at a non-home company will 404 again");
  }
  if (!/is_authorized\s*=\s*true/.test(block)) {
    problems.push("driverRes's authorization fallback no longer requires is_authorized = true");
  }
  if (!/deactivated_at\s+IS\s+NULL/.test(block)) {
    problems.push("driverRes's authorization fallback no longer requires deactivated_at IS NULL");
  }
  if (!/operating_company_id\s*=\s*\$2/.test(block)) {
    problems.push("driverRes lost its home-company branch entirely (operating_company_id = $2)");
  }
  return problems;
}

if (process.argv.includes("--selftest")) {
  const failures = [];

  const bad = `
    const driverRes = await client.query<{ id: string }>(
      \`SELECT id FROM mdata.drivers WHERE id = $1::uuid AND operating_company_id = $2::uuid LIMIT 1\`,
      [driverId, operatingCompanyId]
    );
  `;
  if (checkDriverLookup(bad).length !== 3) {
    failures.push(`the real pre-fix defect (strict equality, no authorization fallback) expected 3 problems, got ${checkDriverLookup(bad).length}`);
  }

  const good = fs.readFileSync(ROUTE_PATH, "utf8");
  const goodProblems = checkDriverLookup(good);
  if (goodProblems.length !== 0) {
    failures.push(`the real fixed file was flagged: ${goodProblems.join("; ")}`);
  }

  // Partial regression: authorization fallback present but is_authorized check dropped.
  const partial = `
    const driverRes = await client.query<{ id: string }>(
      \`
        SELECT id FROM mdata.drivers
        WHERE id = $1::uuid
          AND (
            operating_company_id = $2::uuid
            OR EXISTS (
              SELECT 1 FROM mdata.driver_company_authorizations dca
              WHERE dca.driver_id = mdata.drivers.id
                AND dca.company_id = $2::uuid
                AND dca.deactivated_at IS NULL
            )
          )
        LIMIT 1
      \`,
      [driverId, operatingCompanyId]
    );
  `;
  if (checkDriverLookup(partial).length !== 1) {
    failures.push("a partial regression (is_authorized check silently dropped) was not caught");
  }

  if (failures.length) {
    console.error(`${LABEL} SELFTEST FAILED:`);
    for (const f of failures) console.error("  - " + f);
    process.exit(1);
  }
  console.log(
    `${LABEL} SELFTEST OK — the real pre-fix defect caught (3/3 problems), the real fixed file ` +
      `clears, a partial is_authorized-dropped regression caught.`
  );
  process.exit(0);
}

const src = fs.readFileSync(ROUTE_PATH, "utf8");
const problems = checkDriverLookup(src);
if (problems.length) {
  console.error(`${LABEL} FAIL — ${problems.length} problem(s):`);
  for (const p of problems) console.error("  ✗ " + p);
  process.exit(1);
}
console.log(`${LABEL} OK — GET /api/v1/drivers/:id/advances admits a shared/authorized driver, not just home company.`);
