#!/usr/bin/env node
/** Fill-not-shell — FactoringProfilePanel + FactorAdmin selected detail use BoardSection. */
import fs from "node:fs";

const PANEL = "apps/frontend/src/pages/factoring/FactoringProfilePanel.tsx";
const ADMIN = "apps/frontend/src/pages/factoring/FactorAdmin.tsx";
const selftest = process.argv.includes("--selftest");

function analyze(panel, admin) {
  const e = [];
  if (!panel.includes("<BoardSection") || !panel.includes('testId="factoring-profile-panel"')) {
    e.push(`${PANEL}: must wrap in BoardSection (testId=factoring-profile-panel)`);
  }
  if (/rounded-sm border border-gray-200 bg-white p-3/.test(panel)) {
    e.push(`${PANEL}: must not keep layered bare card div`);
  }
  if (!panel.includes("{factor.name} · primary factoring company on file")) {
    e.push(`${PANEL}: full variant must keep factor name subtitle`);
  }
  if (!admin.includes("<BoardSection") || !admin.includes('testId="factor-admin-selected-detail"')) {
    e.push(`${ADMIN}: selected factor detail must wrap in BoardSection`);
  }
  if (!admin.includes('testId="factor-admin-customer-history"')) {
    e.push(`${ADMIN}: customer history must wrap in BoardSection`);
  }
  if (/rounded-sm border border-gray-200 bg-white p-3/.test(admin)) {
    e.push(`${ADMIN}: must not keep layered bare card div`);
  }
  if (!admin.includes("FORM_INPUT_CLASS")) {
    e.push(`${ADMIN}: modal inputs must use FORM_INPUT_CLASS`);
  }
  return e;
}

const base = {
  panel: fs.readFileSync(PANEL, "utf8"),
  admin: fs.readFileSync(ADMIN, "utf8"),
};

if (selftest) {
  const clean = analyze(base.panel, base.admin);
  if (clean.length) {
    console.error("SELFTEST FAIL live:\n- " + clean.join("\n- "));
    process.exit(1);
  }
  const plants = [
    ["panel drops BoardSection", analyze(base.panel.replace(/<BoardSection/g, "<div"), base.admin)],
    ["admin drops BoardSection", analyze(base.panel, base.admin.replace(/<BoardSection/g, "<div"))],
    ["admin re-layers card", analyze(base.panel, base.admin.replace('space-y-3"', 'space-y-2 rounded-sm border border-gray-200 bg-white p-3"'))],
  ];
  for (const [label, fails] of plants) {
    if (!fails.length) {
      console.error(`SELFTEST FAIL — plant escaped: ${label}`);
      process.exit(1);
    }
  }
  console.log(`PASS verify-factoring-profile-admin-board --selftest ${plants.length}/${plants.length}`);
  process.exit(0);
}

const fails = analyze(base.panel, base.admin);
if (fails.length) {
  console.error("FAIL verify-factoring-profile-admin-board");
  fails.forEach((f) => console.error("- " + f));
  process.exit(1);
}
console.log("PASS verify-factoring-profile-admin-board — Profile + FactorAdmin BoardSection");
