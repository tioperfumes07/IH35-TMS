#!/usr/bin/env node
import fs from "node:fs";

const FILE = "apps/frontend/src/pages/maintenance/MaintenanceSettingsPage.tsx";
const source = fs.readFileSync(FILE, "utf8");

function inspect(value) {
  const failures = [];
  const checks = [
    [/saveGenerationRef = useRef\(0\)/, "missing company generation"],
    [/updateMaintenanceSettings\(input\.companyId, input\.payload\)/, "save does not use immutable company/payload"],
    [/input\.generation !== saveGenerationRef\.current/, "stale success is not rejected"],
    [/queryKey: \["maintenance", "settings", input\.companyId\]/, "refresh is not pinned to submitted company"],
    [/saveGenerationRef\.current \+= 1[\s\S]*saveMutation\.reset\(\)[\s\S]*setPmIntervalDays\("30"\)[\s\S]*setDefaultShopLocation\("Main yard"\)[\s\S]*setBayAssignmentPolicy\("Auto-assign by first available bay"\)[\s\S]*setNotificationEmailEnabled\(true\)[\s\S]*\[operatingCompanyId\]/, "company transition does not reset save and draft state"],
    [/companyId: operatingCompanyId[\s\S]*generation: saveGenerationRef\.current[\s\S]*pm_interval_days_default: Number\(pmIntervalDays\)[\s\S]*default_shop_location: defaultShopLocation\.trim\(\)[\s\S]*bay_assignment_policy: bayAssignmentPolicy\.trim\(\)[\s\S]*notification_email_enabled: notificationEmailEnabled/, "submitter does not snapshot complete settings payload"],
    [/onSubmit=\{\(event\) => \{[\s\S]*saveSettings\(\)/, "mounted form bypasses guarded submitter"],
    [/saveMutation\.isError[\s\S]*Save failed/, "save failure is not surfaced"],
  ];
  for (const [pattern, message] of checks) if (!pattern.test(value)) failures.push(message);
  return failures;
}

if (process.argv.includes("--selftest")) {
  const mutations = [
    ["input.companyId, input.payload", "operatingCompanyId, input.payload"],
    ["input.generation !== saveGenerationRef.current", "false"],
    ["input.companyId]", "operatingCompanyId]"],
    ["saveMutation.reset();", "// planted: state survives"],
    ["setPmIntervalDays(\"30\");", "// planted: prior draft survives"],
    ["companyId: operatingCompanyId", "companyId: ''"],
    ["notification_email_enabled: notificationEmailEnabled", "notification_email_enabled: true"],
    ["saveSettings();", "saveMutation.mutate();"],
    ["saveMutation.isError", "false"],
  ];
  for (const [before, after] of mutations) {
    if (!source.includes(before)) throw new Error(`selftest fixture missing: ${before}`);
    if (inspect(source.replace(before, after)).length === 0) throw new Error(`selftest missed: ${before}`);
  }
  console.log(`verify-maint-settings-save-lifecycle --selftest PASS (${mutations.length}/${mutations.length})`);
  process.exit(0);
}

const failures = inspect(source);
if (failures.length) {
  failures.forEach((failure) => console.error(` - ${failure}`));
  process.exit(1);
}
console.log("verify-maint-settings-save-lifecycle PASS — settings save remains company-local");
