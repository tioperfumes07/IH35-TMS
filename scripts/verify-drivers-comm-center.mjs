#!/usr/bin/env node
/**
 * Block A24-10: Driver communication center (office inbox + PWA + SMS/email bridge).
 */
import fs from "node:fs";
import path from "node:path";
import process from "node:process";

const ROOT = process.cwd();
const paths = {
  messagesRoutes: path.join(ROOT, "apps/backend/src/drivers/messages.routes.ts"),
  messagesService: path.join(ROOT, "apps/backend/src/drivers/messages.service.ts"),
  smsBridge: path.join(ROOT, "apps/backend/src/notifications/sms-bridge.service.ts"),
  inboxPage: path.join(ROOT, "apps/frontend/src/pages/drivers/MessagesInboxPage.tsx"),
  pwaMessages: path.join(ROOT, "apps/driver-pwa/src/pages/Messages.tsx"),
  migration: path.join(ROOT, "db/migrations/0349_driver_comm_inbox.sql"),
  backendTest: path.join(ROOT, "apps/backend/src/drivers/__tests__/messages.routes.test.ts"),
  frontendTest: path.join(ROOT, "apps/frontend/src/pages/drivers/__tests__/MessagesInboxPage.test.tsx"),
  pwaTest: path.join(ROOT, "apps/driver-pwa/src/pages/__tests__/Messages.test.ts"),
  manifest: path.join(ROOT, "apps/frontend/src/routes/manifest.tsx"),
  archDesign: path.join(ROOT, "docs/specs/IH35_ARCHITECTURAL_DESIGN.md"),
};

function read(filePath) {
  if (!fs.existsSync(filePath)) throw new Error(`missing file: ${filePath}`);
  return fs.readFileSync(filePath, "utf8");
}

function fail(msg) {
  console.error(`[verify-drivers-comm-center] ${msg}`);
  process.exit(1);
}

function main() {
  const messagesRoutes = read(paths.messagesRoutes);
  const messagesService = read(paths.messagesService);
  const smsBridge = read(paths.smsBridge);
  const inboxPage = read(paths.inboxPage);
  const pwaMessages = read(paths.pwaMessages);
  const migration = read(paths.migration);
  const backendTest = read(paths.backendTest);
  const frontendTest = read(paths.frontendTest);
  const pwaTest = read(paths.pwaTest);
  const manifest = read(paths.manifest);
  const archDesign = read(paths.archDesign);
  const failures = [];

  if (!messagesRoutes.includes("/api/v1/drivers/messages/inbox")) failures.push("Office inbox route required");
  if (!messagesRoutes.includes("/api/v1/driver/messages")) failures.push("Driver PWA messages route required");
  if (!messagesService.includes("deliverDriverProfileMessage")) failures.push("Delivery bridge service required");
  if (!smsBridge.includes("bridgeDriverSms")) failures.push("SMS bridge service required");
  if (!inboxPage.includes("MessagesInboxPage")) failures.push("Office inbox page required");
  if (!pwaMessages.includes("MessagesPage")) failures.push("PWA messages page required");
  if (!migration.includes("read_at")) failures.push("Migration must add read_at");
  if (!manifest.includes("/drivers/messages")) failures.push("Frontend route /drivers/messages required");
  if (!backendTest.includes("A24-10")) failures.push("Backend vitest must reference A24-10");
  if (!frontendTest.includes("A24-10")) failures.push("Frontend vitest must reference A24-10");
  if (!pwaTest.includes("A24-10")) failures.push("PWA vitest must reference A24-10");

  if (!archDesign.includes("verify:drivers-comm-center")) {
    failures.push("ARCHITECTURAL_DESIGN must reference verify:drivers-comm-center");
  }

  if (failures.length) {
    for (const f of failures) console.error(` - ${f}`);
    fail("FAILED");
  }

  console.log("[verify-drivers-comm-center] OK");
}

main();
