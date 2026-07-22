#!/usr/bin/env node
/**
 * verify-settlement-payrun-fe-wired.mjs  (LAW-E2E #3168 hop 3)
 *
 * Root cause: GET …/payrun-preview and POST …/payrun-close are mounted on the backend
 * (settlement-payrun-close.routes.ts) but had ZERO frontend callers — Law-of-the-Land FAIL.
 *
 * Fix: Settlement detail PayRunClosePanel + driverFinance client must call both endpoints;
 * CoA designation errors must fail-loud with a link to /accounting/settings/coa-roles;
 * posted results must reverse-link journal_entry_id via EntityLink.
 *
 * Usage:
 *   node scripts/verify-settlement-payrun-fe-wired.mjs
 *   node scripts/verify-settlement-payrun-fe-wired.mjs --selftest
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = "verify-settlement-payrun-fe-wired";

const API = "apps/frontend/src/api/driverFinance.ts";
const PANEL = "apps/frontend/src/pages/driver-finance/components/PayRunClosePanel.tsx";
const DETAIL = "apps/frontend/src/pages/driver-finance/SettlementDetailPage.tsx";
const ROUTES = "apps/backend/src/driver-finance/settlement-payrun-close.routes.ts";

/** Pure checks — takes text so --selftest can inject fixtures. */
export function check({ api, panel, detail, routes }) {
  const f = [];

  if (!routes) {
    f.push(`${ROUTES}: missing`);
  } else {
    if (!/\/payrun-preview/.test(routes)) f.push(`${ROUTES}: must mount GET payrun-preview`);
    if (!/\/payrun-close/.test(routes)) f.push(`${ROUTES}: must mount POST payrun-close`);
  }

  if (!api) {
    f.push(`${API}: missing`);
  } else {
    if (!/payrun-preview/.test(api)) f.push(`${API}: must call /payrun-preview`);
    if (!/payrun-close/.test(api)) f.push(`${API}: must call /payrun-close`);
    if (!/previewSettlementPayRun/.test(api)) f.push(`${API}: must export previewSettlementPayRun`);
    if (!/closeSettlementPayRun/.test(api)) f.push(`${API}: must export closeSettlementPayRun`);
    if (!/DRIVER_PAY_ACCOUNT_MISSING/.test(api)) {
      f.push(`${API}: must recognize DRIVER_PAY_ACCOUNT_MISSING (CoA fail-loud set)`);
    }
  }

  if (!panel) {
    f.push(`${PANEL}: missing`);
  } else {
    if (!/previewSettlementPayRun/.test(panel)) f.push(`${PANEL}: Preview must call previewSettlementPayRun`);
    if (!/closeSettlementPayRun/.test(panel)) f.push(`${PANEL}: Close must call closeSettlementPayRun`);
    if (!/payrun-preview-button/.test(panel) || !/payrun-close-button/.test(panel)) {
      f.push(`${PANEL}: must expose payrun-preview-button and payrun-close-button`);
    }
    if (!/\/accounting\/settings\/coa-roles/.test(panel)) {
      f.push(`${PANEL}: CoA designation errors must link to /accounting/settings/coa-roles`);
    }
    if (!/EntityLink/.test(panel) || !/journal_entry/.test(panel)) {
      f.push(`${PANEL}: posted JE must reverse-link via EntityLink kind=journal_entry`);
    }
    if (!/je_preview/.test(panel) || !/payrun-je-legs/.test(panel)) {
      f.push(`${PANEL}: must render je_preview legs`);
    }
    if (!/posting_enabled/.test(panel)) {
      f.push(`${PANEL}: must surface posting_enabled (flag OFF = preview, not UNVERIFIED theater)`);
    }
    // Dead-button ban: onClick must not be empty.
    if (/onClick=\{\(\)\s*=>\s*\{\s*\}\}/.test(panel)) {
      f.push(`${PANEL}: dead empty onClick forbidden`);
    }
  }

  if (!detail) {
    f.push(`${DETAIL}: missing`);
  } else {
    if (!/PayRunClosePanel/.test(detail)) {
      f.push(`${DETAIL}: must mount PayRunClosePanel (no orphan component)`);
    }
    if (!/from ["'].*PayRunClosePanel["']/.test(detail) && !/from ["']\.\/components\/PayRunClosePanel["']/.test(detail)) {
      f.push(`${DETAIL}: must import PayRunClosePanel`);
    }
  }

  return f;
}

export function run() {
  const read = (rel) => {
    try {
      return fs.readFileSync(path.join(ROOT, rel), "utf8");
    } catch {
      return null;
    }
  };
  return check({
    api: read(API),
    panel: read(PANEL),
    detail: read(DETAIL),
    routes: read(ROUTES),
  });
}

if (process.argv.includes("--selftest")) {
  const goodApi = `
    export function previewSettlementPayRun() {
      return apiRequest("/api/v1/driver-finance/settlements/x/payrun-preview?");
    }
    export function closeSettlementPayRun() {
      return apiRequest("/api/v1/driver-finance/settlements/x/payrun-close", { method: "POST" });
    }
    export const PAYRUN_COA_ERROR_CODES = new Set(["DRIVER_PAY_ACCOUNT_MISSING"]);
  `;
  const goodPanel = `
    import { EntityLink } from "...";
    previewSettlementPayRun(...);
    closeSettlementPayRun(...);
    data-testid="payrun-preview-button"
    data-testid="payrun-close-button"
    to="/accounting/settings/coa-roles"
    kind="journal_entry"
    result.je_preview
    data-testid="payrun-je-legs"
    posting_enabled
    onClick={() => void runPreview()}
  `;
  const goodDetail = `
    import { PayRunClosePanel } from "./components/PayRunClosePanel";
    <PayRunClosePanel settlementId={settlementId} />
  `;
  const goodRoutes = `
    app.get("/api/v1/driver-finance/settlements/:id/payrun-preview"
    app.post("/api/v1/driver-finance/settlements/:id/payrun-close"
  `;
  const badPanel = `
    <button onClick={() => {}}>Preview</button>
  `;
  const checks = [
    ["wired set passes", check({ api: goodApi, panel: goodPanel, detail: goodDetail, routes: goodRoutes }).length === 0],
    ["missing preview call fails", check({ api: goodApi.replace("payrun-preview", "noop"), panel: goodPanel, detail: goodDetail, routes: goodRoutes }).length > 0],
    ["dead button fails", check({ api: goodApi, panel: badPanel, detail: goodDetail, routes: goodRoutes }).length > 0],
    ["unmounted panel fails", check({ api: goodApi, panel: goodPanel, detail: "no panel here", routes: goodRoutes }).length > 0],
  ];
  const failed = checks.filter(([, ok]) => !ok);
  if (failed.length) {
    console.error(`${LABEL} --selftest FAIL:`);
    for (const [n] of failed) console.error("  ✗ " + n);
    process.exit(1);
  }
  console.log(`${LABEL} --selftest PASS (${checks.length} checks)`);
  process.exit(0);
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  const failures = run();
  if (failures.length) {
    console.error(`${LABEL} FAIL:`);
    for (const msg of failures) console.error("  ✗ " + msg);
    process.exit(1);
  }
  console.log(`${LABEL} PASS (pay-run preview/close FE wired; no dead callers)`);
}
