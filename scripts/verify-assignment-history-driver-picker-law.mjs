#!/usr/bin/env node
/**
 * Assignment History keeps its canonical driver-create workflow while its filter
 * accepts multiple drivers. Creation is a separate action, not a filter side effect.
 *
 * Self-test: node scripts/verify-assignment-history-driver-picker-law.mjs --selftest
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { multiSelectFilterProblems, selftestMultiSelectFilterContract } from "./lib/entity-multiselect-filter-contract.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = "verify-assignment-history-driver-picker-law";
const PAGE = path.join(ROOT, "apps/frontend/src/pages/dispatch/AssignmentHistoryPage.tsx");

function assert(cond, msg) {
  if (!cond) throw new Error(`${LABEL}: ${msg}`);
}

function check(src = fs.readFileSync(PAGE, "utf8")) {
  assert(multiSelectFilterProblems(src, { file: "apps/frontend/src/pages/dispatch/AssignmentHistoryPage.tsx", kind: "driver" }).length === 0, "canonical scoped multi-driver filter must forward every selected ID");
  assert(src.includes('import { CreateDriverModal } from "../../components/drivers/CreateDriverModal"'), "must import the canonical driver creator");
  assert(/onClick=\{\(\) => setCreateDriverOpen\(true\)\}/.test(src), "create action must open the driver creator");
  assert(/<CreateDriverModal\s+open=\{createDriverOpen\}\s+companyId=\{companyId\}/.test(src), "canonical creator must receive open state and company scope");
  assert(src.includes('onClose={() => setCreateDriverOpen(false)}'), "creator must close");
  assert(src.includes('queryKey: ["entity-multi-select", companyId, "driver"]'), "created driver must refresh the scoped filter roster");
}

function selftest() {
  const original = fs.readFileSync(PAGE, "utf8");
  selftestMultiSelectFilterContract();
  for (const [from, to] of [
    ['kind="driver"', 'kind="unit"'],
    ['setCreateDriverOpen(true)', 'setCreateDriverOpen(false)'],
    ['companyId={companyId}', 'companyId={""}'],
    ['<CreateDriverModal', '<div'],
    ['onClose={() => setCreateDriverOpen(false)}', 'onClose={() => undefined}'],
    ['queryKey: ["entity-multi-select", companyId, "driver"]', 'queryKey: ["other"]'],
  ]) {
    assert(original.includes(from), `plant must change source: ${from}`);
    let failed = false;
    try { check(original.replaceAll(from, to)); } catch { failed = true; }
    assert(failed, `planted defect survived: ${from}`);
  }
  check();
  console.log(`${LABEL}: OK — selftest PASS`);
}

const mode = process.argv.includes("--selftest") ? "selftest" : "check";
try {
  if (mode === "selftest") selftest();
  else {
    check();
    console.log(`${LABEL}: OK`);
  }
} catch (e) {
  console.error(String(e?.message || e));
  process.exit(1);
}
