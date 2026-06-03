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
  const sendModal = read(paths.sendModal);
  const suspendModal = read(paths.suspendModal);
  const terminateModal = read(paths.terminateModal);
  const mdataApi = read(paths.mdataApi);
  const profilePage = read(paths.profilePage);
  const actionBarTest = read(paths.actionBarTest);
  const archDesign = read(paths.archDesign);
  const failures = [];

  if (!actionBar.includes("SendMessageModal")) failures.push("ActionBar must mount SendMessageModal");
  if (!actionBar.includes("SuspendConfirmModal")) failures.push("ActionBar must mount SuspendConfirmModal");
  if (!actionBar.includes("TerminateConfirmModal")) failures.push("ActionBar must mount TerminateConfirmModal");
  if (!actionBar.includes('navigate(`/drivers/${driverId}`)')) failures.push("Edit must navigate to driver detail");
  if (!actionBar.includes("dp-action-send-message")) failures.push("Send Message button must be wired");
  if (!actionBar.includes("dp-export-pdf")) failures.push("Export PDF link must remain present");

  if (!sendModal.includes("sendDriverProfileMessage")) failures.push("SendMessageModal must call sendDriverProfileMessage");
  if (!suspendModal.includes('updateDriver(driverId, { status: "Inactive" })')) failures.push("Suspend must PATCH Inactive");
  if (!suspendModal.includes("createSafetyEvent")) failures.push("Suspend must emit safety incident audit");
  if (!terminateModal.includes('event_type: "termination"')) failures.push("Terminate must create termination safety event");

  if (!mdataApi.includes("sendDriverProfileMessage")) failures.push("mdata API must export sendDriverProfileMessage");
  if (!profilePage.includes("onActionComplete={refreshDriver}")) failures.push("DriverProfilePage must refresh after actions");
  if (!actionBarTest.includes("dp-action-edit")) failures.push("ActionBar vitest must cover Edit wiring");

  if (!archDesign.includes("verify:drivers-profile-action-bar")) {
    failures.push("ARCHITECTURAL_DESIGN must reference verify:drivers-profile-action-bar");
  }

  if (failures.length) {
    for (const f of failures) console.error(` - ${f}`);
    fail("FAILED");
  }

  console.log("[verify-drivers-profile-action-bar] OK");
}

main();
