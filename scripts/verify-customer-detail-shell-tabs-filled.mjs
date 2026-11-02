#!/usr/bin/env node
/**
 * Owner 11-02: fill-not-shell — Customer detail Projects / Opportunities / Conversations
 * must not fall through to a Coming-soon shell. They bind real engines (loads / open invoices /
 * notes+tasks) inside BoardSection.
 */
import fs from "node:fs";

const FILE = "apps/frontend/src/pages/Customers.tsx";
const src = fs.readFileSync(FILE, "utf8");

function fail(msg) {
  console.error(`verify-customer-detail-shell-tabs-filled FAIL: ${msg}`);
  process.exit(1);
}

if (/CustomerTabComingState/.test(src)) fail("CustomerTabComingState must be removed (shell)");
if (!/activeTab === "projects"/.test(src)) fail("projects tab branch required");
if (!/activeTab === "opportunities"/.test(src)) fail("opportunities tab branch required");
if (!/activeTab === "conversations"/.test(src)) fail("conversations tab branch required");
if (!/testId="customer-tab-projects"/.test(src)) fail("projects BoardSection testId required");
if (!/testId="customer-tab-opportunities"/.test(src)) fail("opportunities BoardSection testId required");
if (!/data-testid="customer-tab-conversations"/.test(src)) fail("conversations testId required");
if (/Coming soon/.test(src)) fail("Coming soon label must not remain on customer detail");

if (process.argv.includes("--selftest")) {
  const broken = src.replace('activeTab === "projects"', 'activeTab === "projects_REMOVED"');
  if (/activeTab === "projects"/.test(broken) && !/projects_REMOVED/.test(broken)) fail("selftest replace failed");
  console.log("verify-customer-detail-shell-tabs-filled --selftest PASS");
  process.exit(0);
}

console.log("verify-customer-detail-shell-tabs-filled PASS — projects/opportunities/conversations filled");
