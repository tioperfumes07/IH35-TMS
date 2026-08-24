#!/usr/bin/env node
/** FLT-F6325 — Inline unit status writes must block duplicates and surface failures. */
import fs from "node:fs";

const files = {
  page: fs.readFileSync("apps/frontend/src/pages/fleet/VehicleProfilePage.tsx", "utf8"),
  identity: fs.readFileSync("apps/frontend/src/components/vehicle-profile/IdentityStatusHeader.tsx", "utf8"),
};

function audit(source) {
  const failures = [];
  const need = (condition, message) => { if (!condition) failures.push(message); };
  need(/onError: \(error\) => pushToast\(error instanceof Error \? error\.message : "Failed to update unit availability", "error"\)/.test(source.page), "quick availability failure must toast");
  need(/pushToast\("Unit availability updated", "success"\)/.test(source.page), "quick availability success must be explicit");
  need(/quickAvailabilityPending=\{quickAvailMutation\.isPending\}/.test(source.page), "pending state must reach the toggle");
  need(/disabled=\{quickAvailabilityPending\}/.test(source.identity), "toggle must block duplicate writes");
  need(/patchUnit\(unitId, companyId, \{ status: "InService" \}\)[\s\S]{0,500}\.catch\(\(error\)/.test(source.identity), "In Service PATCH must catch rejection");
  need(/Failed to update unit status/.test(source.identity) && /pushToast\("Unit status updated", "success"\)/.test(source.identity), "inline status must report failure and success");
  return failures;
}

const failures = audit(files);
if (failures.length) {
  console.error(`verify-fleet-inline-status-visible-errors FAIL\n- ${failures.join("\n- ")}`);
  process.exit(1);
}

if (process.argv.includes("--selftest")) {
  const mutations = [
    { ...files, page: files.page.replace("onError: (error) => pushToast", "onSettled: (error) => pushToast") },
    { ...files, page: files.page.replace('pushToast("Unit availability updated", "success");', "") },
    { ...files, page: files.page.replace("quickAvailabilityPending={quickAvailMutation.isPending}", "") },
    { ...files, identity: files.identity.replace("disabled={quickAvailabilityPending}", "") },
    { ...files, identity: files.identity.replace(".catch((error) => {", ".then((error) => {") },
    { ...files, identity: files.identity.replace("Failed to update unit status", "Request failed").replace('pushToast("Unit status updated", "success");', "") },
  ];
  for (const [index, mutation] of mutations.entries()) {
    if (audit(mutation).length === 0) throw new Error(`mutation ${index + 1} escaped`);
  }
  console.log(`verify-fleet-inline-status-visible-errors SELFTEST PASS — ${mutations.length} mutations detected`);
}

console.log("verify-fleet-inline-status-visible-errors PASS — inline unit status writes are observable");
