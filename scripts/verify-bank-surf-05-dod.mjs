#!/usr/bin/env node
/**
 * BANK-F06 / BANK-SURF-05 — Factoring / Escrow / Relay / Plaid / Statement Import
 * entry tabs deep structural DoD (never-delete TMS-only modules).
 *
 * Frozen surface map: docs/trackers/BANK-08-SURF-SURFACE-MAP-2026-07-25.md
 * Desktop Expected vs Actual: ~/Desktop/IH35-CURSOR-AUDIT/modules/banking.md (BANK-F06)
 *
 * Asserts:
 *  - DOD-A: each entry route mounts BankingHomePage with correct initialTab — no ComingSoon twin
 *  - DOD-A: active tab bodies wired (factoring summary, DriverEscrowTabContent, relay panel,
 *    StatementUpload, BankingPlaidConnectionsPanel)
 *  - VERIFY-7: sidebar flyout + BANKING_MODULE_TABS retain all five entry tabs (never-delete)
 *
 * Does NOT flip scoreboard PASS — live browser click-through + honest-empty economics UNVERIFIED (Rule 23).
 *
 *   node scripts/verify-bank-surf-05-dod.mjs
 *   node scripts/verify-bank-surf-05-dod.mjs --selftest
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = "verify-bank-surf-05-dod";

const FILES = {
  map: "docs/trackers/BANK-08-SURF-SURFACE-MAP-2026-07-25.md",
  manifest: "apps/frontend/src/routes/manifest.tsx",
  home: "apps/frontend/src/pages/banking/BankingHome.tsx",
  nav: "apps/frontend/src/pages/banking/BANKING_NAV_CONFIG.ts",
  routes: "apps/frontend/src/router/route-manifest.ts",
  sidebar: "apps/frontend/src/components/layout/sidebar-config.ts",
};

const ENTRY_ROUTES = [
  { path: "/banking/factoring", initialTab: "factoring", tabId: "factoring" },
  { path: "/banking/driver-escrow", initialTab: "driver_escrow", tabId: "driver_escrow" },
  { path: "/banking/relay", initialTab: "relay_card", tabId: "relay_card" },
  { path: "/banking/plaid-connections", initialTab: "plaid_connections", tabId: "plaid_connections" },
  { path: "/banking/statement-import", initialTab: "statement_import", tabId: "statement_import" },
];

const SIDEBAR_PATHS = [
  "/banking/factoring",
  "/banking/driver-escrow",
  "/banking/relay",
  "/banking/plaid-connections",
  "/banking/statement-import",
];

function read(rel) {
  return fs.readFileSync(path.join(ROOT, rel), "utf8");
}

function routeBlock(manifest, routePath) {
  const escaped = routePath.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const re = new RegExp(`path=["']${escaped}["'][\\s\\S]{0,600}?(?=path=["']|$)`);
  const m = manifest.match(re);
  return m ? m[0] : "";
}

function contractErrors(src) {
  const errors = [];

  if (!src.map.includes("BANK-SURF-05") || !src.map.includes("/banking/factoring")) {
    errors.push("frozen map missing BANK-SURF-05 entry routes");
  }

  for (const { path: routePath, initialTab } of ENTRY_ROUTES) {
    const block = routeBlock(src.manifest, routePath);
    if (!block) {
      errors.push(`DOD-A: missing route ${routePath}`);
      continue;
    }
    if (/ComingSoonPage/.test(block)) {
      errors.push(`DOD-A: ${routePath} must not mount ComingSoonPage`);
    }
    if (!block.includes("<BankingHomePage")) {
      errors.push(`DOD-A: ${routePath} must render <BankingHomePage />`);
    }
    if (!block.includes(`initialTab="${initialTab}"`)) {
      errors.push(`DOD-A: ${routePath} must pass initialTab="${initialTab}"`);
    }
  }

  for (const { tabId } of ENTRY_ROUTES) {
    if (!src.nav.includes(`id: "${tabId}"`)) {
      errors.push(`VERIFY-7 / NEVER-DELETE: BANKING_MODULE_TABS missing ${tabId}`);
    }
  }

  for (const p of SIDEBAR_PATHS) {
    if (!src.sidebar.includes(p)) {
      errors.push(`VERIFY-7: sidebar flyout missing ${p}`);
    }
  }

  for (const p of SIDEBAR_PATHS) {
    if (!src.routes.includes(`"${p}"`)) {
      errors.push(`route-manifest missing "${p}"`);
    }
  }

  const tabBodies = [
    ['activeTab === "factoring"', "factoring tab body"],
    ["DriverEscrowTabContent", "Driver Escrow tab content"],
    ['activeTab === "relay_card"', "Relay Card tab body"],
    ["StatementUpload", "Statement Import uploader"],
    ["BankingPlaidConnectionsPanel", "Plaid Connections panel"],
  ];
  for (const [needle, label] of tabBodies) {
    if (!src.home.includes(needle)) {
      errors.push(`DOD-A: BankingHome must wire ${label} (${needle})`);
    }
  }

  if (!src.home.includes('navigate("/factoring"') && !src.home.includes('to="/factoring"')) {
    errors.push("DOD-A: Factoring tab must deep-link into /factoring module (thin entry, not orphan)");
  }

  return errors;
}

function selftest() {
  const pathsBody = ENTRY_ROUTES.map(
    ({ path: routePath, initialTab }) =>
      `path="${routePath}"\n<BankingHomePage initialTab="${initialTab}" />`
  ).join("\n");
  const idsBody = ENTRY_ROUTES.map(({ tabId }) => `id: "${tabId}"`).join("\n");
  const good = {
    map: "BANK-SURF-05 /banking/factoring",
    manifest: pathsBody,
    nav: idsBody,
    routes: SIDEBAR_PATHS.map((p) => `"${p}"`).join("\n"),
    sidebar: SIDEBAR_PATHS.join("\n"),
    home: [
      'activeTab === "factoring"',
      "DriverEscrowTabContent",
      'activeTab === "relay_card"',
      "StatementUpload",
      "BankingPlaidConnectionsPanel",
      'to="/factoring"',
    ].join("\n"),
  };
  if (contractErrors(good).length) {
    console.error(`${LABEL} --selftest FAIL good:`, contractErrors(good));
    process.exit(1);
  }
  const twin = {
    ...good,
    manifest: 'path="/banking/factoring"\n<ComingSoonPage />\n',
  };
  if (!contractErrors(twin).some((e) => e.includes("ComingSoon"))) {
    console.error(`${LABEL} --selftest FAIL ComingSoon twin not caught`);
    process.exit(1);
  }
  console.log(`${LABEL}: selftest PASS`);
}

if (process.argv.includes("--selftest")) {
  selftest();
  process.exit(0);
}

const src = Object.fromEntries(Object.entries(FILES).map(([k, rel]) => [k, read(rel)]));
const errors = contractErrors(src);
if (errors.length) {
  console.error(`${LABEL}: FAIL`);
  for (const e of errors) console.error(`  - ${e}`);
  process.exit(1);
}
console.log(
  `${LABEL}: PASS — BANK-SURF-05 entry-tabs structural DoD (routes+tab bodies+sidebar); live browser still UNVERIFIED`
);
process.exit(0);
