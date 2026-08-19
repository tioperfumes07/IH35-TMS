#!/usr/bin/env node
/**
 * ACCT-F3464 / ACCT-F3568 / LV-AP-AGING-DUPLICATE-SEARCH
 * Both A/P Aging views use ParityTable Search — no page-level TableSearch (duplex).
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const TARGET = path.join(ROOT, "apps/frontend/src/pages/accounting/AccountsPayableAgingPage.tsx");

function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}

/**
 * Strip backtick template-literal CONTENT (keep the delimiters) so a raw `<table>` inside a
 * print/export HTML string (e.g. printLetter()'s bodyHtml template — a standalone printable
 * document, never rendered as live React JSX) is not mistaken for a hand-rolled UI table.
 */
function stripTemplateLiterals(src) {
  return src.replace(/`(?:\\.|[^`\\])*`/g, "``");
}

export function checkSource(src, label = "AccountsPayableAgingPage.tsx") {
  assert(src.includes("ParityTable"), `${label}: must use ParityTable`);
  assert(src.includes('tableTestId="ap-aging-by-vendor-table"'), `${label}: by-vendor table test id required`);
  assert(src.includes('tableTestId="ap-aging-by-type-table"'), `${label}: by-type table test id required`);
  assert(src.includes('storageKey="acct-ap-aging-by-type"'), `${label}: by-type storageKey required`);
  assert(!/<table\b/.test(stripTemplateLiterals(src)), `${label}: must not use raw HTML table`);
  assert(!/TableSearch/.test(src), `${label}: no page TableSearch (ParityTable owns Search)`);
  assert(!/placeholder=["']Search vendor…["']/.test(src), `${label}: no duplex Search vendor placeholder`);
  // By-vendor filterBar must not contain Search vendor TableSearch
  const byVendorBlock = src.slice(src.indexOf('tableTestId="ap-aging-by-vendor-table"'), src.indexOf("ap-aging-by-vendor-total"));
  assert(
    !/Search vendor/.test(byVendorBlock),
    `${label}: by-vendor filterBar must not include Search vendor (use ParityTable toolbar)`,
  );
  assert(src.includes("vendorTableRows"), `${label}: by-vendor rows must be typeFiltered (vendorTableRows)`);
}

function selftest() {
  const good = fs.readFileSync(TARGET, "utf8");
  checkSource(good, "real");
  const bad = good.replace(
    /filterBar=\{\s*<span className="text-\[11px\] text-slate-500">\{typeFiltered\.length\} rows<\/span>\s*\}/,
    `filterBar={
              <div className="w-56"><TableSearch value={search} onChange={setSearch} placeholder="Search vendor…" /></div>
            }`,
  );
  let failed = false;
  try {
    checkSource(bad, "mut-dup");
  } catch {
    failed = true;
  }
  assert(failed, "selftest expected FAIL when Search vendor returns to by-vendor filterBar");

  // Real raw <table> in LIVE JSX (not inside a template literal) must still be caught — the
  // template-literal strip must not become a blanket escape hatch for a genuine hand-rolled table.
  const liveTable = good.replace("<ParityTable", "<table />\n      <ParityTable");
  let liveTableCaught = false;
  try {
    checkSource(liveTable, "mut-live-table");
  } catch {
    liveTableCaught = true;
  }
  assert(liveTableCaught, "selftest expected FAIL when a raw <table> appears in live JSX (outside any template literal)");

  console.log("verify-ap-aging-no-dup-search --selftest PASS");
}

if (process.argv.includes("--selftest")) {
  try {
    selftest();
  } catch (e) {
    console.error(`verify-ap-aging-no-dup-search FAIL — ${e.message}`);
    process.exit(1);
  }
} else {
  try {
    checkSource(fs.readFileSync(TARGET, "utf8"));
    console.log("verify-ap-aging-no-dup-search PASS — both views use ParityTable search only");
  } catch (e) {
    console.error(`verify-ap-aging-no-dup-search FAIL — ${e.message}`);
    process.exit(1);
  }
}
