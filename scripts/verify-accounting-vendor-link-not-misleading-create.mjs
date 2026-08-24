#!/usr/bin/env node
/** @matrix-built {"modules":["accounting"],"cols":["qbo_chrome"],"leafRe":"^accounting\\.subnav\\.(vendor_link|create_menu)$","task":"ACCOUNTING-VENDOR-LINK-NOT-MISLEADING-CREATE-CHROME-LAW-8","vertical":"column-wave"}
 *
 * Fully-Wired item 8 (chrome law): the app-wide "+ X" convention means "opens a create flow" —
 * AccountingSubNavWrapper.tsx's link to /vendors was a plain navigation shortcut (no modal, no
 * form) but used "+ Vendor", implying a create action that doesn't exist there. Relabeled to
 * "Go to vendors", matching the established plain-navigation-link convention (QboStyleHomePage.tsx's
 * "Go to registers").
 *
 * ACCT-F6322 — same file, second site: the header's "+ Create ▾" dropdown's Invoice/Expense/
 * Receive payment/Journal entry items pointed at bare list routes with no query param, so on a
 * page an item already targets (e.g. clicking "Invoice" while already on /accounting/invoices) it
 * was a genuine same-route silent no-op. Each target list page already ships a working `?create=1`
 * deep-link opener (ACCT-F5053–5056 — the same mechanism the global Topbar "+ Create" menu already
 * uses successfully, Topbar.tsx). ACCT-F6322 (PR #15531) wired CREATE_MENU to that existing opener
 * and extended `verify-acct-invoice-create-coa.mjs`/`verify-expenses-list-route.mjs` for
 * Invoice/Expense — but left Receive payment and Journal entry with no regression guard against
 * this exact class of subnav-menu drift. This guard closes that gap: it checks all 4 deep-linked
 * items plus New Bill (correctly left alone — /accounting/bills/vendor is itself the dedicated
 * create route, VendorBillCreatePage, not a list, so it needs no query param) in one place.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = "verify-accounting-vendor-link-not-misleading-create";
const FILE = "apps/frontend/src/pages/accounting/AccountingSubNavWrapper.tsx";
const CREATE_MENU_TARGETS = [
  { label: "Expense", to: "/accounting/expenses?create=1", targetFile: "apps/frontend/src/pages/accounting/ExpensesListPage.tsx" },
  { label: "Invoice", to: "/accounting/invoices?create=1", targetFile: "apps/frontend/src/pages/accounting/InvoicesListPage.tsx" },
  { label: "Receive payment", to: "/accounting/payments?create=1", targetFile: "apps/frontend/src/pages/accounting/PaymentsListPage.tsx" },
  { label: "Journal entry", to: "/accounting/journal-entries?create=1", targetFile: "apps/frontend/src/pages/accounting/ManualJEListPage.tsx" },
];

function audit(src, targetSrcs = {}) {
  const failures = [];
  if (!/to="\/vendors"[\s\S]{0,200}>\s*Go to vendors\s*</.test(src)) failures.push("the /vendors link must read 'Go to vendors'");
  if (/to="\/vendors"[\s\S]{0,200}>\s*\+\s*Vendor\s*</.test(src)) failures.push("the /vendors link must not use the misleading '+ Vendor' create-style label");
  if (!/label:\s*"New Bill",\s*to:\s*"\/accounting\/bills\/vendor"/.test(src)) {
    failures.push("the New Bill item must keep navigating straight to the dedicated create route /accounting/bills/vendor (no ?create=1 needed there)");
  }
  for (const item of CREATE_MENU_TARGETS) {
    const escapedTo = item.to.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    if (!new RegExp(`label:\\s*"${item.label}",\\s*to:\\s*"${escapedTo}"`).test(src)) {
      failures.push(`the ${item.label} item must deep-link to ${item.to} (its real, already-shipped create opener) instead of the bare list route`);
    }
    const targetSrc = targetSrcs[item.targetFile];
    if (targetSrc !== undefined && !/searchParams\.get\("create"\)\s*===\s*"1"/.test(targetSrc)) {
      failures.push(`${item.targetFile}: its own ?create=1 deep-link opener must still exist for the ${item.label} menu item to work`);
    }
  }
  return failures;
}

function readAll(files) {
  const out = {};
  for (const f of files) {
    const abs = path.join(ROOT, f);
    out[f] = fs.existsSync(abs) ? fs.readFileSync(abs, "utf8") : "";
  }
  return out;
}

const targetFiles = CREATE_MENU_TARGETS.map((i) => i.targetFile);

if (process.argv.includes("--selftest")) {
  const src = fs.readFileSync(path.join(ROOT, FILE), "utf8");
  const targetSrcs = readAll(targetFiles);
  if (audit(src, targetSrcs).length) {
    console.error(`${LABEL} SELFTEST FAIL — real repo state rejected:\n- ${audit(src, targetSrcs).join("\n- ")}`);
    process.exit(1);
  }
  let caught = 0;
  const mutations = [
    ["revert-vendor-label", (s) => s.replace(">\n            Go to vendors\n          </Link>", ">\n            + Vendor\n          </Link>")],
    ["strip-invoice-create-param", (s) => s.replace('"/accounting/invoices?create=1"', '"/accounting/invoices"')],
    ["strip-expense-create-param", (s) => s.replace('"/accounting/expenses?create=1"', '"/accounting/expenses"')],
    ["strip-payment-create-param", (s) => s.replace('"/accounting/payments?create=1"', '"/accounting/payments"')],
    ["strip-je-create-param", (s) => s.replace('"/accounting/journal-entries?create=1"', '"/accounting/journal-entries"')],
  ];
  for (const [name, mutate] of mutations) {
    const candidate = mutate(src);
    if (candidate === src || audit(candidate, targetSrcs).length === 0) {
      console.error(`${LABEL} SELFTEST FAIL — ${name}`);
      process.exit(1);
    }
    caught++;
  }
  const noOpenerTargets = { ...targetSrcs, [targetFiles[0]]: targetSrcs[targetFiles[0]].replace('searchParams.get("create") === "1"', "false") };
  if (audit(src, noOpenerTargets).length === 0) {
    console.error(`${LABEL} SELFTEST FAIL — missing-target-opener mutation escaped`);
    process.exit(1);
  }
  caught++;
  console.log(`${LABEL} SELFTEST PASS — ${caught} mutations detected`);
  process.exit(0);
}

const failures = audit(fs.readFileSync(path.join(ROOT, FILE), "utf8"), readAll(targetFiles));
if (failures.length) {
  console.error(`${LABEL} FAIL\n- ${failures.join("\n- ")}`);
  process.exit(1);
}
console.log(`${LABEL} PASS — accounting subnav's vendors link reads "Go to vendors"; Create menu's Invoice/Expense/Payment/JE items deep-link to their real ?create=1 openers, New Bill goes straight to its create route`);
