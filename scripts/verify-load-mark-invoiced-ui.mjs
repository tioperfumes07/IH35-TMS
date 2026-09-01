#!/usr/bin/env node
/**
 * DISPATCH-MARK-INVOICED-UI — completed_docs_received loads had no live path to invoiced.
 * toDispatchTransitionStatus("invoiced") collapsed to completed_docs_received, so updateLoadStatus
 * never reached PATCH /mdata/loads/:id/status where allowedStatusTransitions permits
 * completed_docs_received→invoiced and re-enters ensureDriverBillArtifactsForLoad.
 *
 *   node scripts/verify-load-mark-invoiced-ui.mjs
 *   node scripts/verify-load-mark-invoiced-ui.mjs --selftest
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = "verify-load-mark-invoiced-ui";
const API = "apps/frontend/src/api/loads.ts";
const DRAWER = "apps/frontend/src/components/dispatch/LoadDetailDrawer.tsx";
const SM = "packages/shared-types/src/dispatch/load-state-machine.ts";

function read(rel) {
  const p = path.join(ROOT, rel);
  return fs.existsSync(p) ? fs.readFileSync(p, "utf8") : null;
}

export function assertGuard({ api, drawer, sm }) {
  const errs = [];

  if (!api?.includes("MDATA_LIFECYCLE_STATUS_TARGETS") || !api?.includes('"invoiced"')) {
    errs.push(`${API}: must define MDATA_LIFECYCLE_STATUS_TARGETS including invoiced`);
  }
  if (!/MDATA_LIFECYCLE_STATUS_TARGETS\.has\(body\.new_status\)/.test(api ?? "")) {
    errs.push(`${API}: updateLoadStatus must route invoiced/paid/closed through mdata status PATCH before dispatch transition remap`);
  }
  if (!/function patchMdataLoadStatus/.test(api ?? "") || !api?.includes("/mdata/loads/${id}/status")) {
    errs.push(`${API}: must centralize mdata status PATCH in patchMdataLoadStatus`);
  }

  if (!sm?.includes("loadCanMarkInvoiced")) {
    errs.push(`${SM}: must expose loadCanMarkInvoiced for completed_docs_received loads`);
  }
  if (!/loadCanMarkInvoiced[\s\S]*completed_docs_received/.test(sm ?? "")) {
    errs.push(`${SM}: loadCanMarkInvoiced must gate on completed_docs_received exactly`);
  }

  if (!drawer?.includes("loadCanMarkInvoiced")) {
    errs.push(`${DRAWER}: must import and use loadCanMarkInvoiced`);
  }
  if (!drawer?.includes('data-testid="load-mark-invoiced-button"')) {
    errs.push(`${DRAWER}: Mark invoiced button must be reachable with data-testid load-mark-invoiced-button`);
  }
  if (!drawer?.includes('new_status: "invoiced"')) {
    errs.push(`${DRAWER}: Mark invoiced must PATCH new_status invoiced (mdata lifecycle)`);
  }
  if (!/Mark invoiced/.test(drawer ?? "")) {
    errs.push(`${DRAWER}: button label must read Mark invoiced`);
  }

  return errs;
}

function selftest() {
  const goodApi = `
    const MDATA_LIFECYCLE_STATUS_TARGETS = new Set(["invoiced", "paid", "closed"]);
    function patchMdataLoadStatus(id, body, operatingCompanyId) {
      return apiRequest(\`/api/v1/mdata/loads/\${id}/status?\`, { method: "PATCH", body });
    }
    export function updateLoadStatus(id, body, operatingCompanyId) {
      if (MDATA_LIFECYCLE_STATUS_TARGETS.has(body.new_status)) {
        return patchMdataLoadStatus(id, body, operatingCompanyId);
      }
    }
  `;
  const goodSm = `export function loadCanMarkInvoiced(s) { return String(s ?? "").trim() === "completed_docs_received"; }`;
  const goodDrawer = `
    loadCanMarkInvoiced(load.status)
    data-testid="load-mark-invoiced-button"
    new_status: "invoiced"
    Mark invoiced
  `;

  const good = assertGuard({ api: goodApi, sm: goodSm, drawer: goodDrawer });
  if (good.length) {
    console.error(`${LABEL} --selftest FAIL good (${good.length}): ${good.join("; ")}`);
    process.exit(1);
  }

  const bad1 = assertGuard({ api: goodApi.replace(/if \(MDATA_LIFECYCLE_STATUS_TARGETS[\s\S]*?\}\s*\n/, ""), sm: goodSm, drawer: goodDrawer });
  const bad2 = assertGuard({ api: goodApi, sm: goodSm.replace("completed_docs_received", "invoiced"), drawer: goodDrawer });
  const bad3 = assertGuard({ api: goodApi, sm: goodSm, drawer: goodDrawer.replace("load-mark-invoiced-button", "") });

  for (const [name, res] of [
    ["bad1-no-mdata-bypass", bad1],
    ["bad2-wrong-gate", bad2],
    ["bad3-no-button", bad3],
  ]) {
    if (res.length === 0) {
      console.error(`${LABEL} --selftest FAIL ${name}: mutation not caught`);
      process.exit(1);
    }
  }
  console.log(`${LABEL} --selftest PASS 3/3 mutations caught`);
}

if (process.argv.includes("--selftest")) {
  selftest();
  process.exit(0);
}

const api = read(API);
const drawer = read(DRAWER);
const sm = read(SM);
if ([api, drawer, sm].some((f) => f == null)) {
  console.error(`[${LABEL}] FAILED — missing source file`);
  process.exit(1);
}
const errs = assertGuard({ api, drawer, sm });
if (errs.length) {
  console.error(`[${LABEL}] FAILED — ${errs.length} issue(s):`);
  for (const e of errs) console.error(`  ✗ ${e}`);
  process.exit(1);
}
console.log(`[${LABEL}] OK — completed_docs_received loads have a real Mark invoiced path via mdata status PATCH`);
