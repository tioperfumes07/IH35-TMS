#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const src = fs.readFileSync(
  path.join(ROOT, "apps/backend/src/border-crossing/emanifest-pdf-renderer.service.ts"),
  "utf8"
);
const routes = fs.readFileSync(
  path.join(ROOT, "apps/backend/src/border-crossing/border-crossing-wizard.routes.ts"),
  "utf8"
);
const wizard = fs.readFileSync(
  path.join(ROOT, "apps/frontend/src/pages/dispatch/BorderCrossingWizardPage.tsx"),
  "utf8"
);
const history = fs.readFileSync(
  path.join(ROOT, "apps/frontend/src/pages/dispatch/BorderCrossingHistoryPage.tsx"),
  "utf8"
);

function problemsFor(renderer, routeSource, wizardSource, historySource) {
  const problems = [];
  if (!renderer.includes("puppeteer") || !renderer.includes("page.pdf")) {
    problems.push("puppeteer page.pdf pattern missing");
  }
  if (!routeSource.includes("emanifest.pdf")) problems.push("emanifest.pdf route missing");
  for (const [surface, source] of [["wizard", wizardSource], ["history", historySource]]) {
    if (!/resolveApiUrl\(`\/api\/v1\/border-crossing\/\$\{[^}]+\}\/emanifest\.pdf\?operating_company_id=/.test(source)) {
      problems.push(`${surface} eManifest PDF must resolve against the canonical API origin`);
    }
  }
  return problems;
}

const problems = problemsFor(src, routes, wizard, history);
if (problems.length) {
  console.error(`verify:border-crossing-emanifest-pdf-puppeteer FAIL:\n- ${problems.join("\n- ")}`);
  process.exit(1);
}

if (process.argv.includes("--selftest")) {
  const oldRelative = wizard.replace("resolveApiUrl(`/api/v1/border-crossing/", "`/api/v1/border-crossing/").replace("}`)\n", "}`\n");
  const planted = problemsFor(src, routes, oldRelative, history);
  if (!planted.some((problem) => problem.includes("wizard eManifest PDF"))) {
    console.error("verify:border-crossing-emanifest-pdf-puppeteer SELFTEST FAIL: planted SPA-origin URL escaped");
    process.exit(1);
  }
  console.log("verify:border-crossing-emanifest-pdf-puppeteer SELFTEST PASS");
}

console.log("verify:border-crossing-emanifest-pdf-puppeteer PASS");
