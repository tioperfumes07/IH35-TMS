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
const step6 = fs.readFileSync(
  path.join(ROOT, "apps/frontend/src/components/border-crossing/WizardStep6.tsx"),
  "utf8"
);

function problemsFor(renderer, routeSource, wizardSource, historySource, step6Source) {
  const problems = [];
  if (!renderer.includes("puppeteer") || !renderer.includes("page.pdf")) {
    problems.push("puppeteer page.pdf pattern missing");
  }
  if (!routeSource.includes("emanifest.pdf")) problems.push("emanifest.pdf route missing");
  if (!routeSource.includes("persistEmanifestForLoad")) {
    problems.push("wizard must persist the generated eManifest for its linked load");
  }
  if (!routeSource.includes("INSERT INTO docs.files")) {
    problems.push("generated eManifest must use the canonical docs.files store");
  }
  if (!/INSERT INTO docs\.file_links[\s\S]{0,240}["']load["']/.test(routeSource)) {
    problems.push("generated eManifest must have a canonical load reverse link");
  }
  if (!routeSource.includes("putObjectBytes") || !routeSource.includes("deleteObjectBytes")) {
    problems.push("generated eManifest object storage must upload and compensate on database failure");
  }
  if (!/data\.load_id[\s\S]{0,160}persistEmanifestForLoad/.test(routeSource)) {
    problems.push("wizard completion must persist the eManifest when a load is linked");
  }
  for (const [surface, source] of [["wizard", wizardSource], ["history", historySource]]) {
    if (!/resolveApiUrl\(`\/api\/v1\/border-crossing\/\$\{[^}]+\}\/emanifest\.pdf\?operating_company_id=/.test(source)) {
      problems.push(`${surface} eManifest PDF must resolve against the canonical API origin`);
    }
  }
  if (!/<WizardStep6[\s\S]{0,160}pdfUrl=\{pdfUrl\}/.test(wizardSource)) {
    problems.push("wizard must pass the canonical PDF URL into Step 6");
  }
  if (!/href=\{pdfUrl\}/.test(step6Source) || !/data-testid="border-wizard-generate-emanifest-pdf"/.test(step6Source)) {
    problems.push("Step 6 must render an explicit action that calls the eManifest PDF endpoint");
  }
  return problems;
}

const problems = problemsFor(src, routes, wizard, history, step6);
if (problems.length) {
  console.error(`verify:border-crossing-emanifest-pdf-puppeteer FAIL:\n- ${problems.join("\n- ")}`);
  process.exit(1);
}

if (process.argv.includes("--selftest")) {
  const oldRelative = wizard.replace("resolveApiUrl(`/api/v1/border-crossing/", "`/api/v1/border-crossing/").replace("}`)\n", "}`\n");
  const planted = problemsFor(src, routes, oldRelative, history, step6);
  if (!planted.some((problem) => problem.includes("wizard eManifest PDF"))) {
    console.error("verify:border-crossing-emanifest-pdf-puppeteer SELFTEST FAIL: planted SPA-origin URL escaped");
    process.exit(1);
  }
  const deadProp = wizard.replace(" pdfUrl={pdfUrl}", "");
  const deadAction = step6.replace("href={pdfUrl}", "href=\"#\"");
  const propProblems = problemsFor(src, routes, deadProp, history, step6);
  const actionProblems = problemsFor(src, routes, wizard, history, deadAction);
  if (!propProblems.some((problem) => problem.includes("pass the canonical PDF URL"))) {
    console.error("verify:border-crossing-emanifest-pdf-puppeteer SELFTEST FAIL: dead Step 6 prop escaped");
    process.exit(1);
  }
  if (!actionProblems.some((problem) => problem.includes("explicit action"))) {
    console.error("verify:border-crossing-emanifest-pdf-puppeteer SELFTEST FAIL: dead Step 6 action escaped");
    process.exit(1);
  }
  const noPersistenceCall = routes.replace(/await persistEmanifestForLoad\([\s\S]*?\n\s*\);/, "");
  const persistenceProblems = problemsFor(src, noPersistenceCall, wizard, history, step6);
  if (!persistenceProblems.some((problem) => problem.includes("wizard completion must persist"))) {
    console.error("verify:border-crossing-emanifest-pdf-puppeteer SELFTEST FAIL: missing automatic persistence escaped");
    process.exit(1);
  }
  const noLoadLink = routes.replace("'load'", "'crossing'");
  const linkProblems = problemsFor(src, noLoadLink, wizard, history, step6);
  if (!linkProblems.some((problem) => problem.includes("canonical load reverse link"))) {
    console.error("verify:border-crossing-emanifest-pdf-puppeteer SELFTEST FAIL: missing load link escaped");
    process.exit(1);
  }
  console.log("verify:border-crossing-emanifest-pdf-puppeteer SELFTEST PASS — 5/5 planted defects rejected");
}

console.log("verify:border-crossing-emanifest-pdf-puppeteer PASS");
