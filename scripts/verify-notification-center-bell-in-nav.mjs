#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const topbar = fs.readFileSync(path.join(ROOT, "apps/frontend/src/components/Topbar.tsx"), "utf8");
const topNav = fs.readFileSync(path.join(ROOT, "apps/frontend/src/layout/TopNav.tsx"), "utf8");
const bell = fs.readFileSync(path.join(ROOT, "apps/frontend/src/components/notifications/NotificationBell.tsx"), "utf8");

if (!topbar.includes("NotificationBell")) {
  console.error("verify:notification-center-bell-in-nav FAIL: Topbar must render NotificationBell");
  process.exit(1);
}
if (!topNav.includes("Topbar")) {
  console.error("verify:notification-center-bell-in-nav FAIL: TopNav must export Topbar");
  process.exit(1);
}
if (!bell.includes("notification-unread-badge")) {
  console.error("verify:notification-center-bell-in-nav FAIL: unread badge test id missing");
  process.exit(1);
}

console.log("verify:notification-center-bell-in-nav PASS");
