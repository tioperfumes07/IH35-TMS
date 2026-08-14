#!/usr/bin/env node
/**
 * HONEST-BUILT / Fully-Wired item 7 — surface-bar wizard inventory.
 *
 * Every FE *Wizard*.tsx (page/shell) must either:
 *   (a) appear as some required.json leaf.surface_path, OR
 *   (b) be listed in FILE_OWNED_BY_LEAF (wizard steps / shared shells).
 *
 * Does NOT claim Built. Inventory only.
 *
 * Run: node scripts/verify-surface-bar-wizard-inventory.mjs [--selftest]
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = "verify-surface-bar-wizard-inventory";
const FE = path.join(ROOT, "apps/frontend/src");

/** Shared / step shells owned by a parent wizard leaf. */
const FILE_OWNED_BY_LEAF = {
  "components/border-crossing/WizardStep1.tsx": "dispatch.wizard.border_crossing_wizard_page",
  "components/border-crossing/WizardStep2.tsx": "dispatch.wizard.border_crossing_wizard_page",
  "components/border-crossing/WizardStep3.tsx": "dispatch.wizard.border_crossing_wizard_page",
  "components/border-crossing/WizardStep4.tsx": "dispatch.wizard.border_crossing_wizard_page",
  "components/border-crossing/WizardStep5.tsx": "dispatch.wizard.border_crossing_wizard_page",
  "components/border-crossing/WizardStep6.tsx": "dispatch.wizard.border_crossing_wizard_page",
  // Generic multi-step chrome used by IFTA report runners — not a top-level product wizard leaf.
  "components/reports/ifta/StepWizard.tsx": "FILE_OWNED:reports.ifta.step_wizard_shell",
};

function walk(dir, out = []) {
  for (const name of fs.readdirSync(dir)) {
    const p = path.join(dir, name);
    const st = fs.statSync(p);
    if (st.isDirectory()) {
      if (name === "node_modules" || name === "__tests__") continue;
      walk(p, out);
    } else if (/Wizard.*\.tsx$/.test(name) && !/\.test\.tsx$/.test(name)) {
      out.push(p);
    }
  }
  return out;
}

function loadSurfacePaths() {
  const surfacePaths = new Set();
  const leafIds = new Set();
  const dir = path.join(ROOT, "docs/specs/scoreboard/modules");
  for (const name of fs.readdirSync(dir)) {
    if (!name.endsWith(".required.json")) continue;
    const j = JSON.parse(fs.readFileSync(path.join(dir, name), "utf8"));
    for (const leaf of j.leaves || []) {
      if (leaf?.id) leafIds.add(String(leaf.id));
      if (leaf?.surface_path) surfacePaths.add(String(leaf.surface_path).replace(/\\/g, "/"));
    }
  }
  return { surfacePaths, leafIds };
}

export function collectWizards(listFiles = () => walk(FE)) {
  return listFiles()
    .map((abs) => path.relative(FE, abs).replace(/\\/g, "/"))
    .sort();
}

export function audit(wizards = collectWizards(), inv = loadSurfacePaths()) {
  const failures = [];
  for (const rel of wizards) {
    if (FILE_OWNED_BY_LEAF[rel]) {
      const owner = FILE_OWNED_BY_LEAF[rel];
      if (owner.startsWith("FILE_OWNED:")) continue;
      if (!inv.leafIds.has(owner)) {
        failures.push(`${rel}: FILE_OWNED_BY_LEAF → missing leaf id ${owner}`);
      }
      continue;
    }
    const hit = [...inv.surfacePaths].some((sp) => sp === rel || sp.endsWith("/" + rel));
    if (!hit) {
      failures.push(`${rel}: wizard has no leaf.surface_path and is not FILE_OWNED_BY_LEAF`);
    }
  }
  return failures;
}

if (process.argv.includes("--selftest")) {
  const live = audit();
  if (live.length) {
    console.error(`${LABEL} SELFTEST FAIL — live inventory should pass`);
    for (const f of live.slice(0, 10)) console.error(" -", f);
    process.exit(1);
  }
  const planted = audit([...collectWizards(), "pages/fake/OrphanWizard.tsx"]);
  if (!planted.some((f) => f.includes("OrphanWizard"))) {
    console.error(`${LABEL} SELFTEST FAIL — orphan wizard not caught`);
    process.exit(1);
  }
  console.log(`${LABEL} --selftest OK`);
  process.exit(0);
}

const wizards = collectWizards();
const failures = audit(wizards);
if (failures.length) {
  console.error(`${LABEL} FAIL:`);
  for (const f of failures) console.error(" -", f);
  process.exit(1);
}
console.log(`${LABEL} PASS — ${wizards.length} wizard files mapped (surface_path / FILE_OWNED_BY_LEAF)`);
