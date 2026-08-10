#!/usr/bin/env node
import fs from "node:fs";

const modal = fs.readFileSync("apps/frontend/src/pages/maintenance/components/CreateWorkOrderModal.tsx", "utf8");
const routes = fs.readFileSync("apps/backend/src/maintenance/work-orders.routes.ts", "utf8");
const service = fs.readFileSync("apps/backend/src/maintenance/two-section-service.ts", "utf8");

const checks = [
  ["in-house bypasses vendor invoice requirement", /paymentTiming !== "vendor_invoice"\s*\|\|[\s\S]{0,300}vendor_invoice_number/.test(modal)],
  ["Section B retained by described cost", /\.filter\(\(line\) => line\.description \|\| line\.sub_rows\.length > 0\)/.test(modal)],
  ["backend accepts missing degraded catalog link", /service_item_uuid: z\.string\(\)\.uuid\(\)\.optional\(\)\.nullable\(\)/.test(routes)],
  ["service type preserves nullable catalog link", /service_item_uuid\?: string \| null/.test(service)],
];

const failed = checks.filter(([, ok]) => !ok);
for (const [name, ok] of checks) console.log(`${ok ? "PASS" : "FAIL"} ${name}`);
if (failed.length) process.exit(1);
console.log(`verify-wo-create-presave-honesty: ${checks.length}/${checks.length} PASS`);
