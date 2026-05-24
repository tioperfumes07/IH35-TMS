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

function hasMembershipGuard(source, category) {
  if (source.includes("assertCompanyMembership(")) return true;

  if (category === "accounting") {
    const importsSharedWithScope =
      /\bwithCompanyScope\b/.test(source) &&
      /import\s*\{[^}]*\bwithCompanyScope\b[^}]*\}\s*from\s*["'](?:\.\/shared|..\/accounting\/shared)\.js["']/.test(source);
    if (importsSharedWithScope) return true;
  }

  if (category === "banking") {
    const localScopedHelper =
      source.includes("async function withCompanyScope") && source.includes("assertCompanyMembership(");
    const importsAccountingSharedScope =
      /\bwithCompanyScope\b/.test(source) &&
      /import\s*\{[^}]*\bwithCompanyScope\b[^}]*\}\s*from\s*["']..\/accounting\/shared\.js["']/.test(source);
    if (localScopedHelper || importsAccountingSharedScope) return true;
  }

  return false;
}

const violations = [];

for (const target of TARGETS) {
  for (const file of routeFiles(target.dir)) {
    const source = fs.readFileSync(file, "utf8");
    if (!hasReqCompanyExtraction(source)) continue;
    if (!hasMembershipGuard(source, target.label)) {
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
