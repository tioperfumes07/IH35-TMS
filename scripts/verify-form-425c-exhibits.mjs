#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";

const ROOT = process.cwd();
// Rule 17 (no-guard-hotfile-thrash): a guard must NOT require a package.json / ci.yml edit —
// those are the shared hot files every lane contends on, and Rule 17 forbids a new guard from touching
// them. What actually makes a guard run in CI is a verify-step, so check for that and report its
// absence as a NOTE, never as a failure.
const wiredStep__form_425c_exhibits = fs
  .readdirSync(path.join(ROOT, "scripts/verify-steps"))
  .some((f) => /^\d+-verify-form-425c-exhibits\.mjs$/.test(f));
if (!wiredStep__form_425c_exhibits) {
  console.warn(
    "verify-form-425c-exhibits: NOTE — no scripts/verify-steps/NNNN-verify-form-425c-exhibits.mjs, so this guard does not execute in CI. Wiring it requires a claimed step number (Rule 37); a package.json script does not wire it."
  );
}

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

const letters = ["a", "b", "c", "d", "e", "f"];
for (const letter of letters) {
  read(`apps/backend/src/reports/form-425c/exhibits/exhibit-${letter}-${letter === "a" ? "cash-receipts" : letter === "b" ? "disbursements" : letter === "c" ? "bank-reconciliation" : letter === "d" ? "quarterly-fees" : letter === "e" ? "statements-summary" : "supporting-docs"}.ts`);
}

read("apps/backend/src/reports/form-425c/exhibits/exhibits-builder.service.ts");
read("apps/backend/src/reports/form-425c/exhibits/__tests__/exhibits.test.ts");

const routes = read("apps/backend/src/reports/form-425c/exhibits/routes.ts");
contains("apps/backend/src/reports/form-425c/exhibits/routes.ts", routes, [
  { pattern: /registerForm425cExhibitsRoutes/, label: "route register export" },
  { pattern: /\/api\/v1\/reports\/form-425c\/exhibits\/build/, label: "build POST route" },
  { pattern: /\/api\/v1\/reports\/form-425c\/exhibits\/:filing_uuid/, label: "filing GET route" },
  { pattern: /exhibit\/:letter/, label: "single exhibit GET route" },
]);

const reportsIndex = read("apps/backend/src/reports/index.ts");
contains("apps/backend/src/reports/index.ts", reportsIndex, [
  { pattern: /registerForm425cExhibitsRoutes/, label: "exhibits routes registered in reports index" },
]);

const exhibitsViewer = read("apps/frontend/src/pages/reports/form-425c/ExhibitsViewer.tsx");
if (exhibitsViewer && /to="\/(legal|finance|accounting)\//.test(exhibitsViewer)) {
  fail("apps/frontend/src/pages/reports/form-425c/ExhibitsViewer.tsx: leftover /425c must not steal /legal /finance /accounting prefixes");
}
read("apps/frontend/src/components/form-425c/ExhibitCard.tsx");

const manifest = read("apps/frontend/src/routes/manifest.tsx");
contains("apps/frontend/src/routes/manifest.tsx", manifest, [
  { pattern: /ExhibitsViewer/, label: "ExhibitsViewer wired in manifest" },
  { pattern: /\/reports\/form-425c\/exhibits/, label: "exhibits route path" },
]);

const docs = read("docs/specs/gap-44-form-425c-exhibits.md");
contains("docs/specs/gap-44-form-425c-exhibits.md", docs, [
  { pattern: /GAP-44/, label: "GAP-44 identifier" },
  { pattern: /28 U\.S\.C/, label: "trustee fee statute cited" },
]);

const blockReady = read(".block-ready/GAP-44.json");
contains(".block-ready/GAP-44.json", blockReady, [
  { pattern: /GAP-44/, label: "GAP-44 block id in manifest" },
  { pattern: /verify:form-425c-exhibits/, label: "verify gate in manifest" },
]);



if (failures.length > 0) {
  console.error("verify:form-425c-exhibits — FAILED");
  for (const entry of failures) {
    console.error(`  ✗ ${entry}`);
  }
  process.exit(1);
}

console.log("verify:form-425c-exhibits — OK");
