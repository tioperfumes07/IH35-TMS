#!/usr/bin/env node
/**
 * ACCT-F3478 — Receipts / IntegrationTransactions / TransactionRegister keep
 * server-side search and must pass ParityTable suppressToolbarSearch.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const PAGES = [
  {
    rel: "apps/frontend/src/pages/accounting/ReceiptsPage.tsx",
    placeholder: "Search filename, notes…",
  },
  {
    rel: "apps/frontend/src/pages/accounting/IntegrationTransactionsPage.tsx",
    placeholder: "Search description, QBO ID…",
  },
  {
    rel: "apps/frontend/src/pages/accounting/TransactionRegisterPage.tsx",
    placeholder: "Description or customer / vendor / driver",
  },
];

function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}

export function checkPage(src, label, placeholder) {
  assert(src.includes("ParityTable"), `${label}: must use ParityTable`);
  assert(
    src.includes(`placeholder="${placeholder}"`) || src.includes(`placeholder='${placeholder}'`),
    `${label}: must keep server-side search placeholder ${placeholder}`,
  );
  assert(/suppressToolbarSearch/.test(src), `${label}: must pass suppressToolbarSearch`);
}

function selftest() {
  for (const { rel, placeholder } of PAGES) {
    const full = path.join(ROOT, rel);
    const good = fs.readFileSync(full, "utf8");
    checkPage(good, rel, placeholder);
    const bad = good.replace(/\n\s*suppressToolbarSearch\n/, "\n");
    let failed = false;
    try {
      checkPage(bad, `${rel}:mut`, placeholder);
    } catch {
      failed = true;
    }
    assert(failed, `selftest ${rel}: expected FAIL without suppressToolbarSearch`);
  }
  console.log("verify-accounting-register-lists-suppress-toolbar-search --selftest PASS");
}

if (process.argv.includes("--selftest")) {
  try {
    selftest();
  } catch (e) {
    console.error(`verify-accounting-register-lists-suppress-toolbar-search FAIL — ${e.message}`);
    process.exit(1);
  }
} else {
  try {
    for (const { rel, placeholder } of PAGES) {
      checkPage(fs.readFileSync(path.join(ROOT, rel), "utf8"), rel, placeholder);
    }
    console.log(
      "verify-accounting-register-lists-suppress-toolbar-search PASS — receipts/integration/register suppress toolbar search",
    );
  } catch (e) {
    console.error(`verify-accounting-register-lists-suppress-toolbar-search FAIL — ${e.message}`);
    process.exit(1);
  }
}
