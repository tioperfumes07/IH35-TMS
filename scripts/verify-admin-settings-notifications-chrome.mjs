#!/usr/bin/env node
import fs from "node:fs";

const admin = fs.readFileSync("apps/frontend/src/pages/admin/AdminPage.tsx", "utf8");
const manifest = fs.readFileSync("apps/frontend/src/routes/manifest.tsx", "utf8");
const links = [
  ["Profile Settings", "/settings"],
  ["Notification Preferences", "/settings/notifications"],
  ["Notification Center", "/notifications"],
];

for (const [label, path] of links) {
  if (!admin.includes(`label: \"${label}\"`) || !admin.includes(`path: \"${path}\"`)) {
    throw new Error(`admin settings chrome guard: missing ${label} → ${path}`);
  }
  if (!manifest.includes(`path=\"${path}\"`)) {
    throw new Error(`admin settings chrome guard: ${path} is not mounted`);
  }
}

console.log("verify-admin-settings-notifications-chrome: PASS");
