#!/usr/bin/env node
/**
 * BANK-F04 / BANK-SURF-01 — Banking Home + account detail deep structural DoD.
 *
 * Frozen surface map: docs/trackers/BANK-08-SURF-SURFACE-MAP-2026-07-25.md
 * Desktop Expected vs Actual: ~/Desktop/IH35-CURSOR-AUDIT/modules/banking.md (BANK-F04)
 *
 * Asserts:
 *  - DOD-A: /banking → BankingHomePage; /banking/accounts/:id → BankAccountDetailPage; no ComingSoon twin
 *  - DOD-A / NEVER-DELETE: Factoring + Escrow tiles remain on Accounts home (AccountTilesRow, virtual feed KPIs)
 *  - VERIFY-3: banking API client calls /api/v1/banking/* (never RETIRE bank.*)
 *  - DOD-B: BankAccountDetail mounts BankingTransactionsDesignView (categorize-capable register)
 *
 * Does NOT flip scoreboard PASS — live browser TRANSP+USMCA click-through remains UNVERIFIED (Rule 23).
 *
 *   node scripts/verify-bank-surf-01-dod.mjs
 *   node scripts/verify-bank-surf-01-dod.mjs --selftest
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = "verify-bank-surf-01-dod";

const FILES = {
  map: "docs/trackers/BANK-08-SURF-SURFACE-MAP-2026-07-25.md",
  manifest: "apps/frontend/src/routes/manifest.tsx",
  home: "apps/frontend/src/pages/banking/BankingHome.tsx",
  detail: "apps/frontend/src/pages/banking/BankAccountDetail.tsx",
  tiles: "apps/frontend/src/pages/banking/components/AccountTilesRow.tsx",
  nav: "apps/frontend/src/pages/banking/BANKING_NAV_CONFIG.ts",
  routes: "apps/frontend/src/router/route-manifest.ts",
  api: "apps/frontend/src/api/banking.ts",
};

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

  if (!src.map.includes("BANK-SURF-01") || !src.map.includes("/banking")) {
    errors.push("frozen map missing BANK-SURF-01 → /banking");
  }

  const homeBlock = routeBlock(src.manifest, "/banking");
  if (!homeBlock) errors.push("DOD-A: missing route /banking");
  else {
    if (/ComingSoonPage/.test(homeBlock)) {
      errors.push("DOD-A: /banking must not mount ComingSoonPage");
    }
    if (!homeBlock.includes("<BankingHomePage")) {
      errors.push("DOD-A: /banking must render <BankingHomePage />");
    }
  }

  const detailBlock = routeBlock(src.manifest, "/banking/accounts/:id");
  if (!detailBlock) errors.push("DOD-A: missing route /banking/accounts/:id");
  else {
    if (/ComingSoonPage/.test(detailBlock)) {
      errors.push("DOD-A: account detail must not mount ComingSoonPage");
    }
    if (!detailBlock.includes("<BankAccountDetailPage")) {
      errors.push("DOD-A: /banking/accounts/:id must render <BankAccountDetailPage />");
    }
  }

  if (!src.nav.includes('id: "accounts"')) {
    errors.push("NEVER-DELETE: BANKING_MODULE_TABS must include accounts");
  }

  if (!src.home.includes("AccountTilesRow")) {
    errors.push("DOD-A: BankingHome must render AccountTilesRow (virtual bank tiles)");
  }
  for (const needle of [
    "getFactoringVirtual",
    "getBankingTiles",
    "factoringReserve",
    "escrowFeed",
    "driver_escrow",
  ]) {
    if (!src.home.includes(needle)) {
      errors.push(`NEVER-DELETE: BankingHome Accounts tab must reference ${needle}`);
    }
  }

  if (!src.tiles.includes("export function AccountTilesRow")) {
    errors.push("NEVER-DELETE: AccountTilesRow export must remain");
  }

  if (!src.detail.includes("export function BankAccountDetailPage")) {
    errors.push("DOD-B: BankAccountDetailPage export must remain live");
  }
  if (!src.detail.includes("BankingTransactionsDesignView")) {
    errors.push("DOD-B: account detail must mount BankingTransactionsDesignView (categorize-capable register)");
  }
  if (!src.detail.includes("ArchivedBankAccountDetailTable")) {
    errors.push("NEVER-DELETE: ArchivedBankAccountDetailTable must remain archived (not mounted as live path)");
  }

  if (/['`]bank\./.test(src.api) || /FROM\s+bank\./i.test(src.api)) {
    errors.push("VERIFY-3: apps/frontend/src/api/banking.ts must not reference RETIRE bank.*");
  }
  if (!/\/api\/v1\/banking/.test(src.api)) {
    errors.push("VERIFY-3: banking API client must call /api/v1/banking/*");
  }
  if (!src.api.includes("getBankingTiles") || !src.api.includes("/api/v1/banking/account-tiles")) {
    errors.push("VERIFY-3: getBankingTiles must call /api/v1/banking/account-tiles");
  }

  if (!src.routes.includes('{ path: "/banking"')) {
    errors.push("route-manifest ROUTE_MANIFEST must register /banking home");
  }
  if (!src.routes.includes("accounts: \"/banking\"")) {
    errors.push("BANKING_TAB_PATH must map accounts → /banking");
  }

  return errors;
}

function selftest() {
  const good = {
    map: "BANK-SURF-01 `/banking`",
    manifest: [
      'path="/banking"',
      "<BankingHomePage />",
      'path="/banking/accounts/:id"',
      "<BankAccountDetailPage />",
    ].join("\n"),
    home: [
      "AccountTilesRow",
      "getFactoringVirtual",
      "getBankingTiles",
      "factoringReserve",
      "escrowFeed",
      "driver_escrow",
    ].join("\n"),
    detail: [
      "export function BankAccountDetailPage",
      "BankingTransactionsDesignView",
      "ArchivedBankAccountDetailTable",
    ].join("\n"),
    tiles: "export function AccountTilesRow",
    nav: 'id: "accounts"',
    routes: '{ path: "/banking"\naccounts: "/banking"',
    api: 'getBankingTiles\n/api/v1/banking/account-tiles\n/api/v1/banking/dashboard/kpis',
  };
  if (contractErrors(good).length) {
    console.error(`${LABEL} --selftest FAIL good:`, contractErrors(good));
    process.exit(1);
  }
  const twin = { ...good, manifest: 'path="/banking"\n<ComingSoonPage />\n' };
  if (!contractErrors(twin).some((e) => e.includes("ComingSoon"))) {
    console.error(`${LABEL} --selftest FAIL ComingSoon twin not caught`);
    process.exit(1);
  }
  const noTiles = { ...good, home: "export function BankingHomePage(){ return null }" };
  if (!contractErrors(noTiles).some((e) => e.includes("AccountTilesRow"))) {
    console.error(`${LABEL} --selftest FAIL missing tiles not caught`);
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
  `${LABEL}: PASS — BANK-SURF-01 Home+Detail structural DoD (routes+tiles+register+canonical API); live browser still UNVERIFIED`
);
process.exit(0);
