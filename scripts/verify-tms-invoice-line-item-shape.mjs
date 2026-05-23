#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";

const ROOT = process.cwd();

function fail(lines) {
  console.error("verify:tms-invoice-line-item-shape — FAILED");
  for (const line of lines) console.error(`- ${line}`);
  process.exit(1);
}

const handlerPath = path.join(ROOT, "apps/backend/src/outbox/handlers/tms-invoice-push.handler.ts");
if (!fs.existsSync(handlerPath)) {
  fail(["apps/backend/src/outbox/handlers/tms-invoice-push.handler.ts:1 file missing"]);
}

const text = fs.readFileSync(handlerPath, "utf8");
const failures = [];

if (!text.includes("buildQboInvoicePayload")) {
  failures.push("handler must build payload via buildQboInvoicePayload");
}
if (!text.includes("itemQboId")) {
  failures.push("line shape must provide itemQboId (ItemRef)");
}
if (!text.includes("quantity:")) {
  failures.push("line shape must include quantity (Qty)");
}
if (!text.includes("unitPriceCents")) {
  failures.push("line shape must include unitPriceCents (UnitPrice)");
}
if (!text.includes("taxCodeQboId")) {
  failures.push("line shape must include taxCodeQboId (TaxCodeRef)");
}
if (!text.includes("invoice_line_missing_qbo_item_id")) {
  failures.push("line resolver must fail fast when item QBO id is missing");
}

if (failures.length > 0) fail(failures);
console.log("verify:tms-invoice-line-item-shape — OK");
