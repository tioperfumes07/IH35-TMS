#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";

const servicePath = path.join(process.cwd(), "apps/backend/src/accounting/escrow/service.ts");
const pagePath = path.join(process.cwd(), "apps/frontend/src/pages/accounting/EscrowPage.tsx");
const appPath = path.join(process.cwd(), "apps/frontend/src/App.tsx");
const routesManifestPath = path.join(process.cwd(), "apps/frontend/src/routes/manifest.tsx");

function fail(message) {
  console.error(`verify:escrow-emits-audit — FAILED\n- ${message}`);
  process.exit(1);
}

for (const file of [servicePath, pagePath, appPath]) {
  if (!fs.existsSync(file)) fail(`missing required file: ${file}`);
}

const service = fs.readFileSync(servicePath, "utf8");
const page = fs.readFileSync(pagePath, "utf8");
const app = `${fs.readFileSync(appPath, "utf8")}\n${fs.existsSync(routesManifestPath) ? fs.readFileSync(routesManifestPath, "utf8") : ""}`;

if (!service.includes("appendCrudAudit")) fail("escrow service must emit audit events");
if (!service.includes("accounting.escrow_posting.")) fail("escrow service must emit posting-specific audit event class");
if (!page.includes("listEscrowAccounts") || !page.includes("listEscrowPostings")) {
  fail("escrow UI page must load accounts and posting history");
}
if (!app.includes('path="/accounting/escrow"')) fail("App routing must expose /accounting/escrow");

console.log("verify:escrow-emits-audit — OK");
