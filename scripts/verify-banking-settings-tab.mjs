#!/usr/bin/env node
/** Banking Full Audit — Settings entry tab (design Settings). */
import fs from "node:fs";

export function run(root = process.cwd()) {
  const failures = [];
  const nav = fs.readFileSync(`${root}/apps/frontend/src/pages/banking/BANKING_NAV_CONFIG.ts`, "utf8");
  const paths = fs.readFileSync(`${root}/apps/frontend/src/router/route-manifest.ts`, "utf8");
  const home = fs.readFileSync(`${root}/apps/frontend/src/pages/banking/BankingHome.tsx`, "utf8");
  const manifest = fs.readFileSync(`${root}/apps/frontend/src/routes/manifest.tsx`, "utf8");
  if (!nav.includes('id: "settings"')) failures.push("BANKING_MODULE_TABS missing settings");
  if (!paths.includes('settings: "/banking/settings"')) failures.push("BANKING_TAB_PATH missing settings");
  if (!manifest.includes('path="/banking/settings"')) failures.push("manifest missing /banking/settings");
  if (!home.includes('activeTab === "settings"')) failures.push("BankingHome missing settings body");
  if (!home.includes("/banking/cash-gl-setup") || !home.includes("/banking/categorization-rules")) {
    failures.push("Settings tab must link Cash GL + categorization rules");
  }
  return failures;
}

if (process.argv.includes("--selftest")) {
  const tmp = fs.mkdtempSync("/tmp/verify-banking-settings-");
  for (const [rel, body] of Object.entries({
    "apps/frontend/src/pages/banking/BANKING_NAV_CONFIG.ts": 'id: "settings"\n',
    "apps/frontend/src/router/route-manifest.ts": 'settings: "/banking/settings"\n',
    "apps/frontend/src/routes/manifest.tsx": 'path="/banking/settings"\n',
    "apps/frontend/src/pages/banking/BankingHome.tsx":
      'activeTab === "settings"\n/banking/cash-gl-setup\n/banking/categorization-rules\n',
  })) {
    fs.mkdirSync(`${tmp}/${rel.split("/").slice(0, -1).join("/")}`, { recursive: true });
    fs.writeFileSync(`${tmp}/${rel}`, body);
  }
  if (run(tmp).length) throw new Error("expected PASS");
  fs.writeFileSync(`${tmp}/apps/frontend/src/pages/banking/BankingHome.tsx`, "x\n");
  if (!run(tmp).length) throw new Error("expected FAIL");
  fs.rmSync(tmp, { recursive: true, force: true });
  console.log("verify-banking-settings-tab --selftest OK");
} else {
  const failures = run();
  if (failures.length) {
    console.error("verify-banking-settings-tab FAIL:\n  " + failures.map((f) => "✗ " + f).join("\n  "));
    process.exit(1);
  }
  console.log("verify-banking-settings-tab — OK");
}
