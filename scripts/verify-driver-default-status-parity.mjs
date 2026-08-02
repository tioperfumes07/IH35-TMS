#!/usr/bin/env node
/**
 * GUARD — DRIVER-DEFAULT-PARITY.
 *
 * THE DEFECT THIS ASSERTS AGAINST (live, USMCA, 2026-08-02): two drivers created under USMCA were
 * invisible in the Book Load driver-picker. Their entity scope was correct and the picker's
 * `status = 'Active'` gate was correct. They were `Probation` — because the FRONTEND create modal
 * defaults to "Probation" while the BACKEND create schema defaulted to "Active". The same action
 * produced a different status depending on which door it came through: a UI-created driver was
 * silently unassignable, an API/seed-created driver was dispatchable immediately.
 *
 * Owner ruling 2026-08-02: keep Probation (a brand-new driver must not be instantly dispatchable —
 * DOT/FMCSA-defensible), and make BOTH ends agree. The picker gate is correct and is NOT touched.
 *
 * WHAT IT ENFORCES: the frontend create modal and the backend create schema declare the SAME default
 * driver status. It does not care WHICH value, only that they cannot drift apart again — so a future
 * owner ruling can change the default in both places without editing this guard.
 */
import { readFileSync, existsSync } from "node:fs";

const LABEL = "verify:driver-default-status-parity";
const BACKEND = "apps/backend/src/mdata/drivers.routes.ts";
const FRONTEND = "apps/frontend/src/components/drivers/CreateDriverModal.tsx";

/** `status: driverStatusSchema.default("Probation")` */
const BACKEND_RE = /status:\s*driverStatusSchema\s*\.default\(\s*["']([A-Za-z]+)["']\s*\)/;
/** `status: z.enum([...]).default("Probation")` */
const FRONTEND_RE = /status:\s*z\s*\.enum\([^)]*\)\s*\.default\(\s*["']([A-Za-z]+)["']\s*\)/;

function analyse(files) {
  const problems = [];

  const be = files[BACKEND];
  const fe = files[FRONTEND];
  if (be == null) problems.push(`${BACKEND} is missing — cannot verify driver default parity.`);
  if (fe == null) problems.push(`${FRONTEND} is missing — cannot verify driver default parity.`);
  if (be == null || fe == null) return problems;

  const beM = BACKEND_RE.exec(be);
  const feM = FRONTEND_RE.exec(fe);

  if (!beM) {
    problems.push(
      `${BACKEND}: could not find \`status: driverStatusSchema.default("…")\` on the create schema. ` +
        `If the shape changed, update this guard deliberately — do not delete the assertion.`
    );
  }
  if (!feM) {
    problems.push(
      `${FRONTEND}: could not find \`status: z.enum([…]).default("…")\`. ` +
        `If the shape changed, update this guard deliberately — do not delete the assertion.`
    );
  }
  if (!beM || !feM) return problems;

  if (beM[1] !== feM[1]) {
    problems.push(
      `Driver create default DIVERGED: backend ${BACKEND} defaults to "${beM[1]}" but frontend ` +
        `${FRONTEND} defaults to "${feM[1]}". The same action must produce the same status through ` +
        `either door — this exact drift made UI-created drivers silently unassignable in dispatch ` +
        `(picker requires status='Active') while API-created ones dispatched fine.`
    );
  }

  return problems;
}

function readAll() {
  const out = {};
  for (const f of [BACKEND, FRONTEND]) out[f] = existsSync(f) ? readFileSync(f, "utf8") : null;
  return out;
}

function selftest() {
  const failures = [];
  const t = (label, cond) => {
    if (!cond) failures.push(label);
  };

  const be = (v) => `  status: driverStatusSchema.default("${v}"),`;
  const fe = (v) => `  status: z.enum(["Probation", "Active"]).default("${v}"),`;

  t("matching defaults pass", analyse({ [BACKEND]: be("Probation"), [FRONTEND]: fe("Probation") }).length === 0);
  t(
    "matching defaults pass at a DIFFERENT shared value (guard is value-agnostic)",
    analyse({ [BACKEND]: be("Active"), [FRONTEND]: fe("Active") }).length === 0
  );
  // The REAL pre-fix state: backend Active, frontend Probation.
  t(
    "pre-fix divergence (backend Active / frontend Probation) FAILS",
    analyse({ [BACKEND]: be("Active"), [FRONTEND]: fe("Probation") }).length === 1
  );
  t("reverse divergence FAILS", analyse({ [BACKEND]: be("Probation"), [FRONTEND]: fe("Inactive") }).length === 1);
  t("backend assertion removed FAILS", analyse({ [BACKEND]: "status: somethingElse,", [FRONTEND]: fe("Probation") }).length >= 1);
  t("frontend assertion removed FAILS", analyse({ [BACKEND]: be("Probation"), [FRONTEND]: "status: 'Probation'," }).length >= 1);
  t("missing file FAILS", analyse({ [BACKEND]: null, [FRONTEND]: fe("Probation") }).length >= 1);

  // Exit lives INSIDE selftest: verify-selftests-can-fail.mjs reads this body and treats
  // "collects failures but cannot exit non-zero" as the fake-green pattern — correctly, because an
  // unreachable failure path proves nothing.
  if (failures.length) {
    console.error(`${LABEL} SELFTEST FAILED:\n  - ${failures.join("\n  - ")}`);
    process.exit(1);
  }
  return failures;
}

if (process.argv.includes("--selftest")) {
  selftest();
  console.log(`${LABEL} selftest OK — 7 cases (2 pass-shapes, 5 fail-shapes)`);
  process.exit(0);
}

const problems = analyse(readAll());
if (problems.length) {
  console.error(`${LABEL} FAILED:\n  - ${problems.join("\n  - ")}`);
  process.exit(1);
}
console.log(`${LABEL} OK — UI and API declare the same default driver status`);
