#!/usr/bin/env node
/**
 * WO-CANCEL-REASON-NO-CREATE-ROUTE — the WO cancel modal's reason picker
 * (catalogs.wo_cancellation_reasons) is genuinely catalog-backed but both consumers used a bare
 * shared/Combobox with no create affordance, because the backend route was GET-only (no POST).
 *
 * Fix (this guard locks it): a real POST /api/v1/catalogs/wo-cancellation-reasons route exists
 * (apps/backend/src/catalogs/wo-cancellation-reasons.routes.ts), a createWoCancellationReason
 * client wraps it (apps/frontend/src/api/workOrdersConsole.ts), and both frontend consumers wire
 * the Combobox's own allowAddNew/onAddNew to it — NOT the registry/ReferenceSelect inline-create
 * flow, because catalogs.wo_cancellation_reasons is a deliberately GLOBAL catalog (no
 * operating_company_id, migration 202606221200), and that flow assumes entity scoping.
 *
 * FAIL: the backend route has no POST handler, OR either consumer's Combobox is missing
 * allowAddNew/onAddNew wired to createWoCancellationReason.
 * PASS: all three hold.
 *
 * Self-test: node scripts/verify-wo-cancellation-reason-picker-law.mjs --selftest
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = "verify-wo-cancellation-reason-picker-law";

const FILES = {
  route: "apps/backend/src/catalogs/wo-cancellation-reasons.routes.ts",
  api: "apps/frontend/src/api/workOrdersConsole.ts",
  woDetail: "apps/frontend/src/pages/maintenance/WorkOrderDetailPage.tsx",
  consoleDetail: "apps/frontend/src/pages/work-orders/WorkOrdersConsoleDetailPage.tsx",
};

function read(rel) {
  return fs.readFileSync(path.join(ROOT, rel), "utf8");
}

function assert(cond, msg, out) {
  if (!cond) out.push(msg);
}

function comboboxBlock(source, needle) {
  const idx = source.indexOf(needle);
  if (idx === -1) return "";
  return source.slice(idx, idx + 400);
}

function failures(sources) {
  const out = [];

  const route = sources[FILES.route];
  assert(
    /app\.post\(\s*"\/api\/v1\/catalogs\/wo-cancellation-reasons"/.test(route),
    `${FILES.route}: missing POST /api/v1/catalogs/wo-cancellation-reasons handler`,
    out
  );

  const api = sources[FILES.api];
  assert(
    /export async function createWoCancellationReason/.test(api),
    `${FILES.api}: missing createWoCancellationReason export`,
    out
  );
  assert(
    /method:\s*"POST"/.test(api.slice(api.indexOf("createWoCancellationReason"))),
    `${FILES.api}: createWoCancellationReason must POST`,
    out
  );

  for (const key of ["woDetail", "consoleDetail"]) {
    const src = sources[FILES[key]];
    const block = comboboxBlock(src, 'placeholder="Select a cancellation reason…"');
    assert(block.length > 0, `${FILES[key]}: cancellation reason Combobox anchor not found — file shape changed`, out);
    assert(/allowAddNew/.test(block), `${FILES[key]}: cancellation reason Combobox missing allowAddNew`, out);
    assert(/onAddNew=/.test(block), `${FILES[key]}: cancellation reason Combobox missing onAddNew`, out);
    assert(
      /createWoReasonMut\.mutate/.test(block) || /createWoCancellationReason/.test(src),
      `${FILES[key]}: onAddNew does not route to createWoCancellationReason`,
      out
    );
  }

  return out;
}

const live = Object.fromEntries(Object.values(FILES).map((rel) => [rel, read(rel)]));

if (process.argv.includes("--selftest")) {
  const mutations = [
    {
      name: "backend POST handler removed",
      file: FILES.route,
      mutate: (t) => t.replace('app.post("/api/v1/catalogs/wo-cancellation-reasons"', 'app.get("/api/v1/catalogs/wo-cancellation-reasons-disabled"'),
    },
    {
      name: "createWoCancellationReason export removed",
      file: FILES.api,
      mutate: (t) => t.replace("export async function createWoCancellationReason", "async function _disabledCreateWoCancellationReason"),
    },
    {
      name: "WorkOrderDetailPage loses allowAddNew",
      file: FILES.woDetail,
      mutate: (t) => t.replace(/allowAddNew\n\s+onAddNew=\{\(typedText\) => \{\n\s+const label = typedText\.trim\(\);\n\s+if \(label\) createWoReasonMut\.mutate\(label\);\n\s+\}\}\n/, ""),
    },
    {
      name: "WorkOrdersConsoleDetailPage loses onAddNew",
      file: FILES.consoleDetail,
      mutate: (t) => t.replace(/onAddNew=\{\(typedText\) => \{\n\s+const label = typedText\.trim\(\);\n\s+if \(label\) createWoReasonMut\.mutate\(label\);\n\s+\}\}\n/, ""),
    },
  ];
  const escaped = [];
  for (const { name, file, mutate } of mutations) {
    const mutated = mutate(live[file]);
    if (mutated === live[file]) {
      escaped.push(`${name}: mutation anchor missing`);
      continue;
    }
    const mutant = { ...live, [file]: mutated };
    if (failures(mutant).length === 0) escaped.push(`${name}: planted defect escaped`);
  }
  if (escaped.length) {
    console.error(`${LABEL} SELFTEST FAIL\n${escaped.join("\n")}`);
    process.exit(1);
  }
  console.log(`${LABEL} SELFTEST PASS — ${mutations.length}/${mutations.length} planted defects rejected`);
  process.exit(0);
}

const missing = failures(live);
if (missing.length) {
  console.error(`${LABEL} FAIL\n${missing.map((f) => ` - ${f}`).join("\n")}`);
  process.exit(1);
}
console.log(`${LABEL} PASS — WO cancellation reason picker has a real create endpoint and both consumers wire allowAddNew/onAddNew to it`);
