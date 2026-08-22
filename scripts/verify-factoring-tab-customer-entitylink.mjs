#!/usr/bin/env node
/** Ratchet: load factoring tab connects the canonical load, customer, and invoice in both directions. */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = "verify-factoring-tab-customer-entitylink";
const FILE = path.join(ROOT, "apps/frontend/src/components/dispatch/tabs/FactoringTab.tsx");
const source = fs.readFileSync(FILE, "utf8");

export function collectFailures(src = source) {
  const failures = [];
  const requireText = (token, message) => { if (!src.includes(token)) failures.push(message); };
  requireText("const load = loadQ.data", "tab must consume the canonical selected load result");
  requireText("listInvoices(operatingCompanyId, { customer_id: load!.customer_id })", "invoice reader must bind selected company and load customer");
  requireText("find((inv) => inv.source_load_id === loadId)", "linked invoice must reverse-match the selected load id");
  requireText('data-testid="factoring-tab-customer-entitylink"', "customer reverse surface must remain mounted");
  requireText('kind="customer"\n            id={load.customer_id}\n            name={load.customer_name ?? null}', "customer drill must bind the load customer id and human name");
  requireText('kind="invoice" id={linkedInvoice.id} name={linkedInvoice.display_id}', "invoice drill must bind the matched invoice id and display id");
  requireText('data-testid="load-factoring-invoice-link"', "invoice reverse surface must remain mounted");
  return failures;
}

function selftest() {
  const baseline = collectFailures();
  if (baseline.length) throw new Error(`clean baseline red: ${baseline.join("; ")}`);
  const mutations = [
    ["const load = loadQ.data", "const load = undefined"],
    ["listInvoices(operatingCompanyId, { customer_id: load!.customer_id })", "listInvoices(operatingCompanyId, {})"],
    ["inv.source_load_id === loadId", "inv.source_load_id === load?.customer_id"],
    ['data-testid="factoring-tab-customer-entitylink"', 'data-testid="planted-customer-missing"'],
    ["id={load.customer_id}", "id={load.id}"],
    ["name={load.customer_name ?? null}", "name={null}"],
    ['kind="invoice" id={linkedInvoice.id} name={linkedInvoice.display_id}', 'kind="invoice" id={load.id} name={linkedInvoice.display_id}'],
    ['data-testid="load-factoring-invoice-link"', 'data-testid="planted-invoice-missing"'],
  ];
  let rejected = 0;
  for (const [needle, replacement] of mutations) {
    if (!source.includes(needle)) throw new Error(`plant target missing: ${needle}`);
    if (collectFailures(source.split(needle).join(replacement)).length) rejected += 1;
  }
  if (rejected !== mutations.length) throw new Error(`rejected ${rejected}/${mutations.length} plants`);
  console.log(`[${LABEL}] --selftest PASS: rejected ${rejected}/${mutations.length} load/customer/invoice plants without editing runtime files`);
}

try {
  if (process.argv.includes("--selftest")) selftest();
  else {
    const failures = collectFailures();
    if (failures.length) throw new Error(failures.join("; "));
    console.log(`[${LABEL}] PASS: selected load reverse-connects its customer and matched invoice`);
  }
} catch (error) {
  console.error(`[${LABEL}] FAIL: ${error instanceof Error ? error.message : String(error)}`);
  process.exit(1);
}
