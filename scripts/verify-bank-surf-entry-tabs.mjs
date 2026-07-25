#!/usr/bin/env node
/**
 * BANK-F06 / BANK-SURF-05 — Factoring / Escrow / Relay / Plaid / Statement Import
 * entry tabs stay mounted (never-delete) with honest empty paths reachable.
 *
 * Self-test: node scripts/verify-bank-surf-entry-tabs.mjs --selftest
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

const FILES = {
  manifest: "apps/frontend/src/routes/manifest.tsx",
  nav: "apps/frontend/src/pages/banking/BANKING_NAV_CONFIG.ts",
  routes: "apps/frontend/src/router/route-manifest.ts",
  sidebar: "apps/frontend/src/components/layout/sidebar-config.ts",
  home: "apps/frontend/src/pages/banking/BankingHome.tsx",
};

const REQUIRED_PATHS = [
  "/banking/factoring",
  "/banking/driver-escrow",
  "/banking/relay",
  "/banking/plaid-connections",
  "/banking/statement-import",
];

const REQUIRED_TAB_IDS = [
  "factoring",
  "driver_escrow",
  "relay_card",
  "plaid_connections",
  "statement_import",
];

export function run(root = ROOT) {
  const failures = [];
  const read = (rel) => fs.readFileSync(path.join(root, rel), "utf8");
  const manifest = read(FILES.manifest);
  const nav = read(FILES.nav);
  const routes = read(FILES.routes);
  const sidebar = read(FILES.sidebar);
  const home = read(FILES.home);

  for (const p of REQUIRED_PATHS) {
    if (!manifest.includes(`path="${p}"`)) failures.push(`manifest missing path="${p}"`);
    if (!sidebar.includes(p)) failures.push(`sidebar flyout missing ${p}`);
  }

  for (const id of REQUIRED_TAB_IDS) {
    if (!nav.includes(`id: "${id}"`)) failures.push(`BANKING_MODULE_TABS missing ${id}`);
  }

  for (const p of REQUIRED_PATHS) {
    if (!routes.includes(`"${p}"`)) failures.push(`route-manifest missing "${p}"`);
  }

  // Home must still branch on these tabs (active path, not orphan routes).
  for (const id of ["factoring", "driver_escrow", "relay_card", "plaid_connections", "statement_import"]) {
    if (!home.includes(`"${id}"`) && !home.includes(`'${id}'`)) {
      failures.push(`BankingHome must reference tab id ${id}`);
    }
  }

  return failures;
}

if (process.argv.includes("--selftest")) {
  const tmp = fs.mkdtempSync("/tmp/verify-bank-surf-entry-");
  const mk = (rel, body) => {
    fs.mkdirSync(path.join(tmp, path.dirname(rel)), { recursive: true });
    fs.writeFileSync(path.join(tmp, rel), body);
  };
  const pathsBody = REQUIRED_PATHS.map((p) => `path="${p}"`).join("\n");
  const idsBody = REQUIRED_TAB_IDS.map((id) => `id: "${id}"`).join("\n");
  const quoted = REQUIRED_PATHS.map((p) => `"${p}"`).join("\n");
  const homeIds = REQUIRED_TAB_IDS.map((id) => `"${id}"`).join("\n");
  mk(FILES.manifest, pathsBody + "\n");
  mk(FILES.nav, idsBody + "\n");
  mk(FILES.routes, quoted + "\n");
  mk(FILES.sidebar, REQUIRED_PATHS.join("\n") + "\n");
  mk(FILES.home, homeIds + "\n");
  if (run(tmp).length) throw new Error("expected PASS: " + run(tmp).join("; "));
  mk(FILES.manifest, `path="/banking/factoring"\n`);
  if (!run(tmp).length) throw new Error("expected FAIL when paths missing");
  fs.rmSync(tmp, { recursive: true, force: true });
  console.log("verify-bank-surf-entry-tabs --selftest OK");
} else {
  const failures = run();
  if (failures.length) {
    console.error("verify-bank-surf-entry-tabs FAIL:\n  - " + failures.join("\n  - "));
    process.exit(1);
  }
  console.log("verify-bank-surf-entry-tabs — OK (BANK-SURF-05 structural)");
}
