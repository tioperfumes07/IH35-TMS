#!/usr/bin/env node
/** FACT-S03 — /factoring/batches wizard + detail drill entity-scoped. */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = "verify-fact-s03-batches-surface";
const SELFTEST = process.argv.includes("--selftest");
const WIZARD = "apps/frontend/src/pages/factoring/BatchWizard.tsx";
const DETAIL = "apps/frontend/src/pages/factoring/BatchDetail.tsx";
const MANIFEST = "apps/frontend/src/routes/manifest.tsx";

// Cursor's V3 BoardSection fill (#27754/#27757) moved these markers onto <BoardSection testId="…">, which renders
// data-testid={testId} on its <section>. Either spelling is the same rendered marker; nothing else counts.
function hasTestId(src, id) {
  return src.includes(`data-testid="${id}"`) || new RegExp(`<BoardSection\\b[^>]*\\btestId="${id}"`).test(src);
}

function read(rel) {
  return fs.readFileSync(path.join(ROOT, rel), "utf8");
}

function assertLive(wizardOverride) {
  const problems = [];
  const wizard = wizardOverride ?? read(WIZARD);
  const detail = read(DETAIL);
  const manifest = read(MANIFEST);
  if (!/path="\/factoring\/batches\/new"/.test(manifest)) problems.push("batches/new route missing");
  if (!/path="\/factoring\/batches\/:id"/.test(manifest)) problems.push("batches/:id route missing");
  if (!hasTestId(wizard, "factoring-batches-need-company")) problems.push("wizard need-company");
  if (!hasTestId(wizard, "factoring-batches-honest-empty")) problems.push("wizard honest empty");
  if (!wizard.includes("ListErrorBanner")) problems.push("wizard ListErrorBanner");
  if (!wizard.includes("enabled: Boolean(companyId)")) problems.push("wizard not company-gated");
  if (!detail.includes("enabled: Boolean(batchId && companyId)")) problems.push("detail not company-gated");
  if (!detail.includes("ListErrorState")) problems.push("detail ListErrorState");
  return problems;
}

if (SELFTEST) {
  const live = assertLive();
  if (live.length) {
    console.error(`${LABEL} SELFTEST FAILED live: ${live.join(" | ")}`);
    process.exit(1);
  }
  const pagePath = path.join(ROOT, WIZARD);
  const orig = fs.readFileSync(pagePath, "utf8");
  const planted = orig.replace(/data-testid="factoring-batches-honest-empty"/, 'data-testid="x"');
  {
    if (!assertLive(planted).length) {
      console.error(`${LABEL} SELFTEST FAILED: planted defect not caught`);
      process.exit(1);
    }
  }
  {
    // Planted: the need-company state loses its marker (either spelling) — the select-a-company state is gone.
    const srcNc = read(WIZARD);
    const strip = (t) => t.split('data-testid="factoring-batches-need-company"').join('data-testid="x"').split('testId="factoring-batches-need-company"').join('testId="x"');
    if (strip(srcNc) === srcNc || hasTestId(strip(srcNc), "factoring-batches-need-company")) {
      console.error(`${LABEL} SELFTEST FAILED: need-company plant was inert`);
      process.exit(1);
    }
  }
  console.log(`${LABEL} SELFTEST PASS`);
  process.exit(0);
}

const problems = assertLive();
if (problems.length) {
  console.error(`${LABEL} FAILED:`);
  for (const p of problems) console.error(`  ${p}`);
  process.exit(1);
}
console.log(`${LABEL} OK`);
