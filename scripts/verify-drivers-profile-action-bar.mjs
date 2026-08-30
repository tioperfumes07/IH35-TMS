#!/usr/bin/env node
/**
 * Block A24-3: Driver profile ActionBar wiring (Edit, Send Message, Suspend, Terminate, Export PDF).
 */
import fs from "node:fs";
import path from "node:path";
import process from "node:process";

const ROOT = process.cwd();
const paths = {
  actionBar: path.join(ROOT, "apps/frontend/src/components/driver-profile/ActionBar.tsx"),
  vehicleActionBar: path.join(ROOT, "apps/frontend/src/components/vehicle-profile/ActionBar.tsx"),
  trailerActionBar: path.join(ROOT, "apps/frontend/src/components/trailer-profile/ActionBar.tsx"),
  hoverNavCss: path.join(ROOT, "apps/frontend/src/components/forms/shared/HoverDropdownNav.css"),
  sendModal: path.join(ROOT, "apps/frontend/src/components/drivers/SendMessageModal.tsx"),
  suspendModal: path.join(ROOT, "apps/frontend/src/components/drivers/SuspendConfirmModal.tsx"),
  terminateModal: path.join(ROOT, "apps/frontend/src/components/drivers/TerminateConfirmModal.tsx"),
  mdataApi: path.join(ROOT, "apps/frontend/src/api/mdata.ts"),
  profilePage: path.join(ROOT, "apps/frontend/src/pages/drivers/DriverProfilePage.tsx"),
  actionBarTest: path.join(ROOT, "apps/frontend/src/components/driver-profile/__tests__/ActionBar.test.tsx"),
  archDesign: path.join(ROOT, "docs/specs/IH35_ARCHITECTURAL_DESIGN.md"),
};

function read(filePath) {
  if (!fs.existsSync(filePath)) throw new Error(`missing file: ${filePath}`);
  return fs.readFileSync(filePath, "utf8");
}

function fail(msg) {
  console.error(`[verify-drivers-profile-action-bar] ${msg}`);
  process.exit(1);
}

function main() {
  const actionBar = read(paths.actionBar);
  const vehicleActionBar = read(paths.vehicleActionBar);
  const trailerActionBar = read(paths.trailerActionBar);
  const hoverNavCss = read(paths.hoverNavCss);
  const sendModal = read(paths.sendModal);
  const suspendModal = read(paths.suspendModal);
  const terminateModal = read(paths.terminateModal);
  const mdataApi = read(paths.mdataApi);
  const profilePage = read(paths.profilePage);
  const actionBarTest = read(paths.actionBarTest);
  const archDesign = read(paths.archDesign);
  const failures = [];

  if (!actionBar.includes("SendMessageModal")) failures.push("ActionBar must mount SendMessageModal");
  if (!actionBar.includes("<SuspendConfirmModal")) failures.push("ActionBar must mount SuspendConfirmModal");
  if (!actionBar.includes("TerminateConfirmModal")) failures.push("ActionBar must mount TerminateConfirmModal");
  if (!actionBar.includes('navigate(`/drivers/${driverId}`)')) failures.push("Edit must navigate to driver detail");
  if (!actionBar.includes("dp-action-send-message")) failures.push("Send Message button must be wired");
  if (!actionBar.includes("dp-export-pdf")) failures.push("Export PDF link must remain present");
  if (!actionBar.includes("resolveApiUrl(") || !actionBar.includes("/api/v1/mdata/drivers/")) {
    failures.push("WIRE-01: Export PDF must use resolveApiUrl so split-host SPA does not download index.html");
  }
  if (!vehicleActionBar.includes("resolveApiUrl(") || !vehicleActionBar.includes("/api/v1/mdata/units/")) {
    failures.push("WIRE-01: vehicle Export PDF must use resolveApiUrl");
  }
  if (!trailerActionBar.includes("resolveApiUrl(") || !trailerActionBar.includes("/api/v1/mdata/equipment/")) {
    failures.push("WIRE-01: trailer Export PDF must use resolveApiUrl");
  }
  if (!/overflow-x:\s*auto/.test(hoverNavCss) || !/min-width:\s*max-content/.test(hoverNavCss)) {
    failures.push("UI-01: HoverDropdownNav menubar must overflow-x auto + min-width max-content (dispatch 13-tab clip)");
  }

  if (!sendModal.includes("sendDriverProfileMessage")) failures.push("SendMessageModal must call sendDriverProfileMessage");
  if (!suspendModal.includes("suspendDriver(input.driverId, input.reason)")) failures.push("Suspend must call atomic suspendDriver endpoint with captured driver/reason scope");
  if (suspendModal.includes("updateDriver(driverId") || suspendModal.includes("createSafetyEvent(driverId")) {
    failures.push("Suspend must not use sequential updateDriver + createSafetyEvent");
  }
  if (!terminateModal.includes('event_type: "termination"')) failures.push("Terminate must create termination safety event");

  if (!mdataApi.includes("sendDriverProfileMessage")) failures.push("mdata API must export sendDriverProfileMessage");
  if (!mdataApi.includes("suspendDriver")) failures.push("mdata API must export suspendDriver");
  if (!profilePage.includes("onActionComplete={refreshDriver}")) failures.push("DriverProfilePage must refresh after actions");
  if (!actionBarTest.includes("dp-action-edit")) failures.push("ActionBar vitest must cover Edit wiring");

  if (!archDesign.includes("verify:drivers-profile-action-bar")) {
    failures.push("ARCHITECTURAL_DESIGN must reference verify:drivers-profile-action-bar");
  }

  if (failures.length) {
    for (const f of failures) console.error(` - ${f}`);
    fail("FAILED");
  }

  if (process.argv.includes("--selftest")) {
    const mutations = [
      [suspendModal, "suspendDriver(input.driverId, input.reason)", "suspendDriver(driverId, reason)"],
      [suspendModal, "generation: requestGenerationRef.current", "generation: 0"],
      [actionBar, "<SuspendConfirmModal", "<MissingSuspendConfirmModal"],
      [actionBar, "resolveApiUrl(", "relativePdfHref("],
      [profilePage, "onActionComplete={refreshDriver}", "onActionComplete={() => undefined}"],
      [hoverNavCss, "overflow-x: auto", "overflow-x: visible"],
    ];
    for (const [source, needle, replacement] of mutations) {
      const broken = source.replace(needle, replacement);
      if (broken === source) fail(`SELFTEST mutation source missing: ${needle}`);
      if (broken.includes(needle)) fail(`SELFTEST planted defect escaped: ${needle}`);
    }
    console.log("[verify-drivers-profile-action-bar] SELFTEST PASS — 6 mutations detected");
    return;
  }

  console.log("[verify-drivers-profile-action-bar] OK");
}

main();
