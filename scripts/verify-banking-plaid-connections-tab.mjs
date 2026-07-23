#!/usr/bin/env node
/** Banking Full Audit — Plaid Connections entry tab (design Module 4). */
import fs from "node:fs";

export function run(root = process.cwd()) {
  const failures = [];
  const nav = fs.readFileSync(`${root}/apps/frontend/src/pages/banking/BANKING_NAV_CONFIG.ts`, "utf8");
  const paths = fs.readFileSync(`${root}/apps/frontend/src/router/route-manifest.ts`, "utf8");
  const home = fs.readFileSync(`${root}/apps/frontend/src/pages/banking/BankingHome.tsx`, "utf8");
  const manifest = fs.readFileSync(`${root}/apps/frontend/src/routes/manifest.tsx`, "utf8");
  const sidebar = fs.readFileSync(`${root}/apps/frontend/src/components/layout/sidebar-config.ts`, "utf8");
  const design = fs.readFileSync(`${root}/docs/specs/IH35_ARCHITECTURAL_DESIGN.md`, "utf8");
  if (!nav.includes('id: "plaid_connections"')) failures.push("BANKING_MODULE_TABS missing plaid_connections");
  if (!paths.includes('plaid_connections: "/banking/plaid-connections"')) {
    failures.push("BANKING_TAB_PATH missing plaid_connections");
  }
  if (!manifest.includes('path="/banking/plaid-connections"')) failures.push("manifest missing /banking/plaid-connections");
  if (!home.includes('activeTab === "plaid_connections"')) failures.push("BankingHome missing plaid_connections body");
  if (!home.includes('data-testid="banking-plaid-connections-tab"')) {
    failures.push("missing plaid connections tab testid");
  }
  if (!home.includes("BankingPlaidConnectionsPanel")) {
    failures.push("Plaid tab must render BankingPlaidConnectionsPanel");
  }
  if (!sidebar.includes("/banking/plaid-connections")) failures.push("sidebar missing Plaid Connections");
  if (!design.includes("/banking/plaid-connections")) failures.push("arch design missing /banking/plaid-connections");
  return failures;
}

if (process.argv.includes("--selftest")) {
  const tmp = fs.mkdtempSync("/tmp/verify-banking-plaid-tab-");
  for (const [rel, body] of Object.entries({
    "apps/frontend/src/pages/banking/BANKING_NAV_CONFIG.ts": 'id: "plaid_connections"\n',
    "apps/frontend/src/router/route-manifest.ts": 'plaid_connections: "/banking/plaid-connections"\n',
    "apps/frontend/src/routes/manifest.tsx": 'path="/banking/plaid-connections"\n',
    "apps/frontend/src/pages/banking/BankingHome.tsx":
      'activeTab === "plaid_connections"\ndata-testid="banking-plaid-connections-tab"\nBankingPlaidConnectionsPanel\n',
    "apps/frontend/src/components/layout/sidebar-config.ts": "/banking/plaid-connections\n",
    "docs/specs/IH35_ARCHITECTURAL_DESIGN.md": "/banking/plaid-connections\n",
  })) {
    fs.mkdirSync(`${tmp}/${rel.split("/").slice(0, -1).join("/")}`, { recursive: true });
    fs.writeFileSync(`${tmp}/${rel}`, body);
  }
  if (run(tmp).length) throw new Error("PASS fail");
  fs.writeFileSync(`${tmp}/apps/frontend/src/pages/banking/BANKING_NAV_CONFIG.ts`, "x\n");
  if (!run(tmp).length) throw new Error("FAIL fail");
  fs.rmSync(tmp, { recursive: true, force: true });
  console.log("verify-banking-plaid-connections-tab --selftest OK");
} else {
  const f = run();
  if (f.length) {
    console.error(f.join("\n"));
    process.exit(1);
  }
  console.log("verify-banking-plaid-connections-tab — OK");
}
