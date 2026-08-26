#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";

const controls = [
  ["apps/frontend/src/pages/safety/InternalFinesPage.tsx", 'htmlFor="internal-fine-imposed-date"', 'id="internal-fine-imposed-date"'],
  ["apps/frontend/src/pages/safety/ComplaintsPage.tsx", 'htmlFor="safety-complaint-date"', 'id="safety-complaint-date"'],
  ["apps/frontend/src/pages/safety/DotInspectionsPage.tsx", 'htmlFor="dot-inspection-page-date"', 'id="dot-inspection-page-date"'],
  ["apps/frontend/src/pages/safety/tabs/DOTInspectionsTab.tsx", 'htmlFor="dot-inspection-tab-date"', 'id="dot-inspection-tab-date"'],
  ["apps/frontend/src/pages/safety/tabs/DrugAlcoholTab.tsx", 'htmlFor="drug-alcohol-test-date"', 'id="drug-alcohol-test-date"'],
  ["apps/frontend/src/pages/safety/components/CargoClaimIntakeSurface.tsx", 'htmlFor={`${pageTestId}-edit-loss-date`}', 'id={`${pageTestId}-edit-loss-date`}'],
  ["apps/frontend/src/pages/safety/components/CargoClaimIntakeSurface.tsx", 'htmlFor={`${pageTestId}-edit-filed-date`}', 'id={`${pageTestId}-edit-filed-date`}'],
  ["apps/frontend/src/pages/safety/CSAMitigationQueue.tsx", 'htmlFor="csa-mitigation-due-date"', 'id="csa-mitigation-due-date"'],
  ["apps/frontend/src/pages/safety/PermitsPage.tsx", 'htmlFor="safety-permit-expiry-date"', 'id="safety-permit-expiry-date"'],
  ["apps/frontend/src/pages/safety/SafetyMeetingsPage.tsx", 'htmlFor="safety-meeting-date"', 'id="safety-meeting-date"'],
  ["apps/frontend/src/pages/safety/drug-alcohol/TestSchedulingPanel.tsx", 'htmlFor="drug-alcohol-scheduled-date"', 'id="drug-alcohol-scheduled-date"'],
  ["apps/frontend/src/pages/safety/driver-scheduler/DriverSchedulerGridPage.tsx", 'htmlFor="driver-cover-start-date"', 'id="driver-cover-start-date"'],
  ["apps/frontend/src/pages/safety/driver-scheduler/DriverSchedulerGridPage.tsx", 'htmlFor="driver-cover-end-date"', 'id="driver-cover-end-date"'],
  ["apps/frontend/src/pages/safety/components/CargoClaimIntakeSurface.tsx", 'htmlFor={`${pageTestId}-create-loss-date`}', 'id={`${pageTestId}-create-loss-date`}'],
  ["apps/frontend/src/pages/safety/components/CargoClaimIntakeSurface.tsx", 'htmlFor={`${pageTestId}-create-filed-date`}', 'id={`${pageTestId}-create-filed-date`}'],
  ["apps/frontend/src/pages/safety/components/CompanyViolationCorrectiveActionForm.tsx", 'htmlFor="corrective-action-completed-date"', 'id="corrective-action-completed-date"'],
  ["apps/frontend/src/pages/safety/components/FineLifecycleActions.tsx", 'htmlFor="fine-payment-paid-date"', 'id="fine-payment-paid-date"'],
  ["apps/frontend/src/pages/safety/components/SafetyIncidentsClusterSurface.tsx", 'htmlFor={`${config.pageTestId}-field-incident-date`}', 'id={`${config.pageTestId}-field-incident-date`}'],
];

const escapeRegExp = (value) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const hasPickerAttribute = (tag, pickerNeedle) => new RegExp(`\\s${escapeRegExp(pickerNeedle)}(?=\\s|/?>)`).test(tag);

function inspect(overrides = new Map()) {
  const errors = [];
  for (const [rel, labelNeedle, pickerNeedle] of controls) {
    const source = overrides.get(rel) ?? fs.readFileSync(rel, "utf8");
    if (!source.includes(labelNeedle)) errors.push(`${rel}: missing ${labelNeedle}`);
    const pickerTags = [...source.matchAll(/<DatePicker\b[\s\S]*?>/g)].map((match) => match[0]);
    if (!pickerTags.some((tag) => hasPickerAttribute(tag, pickerNeedle))) errors.push(`${rel}: DatePicker missing ${pickerNeedle}`);
  }

  const roots = ["drivers", "fleet", "safety", "fuel"].map((name) => `apps/frontend/src/pages/${name}`);
  for (const root of roots) {
    const stack = [root];
    while (stack.length) {
      const entry = stack.pop();
      for (const child of fs.readdirSync(entry, { withFileTypes: true })) {
        const full = path.join(entry, child.name);
        if (child.isDirectory()) stack.push(full);
        else if (child.isFile() && full.endsWith(".tsx")) {
          const source = overrides.get(full) ?? fs.readFileSync(full, "utf8");
          for (const match of source.matchAll(/<DatePicker\b[\s\S]*?>/g)) {
            if (!/\bid\s*=/.test(match[0])) errors.push(`${full}: DatePicker trigger has no id`);
          }
        }
      }
    }
  }
  return errors;
}

if (process.argv.includes("--selftest")) {
  let caught = 0;
  const missed = [];
  for (const [rel, , pickerNeedle] of controls) {
    const source = fs.readFileSync(rel, "utf8");
    let planted = false;
    const mutated = source.replace(/<DatePicker\b[\s\S]*?>/g, (tag) => {
      if (planted || !hasPickerAttribute(tag, pickerNeedle)) return tag;
      planted = true;
      return tag.replace(pickerNeedle, 'id="planted-broken-datepicker-id"');
    });
    const overrides = new Map([[rel, mutated]]);
    if (inspect(overrides).length > 0) caught += 1;
    else missed.push(`${rel}:${pickerNeedle}`);
  }
  if (caught !== controls.length) {
    console.error(`FAIL: caught ${caught}/${controls.length} planted DatePicker association defects; missed ${missed.join(", ")}`);
    process.exit(1);
  }
  console.log(`PASS: ${caught}/${controls.length} planted assigned-calendar defects caught`);
}

const errors = inspect();
if (errors.length) {
  console.error(errors.map((error) => `FAIL: ${error}`).join("\n"));
  process.exit(1);
}
console.log("PASS: every assigned Drivers/Fleet/Safety/Fuel DatePicker has an id; 18 residual Safety controls have explicit labels");
