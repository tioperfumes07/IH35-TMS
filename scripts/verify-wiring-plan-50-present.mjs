#!/usr/bin/env node
/**
 * verify-wiring-plan-50-present.mjs
 *
 * Ratchet: the 50-task wiring plan + H-track amendment must live in-repo so coders
 * cannot ignore Desktop-only docs. Fails if the plan file is missing or stripped of
 * owner-amendment markers (entity-scope header + Historical Reconcile Track).
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = "verify-wiring-plan-50-present";
const SELFTEST = process.argv.includes("--selftest");

const PLAN = "docs/specs/scoreboard/WIRING-PLAN-50-TASKS-LOCKED.md";
const START = "docs/specs/scoreboard/CODER-START-HERE-LOCKED.md";
const WIRE_SPRINT = "docs/specs/scoreboard/wire-sprint-built.json";
const MATRIX_SERVICE = "apps/backend/src/program/module-matrix.service.ts";

const PLAN_MARKERS = [
  "Historical Reconcile Track",
  "CODE FIX",
  "ALL ENTITIES",
  "NOT company done",
  "H-5",
  "47 OF 50",
];

const START_MARKERS = ["WIRING-PLAN-50-TASKS-LOCKED.md", "verify-wiring-plan-50-present"];

function fail(msg, problems = []) {
  console.error(`${LABEL} FAIL — ${msg}`);
  for (const p of problems) console.error(`  - ${p}`);
  process.exit(1);
}

export function collectWiringPlanProblems(root = ROOT) {
  const problems = [];
  const planAbs = path.join(root, PLAN);
  const startAbs = path.join(root, START);

  if (!fs.existsSync(planAbs)) problems.push(`MISSING ${PLAN}`);
  if (!fs.existsSync(startAbs)) problems.push(`MISSING ${START}`);

  if (fs.existsSync(planAbs)) {
    const body = fs.readFileSync(planAbs, "utf8");
    for (const m of PLAN_MARKERS) {
      if (!body.includes(m)) problems.push(`PLAN missing marker: ${m}`);
    }
    if (!/\|\s*\*\*H-5\*\*/.test(body)) problems.push("PLAN missing H-5 row");
  }

  if (fs.existsSync(startAbs)) {
    const body = fs.readFileSync(startAbs, "utf8");
    for (const m of START_MARKERS) {
      if (!body.includes(m)) problems.push(`START missing pointer: ${m}`);
    }
  }

  const wireAbs = path.join(root, WIRE_SPRINT);
  if (!fs.existsSync(wireAbs)) {
    problems.push(`MISSING ${WIRE_SPRINT} (H-3 matrix Built feed)`);
  } else {
    try {
      const wire = JSON.parse(fs.readFileSync(wireAbs, "utf8"));
      const tasks = new Set((wire.entries ?? []).map((e) => e.task));
      for (const t of ["P38", "P37", "P41"]) {
        if (!tasks.has(t)) problems.push(`${WIRE_SPRINT} missing shipped task ${t}`);
      }
    } catch {
      problems.push(`${WIRE_SPRINT} invalid JSON`);
    }
  }

  const matrixAbs = path.join(root, MATRIX_SERVICE);
  if (fs.existsSync(matrixAbs)) {
    const body = fs.readFileSync(matrixAbs, "utf8");
    if (!body.includes("wireSprintBuiltReason")) {
      problems.push(`${MATRIX_SERVICE} missing wireSprintBuiltReason (H-3 Built feed)`);
    }
    if (/function leafColumnBuiltReason\([\s\S]*?\n\}/.test(body)) {
      const fn = body.match(/function leafColumnBuiltReason\([\s\S]*?\n\}/)?.[0] ?? "";
      if (fn.includes("probeDoneReason")) {
        problems.push(
          `${MATRIX_SERVICE} leafColumnBuiltReason must not call probeDoneReason (probes → Audited only)`,
        );
      }
    }
    if (!body.includes("probe-hold (Audited only, not Built)")) {
      problems.push(`${MATRIX_SERVICE} missing probe→Audited-only honesty marker`);
    }
  } else {
    problems.push(`MISSING ${MATRIX_SERVICE}`);
  }

  return problems;
}

export function assertWiringPlanPresent(root = ROOT) {
  const problems = collectWiringPlanProblems(root);
  if (problems.length) fail("wiring plan lock incomplete", problems);
  return true;
}

if (SELFTEST) {
  const tmp = fs.mkdtempSync(path.join(ROOT, ".tmp-wiring-plan-"));
  try {
    fs.mkdirSync(path.join(tmp, "docs/specs/scoreboard"), { recursive: true });
    fs.mkdirSync(path.join(tmp, "apps/backend/src/program"), { recursive: true });
    fs.writeFileSync(path.join(tmp, PLAN), "stub without markers\n");
    fs.writeFileSync(path.join(tmp, START), "WIRING-PLAN-50-TASKS-LOCKED.md\nverify-wiring-plan-50-present\n");
    if (collectWiringPlanProblems(tmp).length === 0) fail("--selftest expected missing-marker failure");
    fs.writeFileSync(
      path.join(tmp, PLAN),
      `${PLAN_MARKERS.join("\n")}\n| **H-5** | CC-1 |\n`,
    );
    fs.writeFileSync(
      path.join(tmp, WIRE_SPRINT),
      JSON.stringify({ entries: [{ task: "P38" }, { task: "P37" }, { task: "P41" }] }),
    );
    fs.writeFileSync(
      path.join(tmp, MATRIX_SERVICE),
      "function wireSprintBuiltReason() {}\nfunction leafColumnBuiltReason() {}\nprobe-hold (Audited only, not Built)\n",
    );
    assertWiringPlanPresent(tmp);
    console.log(`${LABEL} --selftest PASS`);
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
} else {
  assertWiringPlanPresent();
  console.log(`${LABEL} PASS`);
}
