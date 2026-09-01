#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";

const TARGETS = [
  { label: "accounting", dir: "apps/backend/src/accounting" },
  { label: "banking", dir: "apps/backend/src/banking" },
];

function routeFiles(dir) {
  return fs
    .readdirSync(dir, { withFileTypes: true })
    .flatMap((entry) => {
      if (entry.isDirectory()) return routeFiles(path.join(dir, entry.name));
      if (!entry.isFile() || !entry.name.endsWith(".routes.ts")) return [];
      return [path.join(dir, entry.name)];
    })
    .sort();
}

function hasReqCompanyExtraction(source) {
  return (
    source.includes("operating_company_id") &&
    (source.includes("req.query") || source.includes("req.body") || source.includes("safeParse(req.query") || source.includes("safeParse(req.body"))
  );
}

// GUARD-TENANT-SCOPE-RELATIVE-IMPORT-BLINDSPOT (CC-2 2026-09-01): the banking/accounting branches
// below originally recognized `withCompanyScope` only when imported from one specific hardcoded
// path (`../accounting/shared.js`). A route file importing an equally-real, equally-enforced
// `withCompanyScope` from any OTHER relative sibling module (e.g. a module-local `./shared.js`
// that itself calls `assertCompanyMembership(`) tripped a false-positive FAIL — proven live on
// apps/backend/src/banking/bank-orphan-backfill.routes.ts, which imports `withCompanyScope` from
// `./shared.js` (apps/backend/src/banking/shared.ts), whose own body genuinely calls
// `assertCompanyMembership(userId, operatingCompanyId)` before running any scoped query. That is
// real enforcement, not a gap — the guard's pattern was just too narrow to see it. Fixed by
// resolving ANY relative `withCompanyScope` import target and checking that its own source
// (not just the route file) calls `assertCompanyMembership(` or `assertAccessibleCompanyScope(` —
// this cannot be gamed by an unrelated same-named export, since it recurses into the real file.
function resolvedImportEnforcesMembership(source, filePath) {
  const importMatch = /import\s*\{[^}]*\bwithCompanyScope\b[^}]*\}\s*from\s*["'](\.[^"']+)["']/.exec(source);
  if (!importMatch) return false;
  const specifier = importMatch[1];
  const dir = path.dirname(filePath);
  const withoutExt = specifier.replace(/\.js$/, "");
  for (const ext of [".ts", ".js", ".tsx"]) {
    const candidate = path.resolve(dir, `${withoutExt}${ext}`);
    if (!fs.existsSync(candidate)) continue;
    const targetSource = fs.readFileSync(candidate, "utf8");
    if (targetSource.includes("assertCompanyMembership(") || targetSource.includes("assertAccessibleCompanyScope(")) {
      return true;
    }
  }
  return false;
}

function hasMembershipGuard(source, category, filePath) {
  if (source.includes("assertCompanyMembership(")) return true;

  // assertAccessibleCompanyScope() is the MULTI-company equivalent of assertCompanyMembership: it
  // queries org.user_company_access and returns true only when the caller can access EVERY requested
  // operating_company_id (Owner bypass). It is the sanctioned membership check for cross-entity
  // read-only reports (multi-entity roll-up + consolidated statements), which legitimately take a LIST
  // of operating_company_ids. Recognizing it is not a weakening — it enforces membership per company.
  if (source.includes("assertAccessibleCompanyScope(")) return true;

  if (category === "accounting") {
    const importsSharedWithScope =
      /\bwithCompanyScope\b/.test(source) &&
      /import\s*\{[^}]*\bwithCompanyScope\b[^}]*\}\s*from\s*["'](?:\.\/shared|..\/accounting\/shared)\.js["']/.test(source);
    if (importsSharedWithScope) return true;
  }

  if (category === "banking") {
    const localScopedHelper =
      source.includes("async function withCompanyScope") && source.includes("assertCompanyMembership(");
    const importsBankingSharedScope =
      /\bwithCompanyScope\b/.test(source) &&
      /import\s*\{[^}]*\bwithCompanyScope\b[^}]*\}\s*from\s*["']\.\/shared\.js["']/.test(source);
    const importsAccountingSharedScope =
      /\bwithCompanyScope\b/.test(source) &&
      /import\s*\{[^}]*\bwithCompanyScope\b[^}]*\}\s*from\s*["']..\/accounting\/shared\.js["']/.test(source);
    if (localScopedHelper || importsBankingSharedScope || importsAccountingSharedScope) return true;
  }

  if (/\bwithCompanyScope\b/.test(source) && resolvedImportEnforcesMembership(source, filePath)) return true;

  return false;
}

const violations = [];

for (const target of TARGETS) {
  for (const file of routeFiles(target.dir)) {
    const source = fs.readFileSync(file, "utf8");
    if (!hasReqCompanyExtraction(source)) continue;
    if (!hasMembershipGuard(source, target.label, file)) {
      violations.push(`${file}: missing assertCompanyMembership/withCompanyScope membership enforcement`);
    }
  }
}

if (violations.length > 0) {
  console.error("✘ verify-tenant-scope-on-routes failed");
  for (const violation of violations) {
    console.error(`  - ${violation}`);
  }
  process.exit(1);
}

console.log("✅ verify-tenant-scope-on-routes passed");
