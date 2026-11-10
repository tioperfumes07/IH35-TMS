#!/usr/bin/env node
/**
 * PERMANENT — Cursor complete-design build law + ROUND 8.5 finding ratchet.
 *
 * Prevents "census pin / chrome-only" from counting as design-complete and locks
 * source-level fixes for documented Codex visual findings until cleared.
 *
 *   node scripts/verify-complete-design-build-law.mjs
 *   node scripts/verify-complete-design-build-law.mjs --selftest
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = "verify-complete-design-build-law";

const LAW = path.join(ROOT, "docs/design/00-CURSOR-COMPLETE-DESIGN-BUILD-LAW.md");
const OWNER_LAW = path.join(ROOT, "docs/design/00-OWNER-DESIGN-LAW-READ-BEFORE-ANY-SCREEN.md");
const ROUTE_MAP = path.join(ROOT, "docs/design/DESIGN-BOARD-ROUTE-MAP.md");
const VERIFY_MD = path.join(ROOT, "docs/design/DESIGN-PARITY-VERIFY.md");

function read(rel) {
  return fs.readFileSync(path.join(ROOT, rel), "utf8");
}

function mustExist(abs, label) {
  if (!fs.existsSync(abs)) throw new Error(`missing ${label}: ${path.relative(ROOT, abs)}`);
}

/** Source-level locks for Codex ROUND 8.5 first visual batch (IDs from DESIGN-PARITY-VERIFY.md). */
function checkFindings() {
  const fails = [];

  const pageHeader = read("apps/frontend/src/components/layout/PageHeader.tsx");
  if (/fontSerif/.test(pageHeader)) fails.push("S2: PageHeader still forces typography.fontSerif");
  if (!/Inter,\s*ui-sans-serif/.test(pageHeader)) fails.push("S2: PageHeader must use Inter for H1");

  const titleCss = read("apps/frontend/src/index.css");
  if (!/\.text-page-title\s*\{[^}]*Inter/s.test(titleCss)) {
    fails.push("S2: .text-page-title must set Inter");
  }

  const insuranceLanding = read("apps/frontend/src/pages/insurance/InsuranceLanding.tsx");
  if (/lawsuits/.test(insuranceLanding)) fails.push("I5: InsuranceLanding subtitle still says lawsuits");
  if (!/coverage gaps/i.test(insuranceLanding)) {
    fails.push("I5: InsuranceLanding subtitle must include coverage gaps");
  }

  const insuranceBoard = read("apps/frontend/src/pages/insurance/components/InsuranceHomeBoard.tsx");
  if (!/dashed/.test(insuranceBoard) || !/Today/.test(insuranceBoard)) {
    fails.push("I2: InsuranceHomeBoard must render a shared dashed Today marker");
  }
  if (!/Fleet Covered/.test(insuranceBoard)) fails.push("I4: Fleet Covered footer missing");
  if (!/190px/.test(insuranceBoard)) fails.push("I1: Policy year label column 190px missing");

  const banking = read("apps/frontend/src/pages/banking/components/BankingHomeBoard.tsx");
  if (!/appearance=["']board["']/.test(banking)) {
    fails.push("B3: BankingHomeBoard ParityTables must use appearance=\"board\" (left body)");
  }
  if (!/minWidth:\s*120/.test(banking)) {
    fails.push("B1: Banking drift money columns need minWidth 120 (no money ellipsis)");
  }
  // Latest lines must appear before Pending in source order (board: summaries → Latest).
  const latestIdx = banking.indexOf('title="Latest lines"');
  const pendingIdx = banking.indexOf("Pending ·");
  if (latestIdx < 0 || pendingIdx < 0 || latestIdx > pendingIdx) {
    fails.push("B2: Latest lines must render immediately after summary panels (before Pending)");
  }

  const acct = read("apps/frontend/src/pages/accounting/AccountingHubPage.tsx");
  if (!/1\.2fr_1\.2fr_1fr/.test(acct)) {
    fails.push("A2: Accounting hub lower grid must use 1.2fr / 1.2fr / 1fr");
  }

  const tokens = read("apps/frontend/src/design/tokens.ts");
  if (!/topbarHeight:\s*42/.test(tokens)) fails.push("S1: spacing.topbarHeight must be 42 (board header)");
  if (!/sidebarWidth:\s*66/.test(tokens)) fails.push("S1: spacing.sidebarWidth must be 66 (board rail)");

  const navCss = read("apps/frontend/src/components/forms/shared/HoverDropdownNav.css");
  if (!/COMPLETE-DESIGN-BUILD-LAW|board-viewport-single-row/.test(navCss)) {
    fails.push("A1: HoverDropdownNav.css must lock single-row menubar at board viewport");
  }

  const parity = read("apps/frontend/src/components/parity/ParityTable.tsx");
  if (!/moneyNeverEllipsis|kind === "money" \?/.test(parity)) {
    fails.push('B1/shared: ParityTable must not ellipsis kind:"money" cells');
  }

  const truckMap = read("apps/frontend/src/pages/fleet/components/TruckServiceMap.tsx");
  if (!/truckProfileBoardSvgHtml/.test(truckMap) || !/Odometer · Samsara/.test(truckMap)) {
    fails.push("TruckProfile: TruckServiceMap must embed board SVG + Odometer/Now/Driver/Load chips");
  }
  if (!fs.existsSync(path.join(ROOT, "apps/frontend/src/pages/fleet/components/truckProfileBoardSvg.ts"))) {
    fails.push("TruckProfile: missing truckProfileBoardSvg.ts (990×520 board SVG)");
  }

  const shopBay = read("apps/frontend/src/pages/maintenance/components/InShopBoard.tsx");
  if (!/ShopBayFloorSvg/.test(shopBay)) {
    fails.push("ShopBays: InShopBoard must mount ShopBayFloorSvg board floor graphics");
  }
  if (!fs.existsSync(path.join(ROOT, "apps/frontend/src/pages/maintenance/components/ShopBayFloorSvg.tsx"))) {
    fails.push("ShopBays: missing ShopBayFloorSvg.tsx (300×330 bay SVG)");
  }

  return fails;
}

function checkLawDocs() {
  mustExist(LAW, "complete-design law");
  mustExist(OWNER_LAW, "owner design law");
  mustExist(ROUTE_MAP, "board route map");
  mustExist(VERIFY_MD, "parity verify ledger");
  const law = fs.readFileSync(LAW, "utf8");
  for (const needle of [
    "board-identical",
    "all tabs",
    "Hard FAIL",
    "Census hub-label",
    "DESIGN-BOARD-ROUTE-MAP",
  ]) {
    if (!law.includes(needle)) throw new Error(`law doc missing required phrase: ${needle}`);
  }
}

function selftest() {
  checkLawDocs();
  // Selftest only checks docs + that the checker runs; finding asserts apply on normal run.
  console.log(`${LABEL} selftest PASS`);
}

function main() {
  if (process.argv.includes("--selftest")) {
    selftest();
    return;
  }
  checkLawDocs();
  const fails = checkFindings();
  if (fails.length) {
    console.error(`${LABEL} FAIL — ${fails.length} locked finding(s):`);
    for (const f of fails) console.error(`  - ${f}`);
    process.exit(1);
  }
  console.log(`${LABEL} PASS — law present; ROUND 8.5 source locks green`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    main();
  } catch (e) {
    console.error(`${LABEL} FAIL — ${e.message}`);
    process.exit(1);
  }
}

export { checkFindings, checkLawDocs };
