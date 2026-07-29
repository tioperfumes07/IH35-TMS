#!/usr/bin/env node
/**
 * BANK-DOM-05 — intercompany create path mounted (no ORPHAN_NEW service).
 *
 * Complements verify-bank-dom-05-intercompany-reciprocal-legs.mjs (writer contract).
 * This guard pins HTTP + Banking Home TransferModal so operators can actually create
 * TRANSP↔USMCA/TRK legs. Scoreboard stays UNVERIFIED until live Neon transfer density > 0.
 *
 *   node scripts/verify-bank-dom-05-intercompany-route-ui.mjs
 *   node scripts/verify-bank-dom-05-intercompany-route-ui.mjs --selftest
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = "verify-bank-dom-05-intercompany-route-ui";

const FILES = {
  routes: "apps/backend/src/banking/transfers.routes.ts",
  service: "apps/backend/src/banking/transfers.service.ts",
  api: "apps/frontend/src/api/banking.ts",
  modal: "apps/frontend/src/pages/banking/TransferModal.tsx",
  list: "apps/frontend/src/pages/banking/TransfersListPage.tsx",
};

function read(rel) {
  return fs.readFileSync(path.join(ROOT, rel), "utf8");
}

function contractErrors(src) {
  const errors = [];

  if (!src.service.includes("export async function createIntercompanyTransfer")) {
    errors.push("transfers.service must export createIntercompanyTransfer");
  }

  if (!src.routes.includes("createIntercompanyTransfer")) {
    errors.push("transfers.routes must import/call createIntercompanyTransfer (was ORPHAN_NEW)");
  }
  if (!src.routes.includes('"/api/v1/banking/transfers/intercompany"')) {
    errors.push("POST /api/v1/banking/transfers/intercompany must be mounted");
  }
  if (!src.routes.includes('"/api/v1/banking/intercompany-pairs"')) {
    errors.push("GET /api/v1/banking/intercompany-pairs must be mounted");
  }
  if (!src.routes.includes('"/api/v1/banking/intercompany-transfers/:groupId"')) {
    errors.push("GET /api/v1/banking/intercompany-transfers/:groupId must be mounted");
  }
  if (!src.routes.includes("assertCompanyMembership(user.uuid, body.data.counterparty_company_id)")) {
    errors.push("intercompany create must assert membership on BOTH entities");
  }

  if (!src.api.includes("export function createIntercompanyTransfer") || !src.api.includes("/transfers/intercompany")) {
    errors.push("frontend banking.ts must export createIntercompanyTransfer client");
  }
  if (!src.api.includes("listIntercompanyPairs") || !src.api.includes("getIntercompanyTransferGroup")) {
    errors.push("frontend banking.ts must export listIntercompanyPairs + getIntercompanyTransferGroup");
  }

  if (!src.modal.includes("createIntercompanyTransfer") || !src.modal.includes("intercompany")) {
    errors.push("TransferModal must offer Intercompany scope calling createIntercompanyTransfer");
  }
  if (!src.modal.includes("listIntercompanyPairs")) {
    errors.push("TransferModal must load intercompany entity pairs for counterparty picker");
  }

  if (!src.list.includes("getIntercompanyTransferGroup") || !src.list.includes("intercompany_transfer_group_id")) {
    errors.push("TransfersListPage must reverse-drill intercompany_transfer_group_id");
  }

  return errors;
}

function selftest() {
  const bad = {
    routes: "export async function registerBankingTransfersRoutes() {}",
    service: "export async function createTransfer() {}",
    api: "export function createTransfer() {}",
    modal: "export function TransferModal() { return null }",
    list: "export function TransfersListPage() { return null }",
  };
  const errs = contractErrors(bad);
  if (errs.length < 6) throw new Error(`${LABEL} selftest expected many failures, got ${errs.length}`);
  console.log(`${LABEL} selftest PASS (${errs.length} planted failures)`);
}

function main() {
  if (process.argv.includes("--selftest")) {
    selftest();
    return;
  }
  const src = Object.fromEntries(Object.entries(FILES).map(([k, rel]) => [k, read(rel)]));
  const errors = contractErrors(src);
  if (errors.length) {
    console.error(`${LABEL} FAIL:`);
    for (const e of errors) console.error(`  - ${e}`);
    process.exit(1);
  }
  console.log(`${LABEL} PASS`);
}

main();
