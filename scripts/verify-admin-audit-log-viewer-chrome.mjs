#!/usr/bin/env node
import fs from "node:fs";

const admin = fs.readFileSync("apps/frontend/src/pages/admin/AdminPage.tsx", "utf8");
const manifest = fs.readFileSync("apps/frontend/src/routes/manifest.tsx", "utf8");
const viewer = fs.readFileSync("apps/frontend/src/pages/admin/audit-log/AuditLogViewer.tsx", "utf8");

for (const token of [
  'label: "Audit Log Viewer"',
  'path: "/admin/audit-log"',
  'path="/admin/audit-log"',
  "<AuditLogViewer />",
  "listAuditViewerEvents",
  "selectedCompanyId",
]) {
  if (![admin, manifest, viewer].some((source) => source.includes(token))) {
    throw new Error(`admin audit viewer chrome guard: missing ${token}`);
  }
}

console.log("verify-admin-audit-log-viewer-chrome: PASS");
