#!/usr/bin/env node
/**
 * ACCT-F3568 — AccountsPayableAgingPage By Vendor Type must use ParityTable
 * (Search+Range+gear), not a raw HTML grouped table that skips the surface bar.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const PAGE = "apps/frontend/src/pages/accounting/AccountsPayableAgingPage.tsx";

function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}

/**
 * Strip backtick template-literal CONTENT (keep the delimiters) so a raw `<table>` inside a
 * print/export HTML string (this page's printLetter() bodyHtml — a standalone printable
 * document, never rendered as live React JSX) is not mistaken for a hand-rolled UI table. Same
 * class fixed for the sibling ACCT-F5522/ACCT-F5523 guards on this and ArApAgingPage.tsx.
 */
function stripTemplateLiterals(src) {
  return src.replace(/`(?:\\.|[^`\\])*`/g, "``");
}

/**
 * Pure, in-memory check — NEVER writes to disk. An earlier version of this guard's selftest
 * mutated the REAL file on disk directly (fs.writeFileSync(filePath, planted) then restored
 * after check()) — if check() threw before the restore line ran (exactly what happened when this
 * false positive first fired), the real file would be left corrupted. checkSource(src) takes the
 * source as a string so both the real run and the selftest operate purely in memory.
 */
export function checkSource(src, label = "AccountsPayableAgingPage") {
  assert(src.includes("ParityTable"), `${label}: must use ParityTable`);
  assert(src.includes('storageKey="acct-ap-aging-by-vendor"'), `${label}: by-vendor storageKey`);
  assert(src.includes('storageKey="acct-ap-aging-by-type"'), `${label}: by-type storageKey`);
  assert(src.includes('tableTestId="ap-aging-by-type-table"'), `${label}: by-type tableTestId`);
  assert(src.includes('data-testid="ap-aging-by-type-total"'), `${label}: by-type TOTAL strip`);
  assert(!/<table\b/.test(stripTemplateLiterals(src)), `${label}: must not use raw HTML table`);
  assert(!/GroupBlock/.test(src), `${label}: remove hand-rolled GroupBlock`);
  assert(src.includes("getApAgingByVendor"), `${label}: keep aging API`);
}

function selftest() {
  const good = fs.readFileSync(path.join(ROOT, PAGE), "utf8");
  checkSource(good);

  // Real raw <table> in LIVE JSX (outside any template literal) must still be caught.
  const liveTableBad = [
    "export function AccountsPayableAgingPage() {",
    '  return <table className="w-full" data-testid="ap-aging-by-type-table"><tbody /></table>;',
    "}",
    "",
  ].join("\n");
  let liveTableCaught = false;
  try {
    checkSource(liveTableBad, "mut-live-table");
  } catch {
    liveTableCaught = true;
  }
  assert(liveTableCaught, "selftest: expected FAIL on raw HTML table in live JSX");

  // A raw <table> INSIDE a backtick template literal (print-template shape) must NOT be flagged —
  // proves the exemption fires for the real file's own printLetter()-style bodyHtml pattern.
  const printTemplateOk = `
    export function AccountsPayableAgingPage() {
      const bodyHtml = \`<table><tbody /></table>\`;
      return (
        <div>
          <ParityTable storageKey="acct-ap-aging-by-vendor" />
          <ParityTable storageKey="acct-ap-aging-by-type" tableTestId="ap-aging-by-type-table" />
          <span data-testid="ap-aging-by-type-total">Total</span>
          {getApAgingByVendor}
        </div>
      );
    }
  `;
  checkSource(printTemplateOk, "mut-print-template");

  console.log("verify-ap-aging-parity-surface-bar --selftest PASS");
}

const args = process.argv.slice(2);
if (args.includes("--selftest")) {
  selftest();
} else {
  checkSource(fs.readFileSync(path.join(ROOT, PAGE), "utf8"));
  console.log("verify-ap-aging-parity-surface-bar PASS");
}
