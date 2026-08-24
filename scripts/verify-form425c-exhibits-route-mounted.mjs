#!/usr/bin/env node
/**
 * FLT/RPT-425C-MOUNT — the Form 425-C Exhibits A–F generator must stay MOUNTED and role-gated.
 *
 * WHY: registerForm425cExhibitsRoutes existed, was fully implemented and unit-tested, and was
 * referenced by NOTHING in production code — it was deliberately left out of the orphan-route mount
 * batch as "financial-adjacent". Meanwhile the frontend page IS mounted (routes/manifest.tsx) and
 * calls POST /api/v1/reports/form-425c/exhibits/build, which returned a hard 404 on prod. A file
 * existing is not proof it is wired; a route file plus a mounted page is not proof the endpoint
 * answers.
 *
 * WHY IT ASSERTS THE CALL SEPARATELY FROM THE IMPORT: a naive
 * `source.includes("registerForm425cExhibitsRoutes")` is satisfied by the IMPORT ALONE, so it would
 * report a mounted route while the registration call was gone — the exact shape of the original
 * defect. Import and invocation are checked as two independent facts.
 *
 * It also pins the auth gate. Mounting a court-report generator is only safe because the handler
 * enforces currentAuthUser + a role check (403) + withCompanyScope entity scoping; if a later change
 * strips those, the mount becomes an unauthenticated financial surface and this fails.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = fileURLToPath(new URL("..", import.meta.url));
const LABEL = "verify-form425c-exhibits-route-mounted";
const INDEX = join(ROOT, "apps/backend/src/index.ts");
const ROUTES = join(ROOT, "apps/backend/src/reports/form-425c/exhibits/routes.ts");

export function audit(indexSrc, routesSrc) {
  const problems = [];

  if (!/import\s*\{[^}]*registerForm425cExhibitsRoutes[^}]*\}\s*from\s*["'][^"']*reports\/form-425c\/exhibits\/routes\.js["']/.test(indexSrc)) {
    problems.push("index.ts does not IMPORT registerForm425cExhibitsRoutes from the exhibits routes module");
  }

  // The invocation, checked independently of the import — an import alone is not a mount.
  if (!/await\s+registerForm425cExhibitsRoutes\s*\(\s*app\s*\)/.test(indexSrc)) {
    problems.push(
      "index.ts never CALLS `await registerForm425cExhibitsRoutes(app)` — the generator would be an " +
        "orphan route again and /reports/form-425c/exhibits would 404"
    );
  }

  if (!/app\.post\(\s*["']\/api\/v1\/reports\/form-425c\/exhibits\/build["']/.test(routesSrc)) {
    problems.push("the build endpoint POST /api/v1/reports/form-425c/exhibits/build is missing");
  }

  // Auth gate — mounting is only defensible while these hold.
  if (!/currentAuthUser\s*\(/.test(routesSrc)) {
    problems.push("exhibits routes no longer call currentAuthUser — mounting would expose an unauthenticated court-report generator");
  }
  if (!/reply\.code\(403\)/.test(routesSrc)) {
    problems.push("exhibits routes no longer return 403 on the role check — the role gate is gone");
  }
  if (!/withCompanyScope\s*\(/.test(routesSrc)) {
    problems.push("exhibits routes no longer use withCompanyScope — reads would not be entity-scoped");
  }

  const buildChunk = (routesSrc.split('app.post("/api/v1/reports/form-425c/exhibits/build"')[1] ?? "").split(
    'app.get("/api/v1/reports/form-425c/exhibits/:filing_uuid"',
  )[0];
  if (
    !buildChunk.includes('e?.message === "forbidden_company_membership"') ||
    !buildChunk.includes('error: "forbidden_company_membership"')
  ) {
    problems.push(
      "exhibits POST /build must 403 forbidden_company_membership — blanket 502 mor_cash_source_error was a leftover 500-class",
    );
  }

  return problems;
}

function selftest() {
  const indexSrc = readFileSync(INDEX, "utf8");
  const routesSrc = readFileSync(ROUTES, "utf8");
  const failures = [];

  // Case 0 — the CORRECTED shape must not be flagged.
  const clean = audit(indexSrc, routesSrc);
  if (clean.length !== 0) failures.push(`case0 FAIL — corrected source flagged: ${clean.join("; ")}`);

  // Case 1 — the ORIGINAL defect: imported but never called. Must be caught.
  const importOnly = indexSrc.replace(/await\s+registerForm425cExhibitsRoutes\s*\(\s*app\s*\);?/, "");
  if (importOnly === indexSrc) failures.push("case1 INERT — mutation did not change the source");
  else if (!audit(importOnly, routesSrc).some((p) => /never CALLS/.test(p)))
    failures.push("case1 FAIL — import-without-call not caught (the original defect)");

  // Case 2 — import removed entirely.
  const noImport = indexSrc.replace(
    /import\s*\{\s*registerForm425cExhibitsRoutes\s*\}\s*from[^\n]*\n/,
    ""
  );
  if (noImport === indexSrc) failures.push("case2 INERT — mutation did not change the source");
  else if (!audit(noImport, routesSrc).some((p) => /IMPORT/.test(p)))
    failures.push("case2 FAIL — missing import not caught");

  // Case 3 — the role gate stripped from the handler.
  const noGate = routesSrc.replace(/reply\.code\(403\)/g, "reply.code(200)");
  if (noGate === routesSrc) failures.push("case3 INERT — mutation did not change the source");
  else if (!audit(indexSrc, noGate).some((p) => /403/.test(p)))
    failures.push("case3 FAIL — stripped 403 role gate not caught");

  const noMembership = routesSrc.replace('e?.message === "forbidden_company_membership"', "e?.message === \"other\"");
  if (noMembership === routesSrc) failures.push("case4 INERT — membership mutation did not change the source");
  else if (!audit(indexSrc, noMembership).some((p) => /forbidden_company_membership/.test(p)))
    failures.push("case4 FAIL — POST /build membership 502 not caught");

  if (failures.length) {
    for (const f of failures) console.error(`  ✗ ${LABEL}: ${f}`);
    process.exit(1);
  }
  console.log(`${LABEL}: selftest PASS — orphan-mount, missing import and stripped role gate all caught; correct shape clean`);
}

function main() {
  if (process.argv.includes("--selftest")) {
    selftest();
    return;
  }
  const problems = audit(readFileSync(INDEX, "utf8"), readFileSync(ROUTES, "utf8"));
  if (problems.length) {
    for (const p of problems) console.error(`  ✗ ${p}`);
    process.exit(1);
  }
  console.log(`${LABEL} OK — 425-C exhibits generator is imported, mounted, and still role-gated + entity-scoped`);
}

main();
