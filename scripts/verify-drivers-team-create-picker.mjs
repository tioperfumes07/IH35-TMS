#!/usr/bin/env node
/** Ratchet Drivers > Create Team onto the create-capable, server-search driver catalog. */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { join } from "node:path";
import { propBoundTo } from "./lib/entity-label-detect.mjs";

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
    // ★ DETECTOR WIDENED 2026-08-11 (CLS-GUARD-LITERAL-DETECTION). This required the bare literal
    // `operatingCompanyId={selectedCompanyId}`. Drivers.tsx:914 now reads
    // `operatingCompanyId={selectedCompanyId ?? ""}` — a type-safety improvement — so the guard went RED
    // on scoped, correct code. It is the subtlest member of the class: its SELFTEST kept PASSING,
    // because the fixture below still used the bare literal. Green against a fiction, red against the
    // real file. The assertion is unchanged — the picker must be scoped to the selected company.
    if (!propBoundTo(picker, { prop: "operatingCompanyId", identifier: "selectedCompanyId" })) {
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
  if (!/<Modal variant="drawer" open=\{teamDetailOpen\}/.test(src)) {
    problems.push(`${TARGET}: Team Detail must use drawer chrome`);
  }
  if (!/teamDetailQuery\.isError[\s\S]{0,220}<ListErrorBanner[\s\S]{0,220}teamDetailQuery\.refetch\(\)/.test(src)) {
    problems.push(`${TARGET}: Team Detail failure must render retryable ListErrorBanner`);
  }
  if (/label=\{String\(\(row as Record<string, unknown>\)\.(?:load_id|driver_id)/.test(src)) {
    problems.push(`${TARGET}: Team Detail settlement history must not paint raw UUID labels`);
  }
  return problems;
}

function selftest() {
  const good = `
    <Modal variant="drawer" open={teamCreateOpen}>
      <DriverPickerWithCreate operatingCompanyId={selectedCompanyId ?? ""} value={teamForm.primary_driver_id} open={teamCreateOpen} shell="drawer" />
      <DriverPickerWithCreate operatingCompanyId={selectedCompanyId} value={teamForm.co_driver_id} open={teamCreateOpen} shell="drawer" />
    </Modal>
    <Modal variant="drawer" open={teamDetailOpen}>
      {teamDetailQuery.isError ? <ListErrorBanner onRetry={() => void teamDetailQuery.refetch()} /> : null}
      <EntityLink label={entityLabel(null, row.load_id, "Load")} />
    </Modal>`;
  const bad = `
    <Modal variant="drawer" open={teamCreateOpen}>
      <SelectCombobox value={teamForm.primary_driver_id}></SelectCombobox>
      <SelectCombobox value={teamForm.co_driver_id}></SelectCombobox>
    </Modal>`;
  // The scope check had NO negative case — `bad` swaps in a SelectCombobox, which trips a DIFFERENT
  // assertion, so "picker present but UNSCOPED" was never exercised. That is how the widened spelling
  // could have been widened into uselessness without anything noticing.
  const unscoped = good
    .replace(/operatingCompanyId=\{selectedCompanyId \?\? ""\}\s*/, "")
    .replace(/operatingCompanyId=\{selectedCompanyId\}\s*/, "");
  const hardcoded = good.replace(/operatingCompanyId=\{selectedCompanyId \?\? ""\}/, 'operatingCompanyId={"some-fixed-uuid"}');

  const failures = [];
  if (audit(good).length) failures.push(`good fixture rejected: ${audit(good).join(" | ")}`);
  if (audit(bad).length < 3) failures.push("bare picker regression was not fully detected");
  if (unscoped === good) {
    failures.push("unscoped mutation is INERT — the scope assertion proves nothing");
  } else if (audit(unscoped).filter((p) => p.includes("selectedCompanyId scope")).length !== 2) {
    failures.push("a picker with NO operatingCompanyId was not caught on both fields");
  }
  if (hardcoded === good) {
    failures.push("hardcoded-company mutation is INERT");
  } else if (!audit(hardcoded).some((p) => p.includes("selectedCompanyId scope"))) {
    failures.push("a picker scoped to a hardcoded company id was not caught");
  }
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
