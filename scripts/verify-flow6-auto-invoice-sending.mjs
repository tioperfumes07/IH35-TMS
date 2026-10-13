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
// ACCT-F351 moved the POD convert+send call out of loads.routes.ts inline and into a dedicated
// latch module (loads.routes.ts:1455 now just calls latchOnDeliveryEvidence(...), which itself
// wires convertProformaToOfficial -> sendDraftInvoice at delivery-evidence-latch.ts:112-146).
// This guard originally checked loads.routes.ts directly and was never updated for that refactor.
const LOADS = "apps/backend/src/dispatch/delivery-evidence-latch.ts";
const INVOICES = "apps/backend/src/accounting/invoices.routes.ts";
// ROUND 285.4.10 / #60 (#23249): the latch now calls autoInvoiceOnBol (BOL gate), which converts then sends.
const AUTO = "apps/backend/src/accounting/auto-invoice-on-bol.service.ts";

export function check({ service, loads, invoices, auto }) {
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
  else {
    // Either the latch converts + sends inline, or it delegates to autoInvoiceOnBol which must itself convert BEFORE send.
    const inline = /convertProformaToOfficial\(/.test(loads) && /sendDraftInvoice\(/.test(loads);
    const ci = auto ? auto.indexOf("await convertProformaToOfficial(") : -1;
    const si = auto ? auto.indexOf("await sendDraftInvoice(") : -1;
    const delegated = /\bautoInvoiceOnBol\(/.test(loads) && ci !== -1 && si !== -1 && ci < si;
    if (!inline && !delegated) f.push(`${LOADS}: POD path must convert then sendDraftInvoice`);
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
    loads: `convertProformaToOfficial(x)\nsendDraftInvoice(x)`,
    invoices: `sendDraftInvoice`,
    auto: "",
  };
  const goodAuto = { ...good, loads: "await autoInvoiceOnBol(db, {})", auto: "const conv = await convertProformaToOfficial(client, {});\nconst r = await sendDraftInvoice(client, {});" };
  const cases = [
    ["healthy", check(good).length === 0],
    ["missing POD send", check({ ...good, loads: "convertProformaToOfficial" }).some((x) => x.includes("POD"))],
    ["healthy via autoInvoiceOnBol", check(goodAuto).length === 0],
    ["autoInvoiceOnBol never sends", check({ ...goodAuto, auto: "await convertProformaToOfficial(client, {});" }).some((x) => x.includes("POD"))],
    ["autoInvoiceOnBol sends before convert", check({ ...goodAuto, auto: "await sendDraftInvoice(client, {});\nawait convertProformaToOfficial(client, {});" }).some((x) => x.includes("POD"))],
    ["latch no longer calls autoInvoiceOnBol", check({ ...goodAuto, loads: "// nothing" }).some((x) => x.includes("POD"))],
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
  const f = check({ service: read(SERVICE), loads: read(LOADS), invoices: read(INVOICES), auto: read(AUTO) });
  if (f.length) {
    console.error(`${LABEL}: FAIL`);
    for (const x of f) console.error(" -", x);
    process.exit(1);
  }
  console.log(`${LABEL}: PASS — POD auto-send shares sendDraftInvoice with manual /send`);
}
