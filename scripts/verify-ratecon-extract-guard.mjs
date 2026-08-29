#!/usr/bin/env node
// verify-ratecon-extract-guard.mjs — RATECON-1 safety guard. Enforces three invariants:
//  1. Kill-switch: the extraction endpoint consults RATECON_EXTRACT_ENABLED and 409s BEFORE any AI call
//     (no Anthropic spend, no behavior, while the flag is OFF).
//  2. Single key path: ANTHROPIC_API_KEY appears ONLY in the shared ai/anthropic-messages client (+ its test).
//  3. Untrusted-document safety: the rate-con extraction never enables tools on the model call (the PDF is
//     third-party content treated as data; tools would let an injected instruction act).
//  4. Error visibility (RATECON-3): the endpoint captures exceptions to Sentry on its error path, so an
//     upstream AI failure (e.g. a retired model) can never again be a silent 500 with zero Sentry events.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const read = (p) => { try { return fs.readFileSync(path.join(ROOT, p), "utf8"); } catch { return ""; } };
const errs = [];

function extractionPersistenceErrors(source) {
  const failures = [];
  if (!/const extractionId = rec\.rows\[0\]\?\.id;[\s\S]{0,100}if \(!extractionId\) throw new Error\("ratecon_extraction_create_failed"\);[\s\S]{0,160}extraction_id: extractionId/.test(source)) {
    failures.push("rate-con extraction must require its canonical audit-row identity before success");
  }
  if (!/msg === "ratecon_extraction_create_failed"[\s\S]{0,180}status: 503[\s\S]{0,160}error: "extraction_persistence_failed"[\s\S]{0,160}capture: true/.test(source)) {
    failures.push("missing extraction identity must be a captured, typed persistence failure");
  }
  return failures;
}

// (1) flag-before-AI in the endpoint
const routes = read("apps/backend/src/dispatch/ratecon-extract.routes.ts");
if (!routes) errs.push("missing ratecon-extract.routes.ts");
else {
  if (!/RATECON_EXTRACT_ENABLED|RATECON_EXTRACT_FLAG_KEY/.test(routes)) errs.push("endpoint must consult the RATECON_EXTRACT_ENABLED flag");
  if (!/code\(409\)/.test(routes)) errs.push("endpoint must 409 when the flag is OFF");
  const flagIdx = routes.search(/isEnabled\s*\(/);
  const callIdx = routes.search(/extractRateConPdf\s*\(/);
  const readIdx = routes.search(/getObjectBytes\s*\(/);
  if (flagIdx === -1 || callIdx === -1) errs.push("endpoint must both flag-gate (isEnabled) and call extractRateConPdf");
  else if (flagIdx > callIdx || (readIdx !== -1 && flagIdx > readIdx)) errs.push("the flag check must precede reading the PDF and calling the extractor");

  // (4) Sentry capture on the error path (RATECON-3 — no more silent 5xx)
  if (!/from ["']@sentry\/node["']/.test(routes) || !/Sentry\.captureException\s*\(/.test(routes))
    errs.push("endpoint must capture exceptions to Sentry on its error path (import * as Sentry from '@sentry/node' + Sentry.captureException)");
  errs.push(...extractionPersistenceErrors(routes));
  if (process.argv.includes("--selftest")) {
    const persistenceMutations = [
      routes.replace('if (!extractionId) throw new Error("ratecon_extraction_create_failed");', ""),
      routes.replace("extraction_id: extractionId", "extraction_id: rec.rows[0].id"),
      routes.replace('error: "extraction_persistence_failed"', 'error: "internal_error"'),
    ];
    for (const [index, mutation] of persistenceMutations.entries()) {
      if (extractionPersistenceErrors(mutation).length === 0) errs.push(`persistence selftest mutation ${index + 1} survived`);
    }
  }
}

// (2) single ANTHROPIC_API_KEY path
const SRC = path.join(ROOT, "apps/backend/src");
const offenders = [];
const walk = (dir) => {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const fp = path.join(dir, e.name);
    if (e.isDirectory()) walk(fp);
    else if (/\.(ts|mjs|js)$/.test(e.name)) {
      const rel = path.relative(ROOT, fp).replace(/\\/g, "/");
      if (rel === "apps/backend/src/ai/anthropic-messages.ts") continue;
      // Test files legitimately set/unset ANTHROPIC_API_KEY to exercise the not-configured path — not a key handler.
      if (/(\.test\.|\.spec\.)|(^|\/)__tests__\//.test(rel)) continue;
      if (fs.readFileSync(fp, "utf8").includes("ANTHROPIC_API_KEY")) offenders.push(rel);
    }
  }
};
if (fs.existsSync(SRC)) walk(SRC);
if (offenders.length) errs.push(`ANTHROPIC_API_KEY referenced outside the shared client: ${offenders.join(", ")}`);

// (3) no tools on the untrusted-document call
const svc = read("apps/backend/src/dispatch/ratecon-extract.service.ts");
if (svc && /\btools\s*:/.test(svc)) errs.push("ratecon-extract.service must NOT enable tools on the model call (untrusted document)");

// (5) RATECON-2 — single rate-con intake flow. The drag-drop zone must ride the ONE shared extraction
//     hook (no dead upload stub, no fake "done" progress state). The shared hook is the only place the
//     upload→extract→prefill logic lives.
const HOOK = "apps/frontend/src/pages/dispatch/components/book-load-v4/useRateConExtraction.ts";
const DROPZONE = "apps/frontend/src/pages/dispatch/components/book-load-v4/OcrDropZone.tsx";
const hook = read(HOOK);
const dz = read(DROPZONE);
function extractionLifecycleErrors(source) {
  const lifecycleErrors = [];
  if (!/const submittedGeneration = scopeGenerationRef\.current/.test(source) || !/const submittedCompanyId = operatingCompanyId/.test(source))
    lifecycleErrors.push("useRateConExtraction must snapshot company and generation for each intake");
  if ((source.match(/if \(!isCurrent\(\)\) return;/g) ?? []).length < 5)
    lifecycleErrors.push("useRateConExtraction must suppress stale completion between every upload/extract stage");
  if (!/activeGenerationRef\.current === submittedGeneration\) return/.test(source))
    lifecycleErrors.push("useRateConExtraction must refuse concurrent intake at the shared hook boundary");
  return lifecycleErrors;
}
if (!hook) errs.push(`missing shared extraction hook ${HOOK}`);
else if (!/extractRateCon\s*\(/.test(hook)) errs.push("useRateConExtraction must call the real extractRateCon endpoint");
else {
  errs.push(...extractionLifecycleErrors(hook));
  if (process.argv.includes("--selftest")) {
    const mutations = [
      hook.replace("const submittedCompanyId = operatingCompanyId", "const submittedCompanyId = currentCompanyId"),
      hook.replace("if (!isCurrent()) return;", ""),
      hook.replace("if (activeGenerationRef.current === submittedGeneration) return;", ""),
    ];
    for (const [index, mutation] of mutations.entries()) {
      if (extractionLifecycleErrors(mutation).length === 0) errs.push(`selftest mutation ${index + 1} survived`);
    }
  }
}
if (!dz) errs.push(`missing ${DROPZONE}`);
else {
  if (!/from\s+["']\.\/useRateConExtraction["']/.test(dz)) errs.push("OcrDropZone must import the shared useRateConExtraction hook (one intake code path)");
  // A "done" phase must never render fake progress — it may only exist alongside the real hook (which
  // owns the extractRateCon call). The dead pre-RATECON stub (cycle language + loads/ocr-upload) is banned.
  if (/["']done["']/.test(dz) && !/from\s+["']\.\/useRateConExtraction["']/.test(dz))
    errs.push("OcrDropZone references a 'done' phase without importing the extraction hook (fake progress state)");
  if (/cycle\s+\d/i.test(dz) || /OCR parsing in cycle/i.test(dz)) errs.push("OcrDropZone must not contain the retired 'OCR parsing in cycle' stub copy");
  if (/dispatch\/loads\/ocr-upload/.test(dz)) errs.push("OcrDropZone must not call the dead loads/ocr-upload stub endpoint — use the shared extraction hook");
}

if (errs.length) {
  console.error("verify:ratecon-extract-guard — FAILED");
  for (const e of errs) console.error(`  ✗ ${e}`);
  process.exit(1);
}
console.log(`[ratecon-extract-guard] OK — flag-before-AI, single key path, no tools on untrusted document${process.argv.includes("--selftest") ? ", 6/6 mutations caught" : ""}.`);
