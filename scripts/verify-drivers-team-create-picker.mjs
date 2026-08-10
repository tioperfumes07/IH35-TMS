#!/usr/bin/env node
/** Ratchet Drivers > Create Team onto the create-capable, server-search driver catalog. */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { join } from "node:path";

const ROOT = fileURLToPath(new URL("..", import.meta.url));
const TARGET = "apps/frontend/src/pages/Drivers.tsx";
const LABEL = "verify-drivers-team-create-picker";

export function audit(src) {
  const problems = [];
  const pickerCalls = src.match(/<DriverPickerWithCreate[\s\S]*?\/>/g) ?? [];
  const teamPickers = pickerCalls.filter((call) =>
    /teamForm\.(?:primary_driver_id|co_driver_id)/.test(call)
  );
  if (teamPickers.length !== 2) {
    problems.push(`${TARGET}: Create Team must have exactly two DriverPickerWithCreate fields`);
  }
  for (const field of ["primary_driver_id", "co_driver_id"]) {
    const picker = teamPickers.find((call) => call.includes(`teamForm.${field}`));
    if (!picker) {
      problems.push(`${TARGET}: ${field} must use DriverPickerWithCreate`);
      continue;
    }
    if (!/operatingCompanyId=\{selectedCompanyId\}/.test(picker)) {
      problems.push(`${TARGET}: ${field} picker must carry selectedCompanyId scope`);
    }
    if (!/shell="drawer"/.test(picker) || !/open=\{teamCreateOpen\}/.test(picker)) {
      problems.push(`${TARGET}: ${field} picker must use nested drawer lifecycle`);
    }
  }
  const createTeamBlock = src.match(/<Modal variant="drawer" open=\{teamCreateOpen\}[\s\S]*?<\/Modal>/)?.[0] ?? "";
  if (/<SelectCombobox[\s\S]{0,400}teamForm\.(?:primary_driver_id|co_driver_id)/.test(createTeamBlock)) {
    problems.push(`${TARGET}: Create Team still contains a bare driver SelectCombobox`);
  }
  return problems;
}

function selftest() {
  const good = `
    <Modal variant="drawer" open={teamCreateOpen}>
      <DriverPickerWithCreate operatingCompanyId={selectedCompanyId} value={teamForm.primary_driver_id} open={teamCreateOpen} shell="drawer" />
      <DriverPickerWithCreate operatingCompanyId={selectedCompanyId} value={teamForm.co_driver_id} open={teamCreateOpen} shell="drawer" />
    </Modal>`;
  const bad = `
    <Modal variant="drawer" open={teamCreateOpen}>
      <SelectCombobox value={teamForm.primary_driver_id}></SelectCombobox>
      <SelectCombobox value={teamForm.co_driver_id}></SelectCombobox>
    </Modal>`;
  const failures = [];
  if (audit(good).length) failures.push(`good fixture rejected: ${audit(good).join(" | ")}`);
  if (audit(bad).length < 3) failures.push("bare picker regression was not fully detected");
  if (failures.length) {
    failures.forEach((failure) => console.error(`  ✗ ${LABEL}: ${failure}`));
    process.exit(1);
  }
  console.log(`${LABEL}: selftest PASS`);
}

if (process.argv.includes("--selftest")) selftest();
else {
  const problems = audit(readFileSync(join(ROOT, TARGET), "utf8"));
  if (problems.length) {
    problems.forEach((problem) => console.error(`  ✗ ${problem}`));
    process.exit(1);
  }
  console.log(`${LABEL}: PASS — Create Team uses two scoped create-capable driver pickers`);
}
