#!/usr/bin/env node
/**
 * CLOSURE-15-DEEP-AUDIT-B — Bell icon notification center CI guard.
 * Static wiring + optional runtime SSE/list probe when API_BASE_URL + session cookie set.
 */
import dotenv from "dotenv";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

dotenv.config();

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = "deep-audit-b-bell-icon";

function fail(message) {
  console.error(`[${LABEL}] FAIL: ${message}`);
  process.exit(1);
}

function read(rel) {
  const abs = path.join(ROOT, rel);
  if (!fs.existsSync(abs)) fail(`missing file: ${rel}`);
  return fs.readFileSync(abs, "utf8");
}

function assertIncludes(source, needle, message) {
  if (!source.includes(needle)) fail(message);
}

// --- Static checks ---
const bell = read("apps/frontend/src/components/notifications/NotificationBell.tsx");
const dropdown = read("apps/frontend/src/components/notifications/NotificationDropdown.tsx");
const hook = read("apps/frontend/src/hooks/useNotifications.ts");
const stream = read("apps/backend/src/notifications/stream.routes.ts");
const listRoutes = read("apps/backend/src/notifications/list.routes.ts");
const topbar = read("apps/frontend/src/components/Topbar.tsx");

assertIncludes(topbar, "NotificationBell", "Topbar must render NotificationBell");
assertIncludes(bell, "notification-bell", "Bell must expose data-testid=notification-bell");
assertIncludes(bell, "notification-unread-badge", "Bell must render unread badge test id");
assertIncludes(bell, "markAllRead", "Bell must wire mark-all-read");
assertIncludes(dropdown, "notification-dropdown", "Dropdown must expose data-testid=notification-dropdown");
assertIncludes(dropdown, "notification-item", "Dropdown must render notification-item rows");
assertIncludes(dropdown, "Mark all read", "Dropdown must offer mark-all-read action");
assertIncludes(dropdown, "Mark read", "Dropdown must offer per-item mark-read");
assertIncludes(dropdown, "Dismiss", "Dropdown must offer dismiss");
assertIncludes(dropdown, 'to="/notifications"', "Dropdown must link to /notifications view-all");
assertIncludes(dropdown, "action_link", "Dropdown must deep-link via action_link");
assertIncludes(hook, 'fetchNotifications({ limit: 20 })', "Hook must fetch first page (limit 20)");
assertIncludes(hook, "/api/v1/notifications/unread-count", "Hook must call unread-count endpoint");
assertIncludes(hook, "/api/v1/notifications/mark-all-read", "Hook must call mark-all-read endpoint");
assertIncludes(hook, 'new EventSource("/api/v1/notifications/stream"', "Hook must open SSE stream with credentials");
assertIncludes(stream, "text/event-stream", "SSE route must set event-stream content type");
assertIncludes(stream, "applySseCorsHeaders", "SSE route must apply CORS headers (AUDIT-FIX-9)");
assertIncludes(stream, "setInterval", "SSE route must poll for new notifications");
assertIncludes(listRoutes, "notificationsTableReady", "List route must degrade when table missing");

const notificationTypes = [
  "compliance_expiring",
  "compliance_expired",
  "maintenance_alert",
  "load_status",
  "driver_alert",
  "system",
  "message",
];
const service = read("apps/backend/src/notifications/notification.service.ts");
for (const type of notificationTypes) {
  assertIncludes(service, `"${type}"`, `notification.service must declare type ${type}`);
}

// --- Optional runtime probe ---
const apiBase = (process.env.API_BASE_URL || process.env.BACKEND_BASE_URL || "").replace(/\/$/, "");
const sessionCookie = process.env.VERIFY_SESSION_COOKIE || process.env.IH35_SESSION_COOKIE || "";

if (apiBase && sessionCookie) {
  const headers = { Cookie: sessionCookie, Accept: "application/json" };
  const listUrl = `${apiBase}/api/v1/notifications?limit=5`;
  const countUrl = `${apiBase}/api/v1/notifications/unread-count`;
  const streamUrl = `${apiBase}/api/v1/notifications/stream`;

  for (const [name, url] of [
    ["list", listUrl],
    ["unread-count", countUrl],
  ]) {
    const res = await fetch(url, { headers });
    if (res.status >= 500) fail(`runtime ${name} returned ${res.status}`);
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 4000);
  try {
    const streamRes = await fetch(streamUrl, { headers: { Cookie: sessionCookie, Accept: "text/event-stream" }, signal: controller.signal });
    if (streamRes.status >= 500) fail(`runtime SSE stream returned ${streamRes.status}`);
    const ctype = streamRes.headers.get("content-type") || "";
    if (!ctype.includes("text/event-stream")) fail(`runtime SSE content-type unexpected: ${ctype}`);
  } catch (error) {
    if (error?.name !== "AbortError") fail(`runtime SSE probe failed: ${error?.message ?? error}`);
  } finally {
    clearTimeout(timer);
  }
  console.log(`[${LABEL}] runtime probe PASS (list + unread-count + SSE headers)`);
} else {
  console.log(`[${LABEL}] runtime probe SKIPPED (set API_BASE_URL + VERIFY_SESSION_COOKIE for live SSE demo)`);
}

console.log(`[${LABEL}] PASS — bell icon static wiring + notification types guarded`);
