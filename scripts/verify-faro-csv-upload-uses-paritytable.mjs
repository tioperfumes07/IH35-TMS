#!/usr/bin/env node
/**
 * verify-faro-csv-upload-uses-paritytable — qbo-parity-a1 (FaroCSVUploadWidget preview surface)
 *
 * The Faro CSV upload widget's read-only preview table (first 5 parsed rows) must use the shared
 * ParityTable grammar, not a hand-rolled <table>. DISPLAY-ONLY migration on a money-adjacent
 * surface: the upload/import handlers (onUpload, onCsvTextChange, JSON fallback) are props owned
 * by the parent and must stay untouched — this widget must not gain mutations (no useMutation,
 * no apiRequest). The CSV parse-error list and "preview row(s) valid" copy must be preserved.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = "verify-faro-csv-upload-uses-paritytable";
const PAGE = "apps/frontend/src/components/factoring/FaroCSVUploadWidget.tsx";

function assertMigrated(src) {
  const errors = [];
  if (!src.includes('from "../parity/ParityTable"') && !src.includes("ParityTable")) {
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
  if (!src.includes('tableTestId="faro-csv-upload-preview-table"')) {
    errors.push(`${PAGE}: must set tableTestId="faro-csv-upload-preview-table"`);
  }
  if (!src.includes("onUpload")) {
    errors.push(`${PAGE}: must keep the onUpload prop wiring (upload handler owned by parent)`);
  }
  if (!src.includes("preview row(s) valid")) {
    errors.push(`${PAGE}: must keep the "preview row(s) valid" status copy`);
  }
  if (!src.includes("preview.errors")) {
    errors.push(`${PAGE}: must keep the CSV parse-error list surface`);
  }
  if (src.includes("useMutation") || src.includes("apiRequest")) {
    errors.push(
      `${PAGE}: display-only widget — must not add mutations or API calls (upload lives in parent)`,
    );
  }
  return errors;
}

function selftest() {
  const good = `
    import { ParityTable, type ParityColumn } from "../parity/ParityTable";
    export function FaroCSVUploadWidget({ onUpload }) {
      const preview = { headers: [], rows: [], errors: [] };
      return (
        <div>
          <ParityTable
            columns={previewColumns}
            rows={previewRows}
            rowKey={(row) => String(row.previewIndex)}
            tableTestId="faro-csv-upload-preview-table"
          />
          {preview.errors.map((e) => e)}
          <p>{preview.rows.length} preview row(s) valid</p>
        </div>
      );
    }
  `;
  const bad = `
    import { useMutation } from "@tanstack/react-query";
    import { apiRequest } from "../../api/client";
    export function FaroCSVUploadWidget() {
      return (
        <table className="min-w-full">
          <thead><tr><th>invoice_number</th></tr></thead>
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
  console.log(
    `OK ${LABEL}: ${PAGE} preview uses ParityTable; upload handlers untouched; no mutations added.`,
  );
}

main();
