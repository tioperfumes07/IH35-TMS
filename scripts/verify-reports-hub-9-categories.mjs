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

// CLASS FIX (2026-08-08) — a guard must not fail for the absence of the one edit the constitution forbids.
//
// This block required a `verify:reports-hub-9-categories` entry in package.json. Rule 17 (no-guard-hotfile-thrash) and
// verify-guard-wired's own header both say the opposite, verbatim:
//
//     "NEW GUARDS: add scripts/verify-X.mjs + scripts/verify-steps/NNN-verify-X.mjs ONLY.
//      Do NOT edit package.json / locked-guards.yml / ci.yml — that is the shared-file thrash."
//     "package.json script is OPTIONAL (local convenience only)."
//
// So these guards were red for missing the single edit they are forbidden to make, and "fixing" them
// literally meant touching a serialized hot file every lane contends on. Execution is proven by the
// verify-step, so that is what is reported — as a NOTE, because wiring needs a claimed number (Rule 37).
const wiredStep__reports_hub_9_categories = fs
  .readdirSync(path.join(ROOT, "scripts/verify-steps"))
  .some((f) => /^\d+-verify-reports-hub-9-categories\.mjs$/.test(f));
if (!wiredStep__reports_hub_9_categories) {
  console.warn(
    "verify-reports-hub-9-categories: NOTE — no scripts/verify-steps/NNNN-verify-reports-hub-9-categories.mjs, so this guard does not execute " +
      "in CI. Wiring it requires a claimed step number (Rule 37); a package.json script does not wire it.",
  );
}

if (failures.length > 0) {
  console.error("verify-reports-hub-9-categories FAILED:");
  for (const f of failures) console.error(`  - ${f}`);
  process.exit(1);
}

console.log("verify-reports-hub-9-categories PASS");
