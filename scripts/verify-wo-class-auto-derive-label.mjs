#!/usr/bin/env node
/**
 * GUARD: WO Class (auto) must show {UNIT}-{LASTNAME}, never unit_id/driver_id UUIDs (AUDIT-611).
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";

const ROOT = new URL("..", import.meta.url).pathname.replace(/\/$/, "");
const ID = join(ROOT, "apps/frontend/src/pages/maintenance/components/CreateWOSectionIdentification.tsx");
const MODAL = join(ROOT, "apps/frontend/src/pages/maintenance/components/CreateWorkOrderModal.tsx");
const strip = (s) => s.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/\/\/[^\n]*/g, " ");
const LABEL = "verify-wo-class-auto-derive-label";

export function run(modalOverride) {
  const id = strip(readFileSync(ID, "utf8"));
  const modal = strip(modalOverride !== undefined ? modalOverride : readFileSync(MODAL, "utf8"));
  const checks = [
    ["helper-exported", /export function deriveWoClassHintLabel/.test(id)],
    ["sets-class-hint", /setValue\("class_hint", next/.test(id)],
    ["uses-unit-display", /unitDisplayId:\s*(unitRow\?\.unit_display_id|unitDisplay)/.test(id)],
    [
      "uses-driver-last",
      /driverLastName:\s*(driverRow\?\.last_name|selectedDriverQuery\.data\?\.last_name)/.test(id),
    ],
    ["testid", /data-testid="wo-class-auto-derive"/.test(id)],
    [
      "no-uuid-fallback-modal",
      !/form\.watch\("unit_id"\).*form\.watch\("driver_id"\)/.test(modal),
    ],
    ["safe-fallback", /classHint = form\.watch\("class_hint"\) \|\| "UNIT-UNASSIGNED"/.test(modal)],
  ];
  const failed = checks.filter(([, ok]) => !ok).map(([n]) => n);
  return {
    ok: failed.length === 0,
    failed,
    message:
      failed.length === 0
        ? `PASS: WO class auto-derive uses UNIT-LASTNAME (${checks.length}/${checks.length}).`
        : `FAIL: ${failed.join(", ")}`,
  };
}

function selftest() {
  const original = readFileSync(MODAL, "utf8");
  if (!run().ok) {
    console.error(`${LABEL} SELFTEST FAIL: already red — ${run().message}`);
    process.exit(1);
  }
  {
    const caught = run(
      original.replace(
        'form.watch("class_hint") || "UNIT-UNASSIGNED"',
        'form.watch("class_hint") || `${form.watch("unit_id") || "UNIT"}-${form.watch("driver_id") || "DRIVER"}`',
      ),
    );
    if (
      caught.ok ||
      !(
        caught.failed.includes("no-uuid-fallback-modal") ||
        caught.failed.includes("safe-fallback")
      )
    ) {
      console.error(`${LABEL} SELFTEST FAIL: not caught`, caught);
      process.exit(1);
    }
  }
  console.log(`${LABEL} SELFTEST OK`);
}

if (process.argv.includes("--selftest")) selftest();
else {
  const r = run();
  console.log(r.message);
  if (!r.ok) process.exit(1);
}
