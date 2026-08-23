#!/usr/bin/env node
/**
 * verify-qb-import-tab-uses-paritytable — qbo-parity-a1 (Form 425C QB Import preview surface)
 *
 * The Form 425C QB Import parsed-lines preview must use the shared ParityTable grammar, not a
 * hand-rolled <table>. FINANCIAL SURFACE (DIP / 425C regulatory adjacent) — DISPLAY-ONLY
 * migration: the parse handler, the include-toggle checkbox, the "$X.XX" amount format, the
 * "Apply … to Line 20" total, and the session-scoped disclaimer must all be preserved 1:1.
 * This tab is a session-scoped preview only: it must never gain mutations or network calls
 * (authoritative lines 19-23 come from backend Banking import; TMS never writes to QBO).
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = "verify-qb-import-tab-uses-paritytable";
const PAGE = "apps/frontend/src/pages/form425c/tabs/QBImportTab.tsx";

const REQUIRED_LABELS = ["Use", "Date", "Type", "Description", "Account", "Amount"];

function assertMigrated(src) {
  const errors = [];
  if (!src.includes("ParityTable")) {
    errors.push(`${PAGE}: must import ParityTable from components/parity/ParityTable`);
  }
  if (src.includes("DataTable")) {
    errors.push(`${PAGE}: must not import or render DataTable after ParityTable migration`);
  }
  if ((src.match(/<ParityTable\b/g) ?? []).length < 1) {
    errors.push(`${PAGE}: expected ≥1 <ParityTable>`);
  }
  if (/<table[\s>]/.test(src)) {
    errors.push(`${PAGE}: must not contain hand-rolled <table>`);
  }
  if (/<thead[\s>]/.test(src)) {
    errors.push(`${PAGE}: must not contain hand-rolled <thead>`);
  }
  for (const label of REQUIRED_LABELS) {
    if (!src.includes(`label: "${label}"`)) {
      errors.push(`${PAGE}: missing column label: "${label}"`);
    }
  }
  if (!src.includes('storageKey="form425c-qb-import-preview"')) {
    errors.push(`${PAGE}: must set storageKey="form425c-qb-import-preview"`);
  }
  if (!src.includes('tableTestId="qb-import-preview-table"')) {
    errors.push(`${PAGE}: must set tableTestId="qb-import-preview-table"`);
  }
  if (!src.includes("row.amt.toFixed(2)")) {
    errors.push(`${PAGE}: must keep the exact $X.XX amount format (row.amt.toFixed(2))`);
  }
  if (!src.includes('type="checkbox"')) {
    errors.push(`${PAGE}: must keep the include-toggle checkbox in the Use column renderer`);
  }
  if (!src.includes("to Line 20")) {
    errors.push(`${PAGE}: must keep the "Apply … to Line 20" total action`);
  }
  if (!src.includes("Session-scoped preview only.")) {
    errors.push(`${PAGE}: must keep the session-scoped preview disclaimer (DIP lines 19-23 stay backend-authoritative)`);
  }
  if (src.includes("useMutation") || src.includes("useQuery") || /\bfetch\(/.test(src)) {
    errors.push(`${PAGE}: session-scoped preview — must not add mutations, queries, or network calls (TMS never writes to QBO)`);
  }
  if (!src.includes("Paste a tab-delimited deposit export first")) {
    errors.push(`${PAGE}: Parse on empty paste must toast (silent no-op is a leftover FINDING)`);
  }
  if (!src.includes("No matching DIP deposits")) {
    errors.push(`${PAGE}: Parse with no matching bank/DIP rows must toast, not silently leave Apply $0.00 disabled`);
  }
  if (!src.includes("Applied $")) {
    errors.push(`${PAGE}: Apply to Line 20 must toast Applied $… (silent parent state update is leftover FINDING)`);
  }
  if (!src.includes("No included deposits")) {
    errors.push(`${PAGE}: Apply with $0 included must toast, not silently write Line 20`);
  }
  if (src.includes("disabled={!parsed.length}")) {
    errors.push(`${PAGE}: Apply must not be disabled when parsed is empty (dead click is leftover FINDING)`);
  }
  if (!src.includes("Parse Income Deposits before applying to Line 20")) {
    errors.push(`${PAGE}: Apply with empty parsed must toast Parse Income Deposits before applying to Line 20`);
  }
  return errors;
}

function selftest() {
  const good = `
    import { ParityTable, type ParityColumn } from "../../../components/parity/ParityTable";
    const columns = [
      { key: "include", label: "Use", render: (row) => <input type="checkbox" checked={row.include} /> },
      { key: "date", label: "Date" },
      { key: "type", label: "Type" },
      { key: "desc", label: "Description" },
      { key: "acct", label: "Account" },
      { key: "amt", label: "Amount", render: (row) => <span>\${row.amt.toFixed(2)}</span> },
    ];
    <button>Apply \${includedTotal.toFixed(2)} to Line 20</button>
    <ParityTable
      storageKey="form425c-qb-import-preview"
      tableTestId="qb-import-preview-table"
    />
    <div>Session-scoped preview only. Authoritative Form lines 19-23 remain backend Banking import values.</div>
    Paste a tab-delimited deposit export first
    No matching DIP deposits
    Applied $
    No included deposits
    Parse Income Deposits before applying to Line 20
  `;
  const bad = `
    import { DataTable } from "../../components/DataTable";
    import { useMutation } from "@tanstack/react-query";
    export function QBImportTab() {
      return (
        <table className="min-w-full">
          <thead><tr><th>Use</th></tr></thead>
        </table>
      );
    }
  `;
  const goodErrors = assertMigrated(good);
  const badErrors = assertMigrated(bad);
  if (goodErrors.length) {
    console.error(`${LABEL} --selftest FAIL good fixture:`, goodErrors);
    process.exit(1);
  }
  if (badErrors.length < 3) {
    console.error(`${LABEL} --selftest FAIL bad fixture should fail hard:`, badErrors);
    process.exit(1);
  }
  console.log(`${LABEL} --selftest PASS`);
}

function main() {
  if (process.argv.includes("--selftest")) {
    selftest();
    return;
  }
  const src = fs.readFileSync(path.join(ROOT, PAGE), "utf8");
  const errors = assertMigrated(src);
  if (errors.length) {
    console.error(`FAIL ${LABEL}:`);
    for (const e of errors) console.error(`  - ${e}`);
    process.exit(1);
  }
  console.log(`OK ${LABEL}: ${PAGE} uses ParityTable; amount format, include toggle, Line 20 action, disclaimer preserved; no network writes.`);
}

main();
