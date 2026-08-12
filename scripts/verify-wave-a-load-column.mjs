#!/usr/bin/env node
/** @matrix-built {"modules":["accounting","dispatch","settlements","factoring","banking","vendors","drivers","safety","maintenance","insurance","fleet","fuel","cash-flow","reports"],"cols":["load"],"leafRe":".*","task":"WAVE-A-load","vertical":"column-wave"} */
import fs from "node:fs";

const checks = [
  ["apps/frontend/src/components/dispatch/PreSettlementPanel.tsx", /<EntityLink[\s\S]*kind="load"[\s\S]*id=\{settlement\.first_load_id\}[\s\S]*label=\{settlement\.first_load_number\}/],
  ["apps/frontend/src/components/dispatch/PreSettlementPanel.tsx", /<EntityLink[\s\S]*kind="load"[\s\S]*id=\{settlement\.last_load_id\}[\s\S]*label=\{settlement\.last_load_number\}/],
  ["apps/frontend/src/pages/banking/components/BankingPlaidConnectionsPanel.tsx", /<EntityLink kind="load" id=\{t\.matched_load_id\}/],
  ["apps/frontend/src/components/expenses/recordExpenseSubmit.ts", /values\.loadId\s*\?\s*\{\s*load_id:\s*values\.loadId\s*\}/],
  ["apps/frontend/src/components/insurance/ClaimCreateModal.tsx", /load_id:\s*form\.load_id\s*\|\|\s*null/],
  ["apps/frontend/src/pages/dispatch/BorderCrossingWizardPage.tsx", /load_id:\s*form\.loadId\s*\|\|\s*undefined/],
  ["apps/frontend/src/pages/safety/components/CargoClaimIntakeSurface.tsx", /load_id:\s*form\.loadId\s*\|\|\s*null/],
  ["apps/frontend/src/pages/reports/DispatchMarginPage.tsx", /<EntityLink kind="load" id=\{row\.load_id\}/],
];

const failures = checks.filter(([file, pattern]) => !pattern.test(fs.readFileSync(file, "utf8"))).map(([file]) => `${file}: load FK/link contract missing`);
if (failures.length) {
  console.error(`verify-wave-a-load-column FAIL:\n${failures.map((failure) => ` - ${failure}`).join("\n")}`);
  process.exit(1);
}
console.log("verify-wave-a-load-column PASS — load create FKs and reverse links ratcheted across the vertical matrix");
