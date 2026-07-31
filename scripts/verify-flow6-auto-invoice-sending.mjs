#!/usr/bin/env node
/**
 * ACCT-R-24 / flow6-auto-invoice-sending — POD auto-send after proforma convert.
 * Owner B2d: at POD auto-convert + auto-send. Manual /send and POD must share sendDraftInvoice.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = "verify-flow6-auto-invoice-sending";
const SERVICE = "apps/backend/src/accounting/invoice-send.service.ts";
const LOADS = "apps/backend/src/dispatch/loads.routes.ts";
const INVOICES = "apps/backend/src/accounting/invoices.routes.ts";

export function check({ service, loads, invoices }) {
  const f = [];
  if (!service) f.push(`${SERVICE}: missing`);
  else {
    if (!/export async function sendDraftInvoice/.test(service)) {
      f.push(`${SERVICE}: must export sendDraftInvoice`);
    }
    if (!/status = 'sent'/.test(service)) f.push(`${SERVICE}: must flip status to sent`);
    if (!/enqueueEmail/.test(service) || !/invoice-send/.test(service)) {
      f.push(`${SERVICE}: must enqueue invoice-send email when customer email present`);
    }
  }
  if (!loads) f.push(`${LOADS}: missing`);
  else if (!/sendDraftInvoice/.test(loads) || !/convertProformaToOfficial/.test(loads)) {
    f.push(`${LOADS}: POD path must convert then sendDraftInvoice`);
  }
  if (!invoices) f.push(`${INVOICES}: missing`);
  else if (!/sendDraftInvoice/.test(invoices)) {
    f.push(`${INVOICES}: POST /send must call sendDraftInvoice (no dual path)`);
  }
  return f;
}

function read(rel) {
  try {
    return fs.readFileSync(path.join(ROOT, rel), "utf8");
  } catch {
    return null;
  }
}

function selftest() {
  const good = {
    service: `export async function sendDraftInvoice\nstatus = 'sent'\nenqueueEmail\ninvoice-send`,
    loads: `convertProformaToOfficial\nsendDraftInvoice`,
    invoices: `sendDraftInvoice`,
  };
  const cases = [
    ["healthy", check(good).length === 0],
    ["missing POD send", check({ ...good, loads: "convertProformaToOfficial" }).some((x) => x.includes("POD"))],
  ];
  const bad = cases.filter(([, ok]) => !ok);
  if (bad.length) {
    console.error(`${LABEL}: selftest FAIL`);
    for (const [n] of bad) console.error(" ", n);
    process.exit(1);
  }
  console.log(`${LABEL}: selftest PASS`);
}

if (process.argv.includes("--selftest")) {
  selftest();
} else {
  const f = check({ service: read(SERVICE), loads: read(LOADS), invoices: read(INVOICES) });
  if (f.length) {
    console.error(`${LABEL}: FAIL`);
    for (const x of f) console.error(" -", x);
    process.exit(1);
  }
  console.log(`${LABEL}: PASS — POD auto-send shares sendDraftInvoice with manual /send`);
}
