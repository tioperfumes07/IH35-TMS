#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const processor = fs.readFileSync(
  path.join(ROOT, "apps/backend/src/integrations/samsara/fault-code-processor.service.ts"),
  "utf8"
);

const notificationService = fs.readFileSync(
  path.join(ROOT, "apps/backend/src/notifications/notification.service.ts"),
  "utf8"
);

if (!processor.includes("emitPredictiveAutoWoNotifications")) {
  console.error(
    "verify:fault-auto-wo-notification-wired FAIL: fault processor must call emitPredictiveAutoWoNotifications"
  );
  process.exit(1);
}
if (!notificationService.includes("createNotification")) {
  console.error("verify:fault-auto-wo-notification-wired FAIL: notification service must call createNotification");
  process.exit(1);
}
if (!notificationService.includes("maintenance_alert")) {
  console.error("verify:fault-auto-wo-notification-wired FAIL: maintenance_alert type missing");
  process.exit(1);
}
if (!notificationService.includes("predictive_auto_wo")) {
  console.error("verify:fault-auto-wo-notification-wired FAIL: source_block predictive_auto_wo missing");
  process.exit(1);
}
if (!notificationService.includes("listCompanyNotifyUserIds")) {
  console.error("verify:fault-auto-wo-notification-wired FAIL: fleet manager notify user lookup missing");
  process.exit(1);
}

console.log("verify:fault-auto-wo-notification-wired PASS");
