#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import process from "node:process";

const repoRoot = process.cwd();

const INVOICES_LIST = "apps/frontend/src/pages/accounting/InvoicesListPage.tsx";
const CREATE_MODAL = "apps/frontend/src/pages/accounting/InvoiceCreateModal.tsx";

const failures = [];

const listPath = path.join(repoRoot, INVOICES_LIST);
if (!fs.existsSync(listPath)) {
  failures.push(`${INVOICES_LIST} (missing)`);
} else {
  const source = fs.readFileSync(listPath, "utf8");
  if (source.includes('navigate("/dispatch")') && source.includes("from_load")) {
    failures.push(`${INVOICES_LIST} (+ Create from_load must not navigate to /dispatch)`);
  }
  if (!source.includes("InvoiceCreateModal")) {
    failures.push(`${INVOICES_LIST} (must use InvoiceCreateModal for + Create flow)`);
  }
  if (!source.includes("setCreateFlowOpen")) {
    failures.push(`${INVOICES_LIST} (missing create-flow modal state)`);
  }
}

const modalPath = path.join(repoRoot, CREATE_MODAL);
if (!fs.existsSync(modalPath)) {
  failures.push(`${CREATE_MODAL} (missing)`);
} else {
  const source = fs.readFileSync(modalPath, "utf8");
  for (const marker of ["From an existing load", "Blank invoice", "data-invoice-create-modal"]) {
    if (!source.includes(marker)) failures.push(`${CREATE_MODAL} (missing marker: ${marker})`);
  }
  if (source.includes("/dispatch")) {
    failures.push(`${CREATE_MODAL} (must not link to /dispatch)`);
  }
}

if (failures.length > 0) {
  console.error("[verify-invoice-create-does-not-leave-accounting] FAIL:");
  for (const message of failures) console.error(`  - ${message}`);
  process.exit(1);
}

console.log("[verify-invoice-create-does-not-leave-accounting] OK — invoice + Create stays in /accounting/ context");
