#!/usr/bin/env node
/**
 * GUARD: Create WO requires Section-A "Part # / Task" (description) before submit.
 * Backend sectionALineSchema already enforces description.min(1); blank used to 400
 * with a misleading header Zod dump. Frontend must gate + toast + disable Create.
 */
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const ROOT = new URL("..", import.meta.url).pathname.replace(/\/$/, "");
const MODAL = join(ROOT, "apps/frontend/src/pages/maintenance/components/CreateWorkOrderModal.tsx");
const BOX = join(ROOT, "apps/frontend/src/components/forms/shared/CostBreakdownBox.tsx");
const strip = (s) => s.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/\/\/[^\n]*/g, " ");
const LABEL = "verify-wo-create-part-task-required";

export function run() {
  const modal = strip(readFileSync(MODAL, "utf8"));
  const box = strip(readFileSync(BOX, "utf8"));
  const checks = [
    ["section-a-trim", /description:\s*String\(line\.description \?\? ""\)\.trim\(\)/.test(modal)],
    ["part-task-ok", /sectionAPartTaskOk/.test(modal)],
    ["part-task-check-label", /Part # \/ Task required on every Section A cost line/.test(modal)],
    ["presave-gate", /preSaveChecksOk/.test(modal)],
    ["submit-toast-gate", /if\s*\(\s*!preSaveChecksOk\s*\)/.test(modal)],
    ["create-btn-disabled", /disabled=\{\s*\n?\s*!preSaveChecksOk/.test(modal) || /disabled=\{\s*!preSaveChecksOk/.test(modal)],
    ["box-required-wo", /required=\{variant === "wo"\}/.test(box)],
    ["box-testid", /data-testid=\{variant === "wo" \? "wo-section-a-part-task"/.test(box)],
  ];
  const failed = checks.filter(([, ok]) => !ok).map(([id]) => id);
  return {
    ok: failed.length === 0,
    failed,
    message:
      failed.length === 0
        ? `PASS: WO Part # / Task pre-submit gate (${checks.length}/${checks.length}).`
        : `FAIL: ${failed.join(", ")}`,
  };
}

function selftest() {
  const original = readFileSync(MODAL, "utf8");
  if (!run().ok) {
    console.error(`${LABEL} SELFTEST FAIL: already red — ${run().message}`);
    process.exit(1);
  }
  try {
    writeFileSync(
      MODAL,
      original.replace("Part # / Task required on every Section A cost line", "cost line description optional"),
      "utf8",
    );
    const caught = run();
    if (caught.ok || !caught.failed.includes("part-task-check-label")) {
      console.error(`${LABEL} SELFTEST FAIL: not caught`, caught);
      process.exit(1);
    }
  } finally {
    writeFileSync(MODAL, original, "utf8");
  }
  console.log(`${LABEL} SELFTEST OK`);
}

if (process.argv.includes("--selftest")) selftest();
else {
  const r = run();
  console.log(r.message);
  if (!r.ok) process.exit(1);
}
