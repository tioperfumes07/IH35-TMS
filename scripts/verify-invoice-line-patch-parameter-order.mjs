#!/usr/bin/env node
import fs from "node:fs";

const source = fs.readFileSync(new URL("../apps/backend/src/accounting/invoice-lines.routes.ts", import.meta.url), "utf8");
const patchRoute = source.slice(source.indexOf('"/api/v1/accounting/invoices/:id/lines/:lineId"'), source.indexOf('app.delete("/api/v1/accounting/invoices/:id/lines/:lineId"'));

function problems(text) {
  const lineId = text.indexOf("values.push(params.data.lineId)");
  const revenue = text.indexOf('add("revenue_code", revenueResolution.revenue_code)');
  const account = text.indexOf('add("account_id", revenueResolution.account_id)');
  if (lineId < 0 || revenue < 0 || account < 0) return ["PATCH parameter construction markers missing"];
  return lineId > revenue && lineId > account ? [] : ["WHERE identifiers must be appended after every dynamic SET value"];
}

if (process.argv.includes("--selftest")) {
  if (problems(patchRoute).length) process.exit(1);
  const planted = patchRoute.replace("values.push(params.data.lineId);", "").replace('add("revenue_code", revenueResolution.revenue_code);', 'values.push(params.data.lineId);\n        add("revenue_code", revenueResolution.revenue_code);');
  if (!problems(planted).length) process.exit(1);
  console.log("verify-invoice-line-patch-parameter-order --selftest OK");
  process.exit(0);
}

const found = problems(patchRoute);
if (found.length) {
  console.error(`verify-invoice-line-patch-parameter-order FAIL: ${found.join("; ")}`);
  process.exit(1);
}
console.log("verify-invoice-line-patch-parameter-order PASS — WHERE ids follow all SET parameters");
