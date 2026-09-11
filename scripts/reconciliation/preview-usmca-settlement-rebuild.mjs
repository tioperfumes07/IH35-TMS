#!/usr/bin/env node
/**
 * PREVIEW-USMCA-SETTLEMENT-REBUILD — writes NOTHING. Proves the 21 signed-doc settlements are
 * internally consistent to the penny before any live post (maker-checker gate).
 *
 * Reads the two committed signed-doc CSVs:
 *   docs/reconciliation/2026-09-07-usmca/usmca-settlements-from-signed-docs.csv   (21 headers)
 *   docs/reconciliation/2026-09-07-usmca/usmca-settlement-lines-from-signed-docs.csv (161 lines)
 *
 * Sign model (verified against doc 5774 = 1107.42 and 5778 = 1245.26):
 *   earnings   loaded_pay / empty_pay / additional_pay  → positive
 *   reimbursed deduction / reimbursement (fuel, washout, toll, parking, lumper, scale) → positive
 *   withheld   escrow / admin_fee / cash_advance        → stored NEGATIVE in the CSV
 * Therefore net(doc) = plain SUM(amount) over that doc's lines, and it MUST equal header total_due.
 *
 * Also asserts the header decomposition:
 *   salary          == Σ(loaded_pay + empty_pay)
 *   additional_pay  == Σ(additional_pay)
 *   reimbursed      == Σ(deduction + reimbursement)
 *   deductions      == Σ(escrow + admin_fee + cash_advance)
 *
 * Exit 0 only if every doc ties to the penny AND the grand total == 27487.36.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const DIR = path.join(ROOT, "docs/reconciliation/2026-09-07-usmca");
const HEADERS_CSV = path.join(DIR, "usmca-settlements-from-signed-docs.csv");
const LINES_CSV = path.join(DIR, "usmca-settlement-lines-from-signed-docs.csv");

const EXPECTED_GRAND_TOTAL = 44234.51; // 32 in-scope USMCA tours 5769-5800 (Faro-era). 5797-5800 added 2026-09-11 (rebuild blocker 1, hand-extracted from the 4 signed PDFs Driver_Settlement_5797..5800.pdf, each tied to its own header TOTAL DUE to the penny). Was 37830.87/28 docs before.
const EXPECTED_DOC_COUNT = 32;

/** RFC-4180-ish CSV parser (handles quoted fields with embedded commas). */
function parseCsv(text) {
  const rows = [];
  let row = [];
  let field = "";
  let inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') { field += '"'; i++; }
        else inQuotes = false;
      } else field += c;
    } else if (c === '"') inQuotes = true;
    else if (c === ",") { row.push(field); field = ""; }
    else if (c === "\n") { row.push(field); rows.push(row); row = []; field = ""; }
    else if (c === "\r") { /* skip */ }
    else field += c;
  }
  if (field.length > 0 || row.length > 0) { row.push(field); rows.push(row); }
  return rows.filter((r) => r.length > 1 || (r.length === 1 && r[0].trim() !== ""));
}

const cents = (n) => Math.round(Number(n) * 100);
const fmt = (c) => (c / 100).toFixed(2);

function main() {
  const headerRows = parseCsv(fs.readFileSync(HEADERS_CSV, "utf8"));
  const lineRows = parseCsv(fs.readFileSync(LINES_CSV, "utf8"));

  const hCols = headerRows[0];
  const headers = headerRows.slice(1).map((r) => {
    const o = {};
    hCols.forEach((k, i) => (o[k] = r[i]));
    return o;
  });

  const lCols = lineRows[0];
  const lines = lineRows.slice(1).map((r) => {
    const o = {};
    lCols.forEach((k, i) => (o[k] = r[i]));
    return o;
  });

  const byDoc = new Map();
  for (const l of lines) {
    if (!byDoc.has(l.doc_no)) byDoc.set(l.doc_no, []);
    byDoc.get(l.doc_no).push(l);
  }

  const EARN = new Set(["loaded_pay", "empty_pay", "flat_rate", "additional_pay"]);
  const REIMB = new Set(["deduction", "reimbursement"]);
  const WITHHELD = new Set(["escrow", "admin_fee", "cash_advance"]);

  let grand = 0;
  let allOk = true;
  const report = [];

  for (const h of headers) {
    const docLines = byDoc.get(h.doc_no) || [];
    let netC = 0;
    let salaryC = 0;
    let addlC = 0;
    let reimbC = 0;
    let deductC = 0;
    for (const l of docLines) {
      const a = cents(l.amount);
      netC += a;
      if (l.category === "loaded_pay" || l.category === "empty_pay" || l.category === "flat_rate") salaryC += a;
      else if (l.category === "additional_pay") addlC += a;
      else if (REIMB.has(l.category)) reimbC += a;
      else if (WITHHELD.has(l.category)) deductC += a;
      else { allOk = false; report.push(`  DOC ${h.doc_no}: UNKNOWN category '${l.category}'`); }
    }
    grand += netC;

    const expNet = cents(h.total_due);
    const expSalary = cents(h.salary);
    const expAddl = cents(h.additional_pay);
    const expReimb = cents(h.reimbursed);
    const expDeduct = cents(h.deductions);

    const netOk = netC === expNet;
    const salaryOk = salaryC === expSalary;
    const addlOk = addlC === expAddl;
    const reimbOk = reimbC === expReimb;
    const deductOk = deductC === expDeduct;
    const ok = netOk && salaryOk && addlOk && reimbOk && deductOk;
    if (!ok) allOk = false;

    const flag = ok ? "OK  " : "FAIL";
    report.push(
      `${flag} ${h.doc_no} ${h.driver.padEnd(32).slice(0, 32)} ` +
        `net ${fmt(netC)}/${fmt(expNet)}${netOk ? "" : " <netΔ>"} ` +
        `sal ${fmt(salaryC)}/${fmt(expSalary)}${salaryOk ? "" : " <salΔ>"} ` +
        `add ${fmt(addlC)}/${fmt(expAddl)}${addlOk ? "" : " <addΔ>"} ` +
        `rmb ${fmt(reimbC)}/${fmt(expReimb)}${reimbOk ? "" : " <rmbΔ>"} ` +
        `ded ${fmt(deductC)}/${fmt(expDeduct)}${deductOk ? "" : " <dedΔ>"} ` +
        `[${docLines.length} lines]`
    );
  }

  console.log("=== PREVIEW: USMCA 21 signed-doc settlement rebuild (writes nothing) ===");
  console.log(report.join("\n"));
  console.log("----------------------------------------------------------------------");
  console.log(`docs: ${headers.length}   lines: ${lines.length}`);
  console.log(`grand net total: ${fmt(grand)}   expected: ${EXPECTED_GRAND_TOTAL.toFixed(2)}`);

  const grandOk = grand === cents(EXPECTED_GRAND_TOTAL);
  if (allOk && grandOk && headers.length === EXPECTED_DOC_COUNT) {
    console.log(`PREVIEW PASS — all ${EXPECTED_DOC_COUNT} docs tie to the penny; grand total matches. Ready for post on owner+Claude sign-off.`);
    process.exit(0);
  }
  console.log("PREVIEW FAIL — see <Δ> flags above. Do NOT post until every doc ties.");
  process.exit(1);
}

main();
