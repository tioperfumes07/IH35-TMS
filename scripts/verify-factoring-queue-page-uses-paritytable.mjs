#!/usr/bin/env node
/**
 * verify-factoring-queue-page-uses-paritytable — GLOBAL-COLS-01 / ACCT-R-25 Phase A guard (verify-step 1493).
 *
 * Dispatch Factoring Queue (/dispatch/factoring-queue) is a high-traffic list surface. It must use
 * the shared ParityTable grammar (sort / resize / gear / pager), not a hand-rolled <table>.
 * Display-only migration: columns, load/invoice deep-links, stage pills, and empty copy preserved 1:1.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = "verify-factoring-queue-page-uses-paritytable";
const PAGE = "apps/frontend/src/pages/dispatch/FactoringQueuePage.tsx";

const REQUIRED_LABELS = ["Load #", "Customer", "Delivery", "Delivered", "Rate", "Status", "Missing Docs", "Invoice"];

function assertMigrated(src) {
  const errors = [];
  if (!src.includes("ParityTable")) {
    errors.push(`${PAGE}: must import ParityTable from components/parity/ParityTable`);
  }
  if ((src.match(/<ParityTable\b/g) ?? []).length < 1) {
    errors.push(`${PAGE}: expected ≥1 <ParityTable>`);
  }
  if (/<table[\s>]/.test(src)) {
    errors.push(`${PAGE}: must not contain hand-rolled <table>`);
  }
  for (const label of REQUIRED_LABELS) {
    if (!src.includes(`label: "${label}"`)) {
      errors.push(`${PAGE}: missing ParityTable column label: "${label}"`);
    }
  }
  if (!src.includes('storageKey="dispatch-factoring-queue"')) {
    errors.push(`${PAGE}: must set storageKey="dispatch-factoring-queue"`);
  }
  if (!src.includes('tableTestId="factoring-queue-table"')) {
    errors.push(`${PAGE}: must set tableTestId="factoring-queue-table"`);
  }
  if (!src.includes("No delivered loads in factoring queue.")) {
    errors.push(`${PAGE}: must keep the zero-row empty copy`);
  }
  if (!src.includes("No loads match the current filter.")) {
    errors.push(`${PAGE}: must keep the filter-empty copy`);
  }
  // C5 (2026-07-25) TIGHTENED, NOT WEAKENED. This asserted the literal string
  // "/dispatch?view=loads&load_id=", pinning the query-param form. The intent — "the load cell
  // must remain a working deep-link, not plain text" — is unchanged and is now satisfied by the
  // shared canonical primitive, which is a stricter requirement than any hand-rolled URL.
  if (!/<EntityLink[^>]*kind=["']load["']/.test(src)) {
    errors.push(`${PAGE}: must keep the load deep-link — <EntityLink kind="load"> (/dispatch/loads/:id)`);
  }
  if (src.includes("/dispatch?view=loads&load_id=")) {
    errors.push(`${PAGE}: must not deep-link the query-param form — canonical is /dispatch/loads/:id`);
  }
  if (!src.includes("/accounting/invoices/")) {
    errors.push(`${PAGE}: must keep invoice deep-link`);
  }
  if (!src.includes("STAGE_PILL")) {
    errors.push(`${PAGE}: must keep packet stage pill styling`);
  }
  return errors;
}

function selftest() {
  const good = `
    import { ParityTable, type ParityColumn } from "../../components/parity/ParityTable";
    const STAGE_PILL = {};
    const columns = [
      { key: "load_number", label: "Load #" },
      { key: "customer_name", label: "Customer" },
      { key: "delivery_city", label: "Delivery" },
      { key: "delivered_at", label: "Delivered" },
      { key: "rate_total_cents", label: "Rate" },
      { key: "packet_stage", label: "Status" },
      { key: "missing_doc_types", label: "Missing Docs" },
      { key: "invoice_display_id", label: "Invoice" },
    ];
    const emptyText = rows.length === 0 ? "No delivered loads in factoring queue." : "No loads match the current filter.";
    <EntityLink kind="load" id={row.load_id} label={row.load_number} />
    <Link to={\`/accounting/invoices/\${row.invoice_id}\`} />
    <ParityTable
      storageKey="dispatch-factoring-queue"
      tableTestId="factoring-queue-table"
      emptyText={emptyText}
    />
  `;
  const bad = `
    export function FactoringQueuePage() {
      return <table className="min-w-full"><thead><tr><th>Load #</th></tr></thead></table>;
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
  console.log(`OK ${LABEL}: ${PAGE} uses ParityTable; columns/deeplinks/stage pills preserved.`);
}

main();
