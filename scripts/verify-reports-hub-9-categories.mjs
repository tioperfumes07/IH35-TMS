#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";

const ROOT = process.cwd();
const failures = [];

function fail(message) {
  failures.push(message);
}

function read(relativePath) {
  const absolutePath = path.join(ROOT, relativePath);
  if (!fs.existsSync(absolutePath)) {
    fail(`MISSING: ${relativePath}`);
    return "";
  }
  return fs.readFileSync(absolutePath, "utf8");
}

function contains(relativePath, content, checks) {
  if (!content) return;
  for (const check of checks) {
    const pattern = check.pattern instanceof RegExp ? check.pattern : new RegExp(check.pattern);
    if (!pattern.test(content)) {
      fail(`${relativePath}: missing ${check.label}`);
    }
  }
}

const catalog = read("apps/backend/src/reports/categories/category-catalog.ts");
contains("apps/backend/src/reports/categories/category-catalog.ts", catalog, [
  { pattern: /REPORT_CATEGORIES/, label: "REPORT_CATEGORIES export" },
  { pattern: /ops-dispatch/, label: "ops-dispatch category" },
  { pattern: /multi-company/, label: "multi-company category" },
]);

const routes = read("apps/backend/src/reports/categories/routes.ts");
contains("apps/backend/src/reports/categories/routes.ts", routes, [
  { pattern: /\/api\/reports\/categories\/catalog/, label: "catalog route" },
]);

read("apps/frontend/src/components/reports/ReportCategoryHoverNav.tsx");
read("apps/frontend/src/components/reports/ReportCard.tsx");
read("apps/frontend/src/pages/reports/ReportsHub.tsx");

const nav = read("apps/frontend/src/components/reports/ReportCategoryHoverNav.tsx");
contains("apps/frontend/src/components/reports/ReportCategoryHoverNav.tsx", nav, [
  { pattern: /report-category-hover-nav/, label: "hover nav test id" },
]);

const hub = read("apps/frontend/src/pages/reports/ReportsHub.tsx");
contains("apps/frontend/src/pages/reports/ReportsHub.tsx", hub, [
  { pattern: /ReportCategoryHoverNav/, label: "hub uses hover nav" },
  { pattern: /reports-hub-page/, label: "hub page test id" },
]);

for (const slug of [
  "ops-dispatch",
  "driver-perf",
  "equipment",
  "safety",
  "customers",
  "vendors",
  "accounting",
  "tax-reg",
  "multi-company",
]) {
  read(`apps/frontend/src/pages/reports/categories/${slug}.tsx`);
}

const categoryCount = (catalog.match(/id:\s*"/g) ?? []).length;
if (categoryCount < 9) fail(`category-catalog.ts: expected >=9 category ids, found ${categoryCount}`);

read("apps/backend/src/reports/categories/__tests__/category-catalog.test.ts");

const indexTs = read("apps/backend/src/index.ts");
contains("apps/backend/src/index.ts", indexTs, [
  { pattern: /registerReportCategoryCatalogRoutes/, label: "catalog routes registered" },
]);

const docs = read("docs/specs/gap-41-reports-hub-9-categories.md");
contains("docs/specs/gap-41-reports-hub-9-categories.md", docs, [
  { pattern: /GAP-41/, label: "GAP-41 identifier" },
  { pattern: /WF-061/, label: "WF-061 reference" },
]);

const manifest = read(".block-ready/GAP-41.json");
contains(".block-ready/GAP-41.json", manifest, [
  { pattern: /verify:reports-hub-9-categories/, label: "verify gate in manifest" },
]);

const pkg = read("package.json");
contains("package.json", pkg, [
  { pattern: /verify:reports-hub-9-categories/, label: "verify script in package.json" },
]);

if (failures.length > 0) {
  console.error("verify-reports-hub-9-categories FAILED:");
  for (const f of failures) console.error(`  - ${f}`);
  process.exit(1);
}

console.log("verify-reports-hub-9-categories PASS");
