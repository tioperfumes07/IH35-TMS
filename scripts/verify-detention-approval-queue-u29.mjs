#!/usr/bin/env node
/** U29 — Detention approval queue must EntityLink load + customer (ids already on request rows). */
import fs from "node:fs";

const LABEL = "verify-detention-approval-queue-u29";
const PAGE = "apps/frontend/src/pages/dispatch/DetentionBoardPage.tsx";
const API = "apps/frontend/src/api/dispatch.ts";
const page = fs.readFileSync(PAGE, "utf8");
const api = fs.readFileSync(API, "utf8");
const fails = [];

const queueSlice = page.includes("detention-approval-queue")
  ? page.slice(page.indexOf("detention-approval-queue"), page.indexOf("detention-approval-queue") + 2500)
  : "";

if (!/kind="load"[\s\S]{0,80}row\.load_id/.test(queueSlice) && !/kind="load" id=\{row\.load_id\}/.test(page)) {
  fails.push(`${PAGE}: approval queue load_number must EntityLink via load_id`);
}
if (!/kind="customer" id=\{row\.customer_id\}/.test(page)) {
  fails.push(`${PAGE}: approval queue customer must EntityLink via customer_id`);
}
if (/font-semibold">\{row\.load_number/.test(page)) {
  fails.push(`${PAGE}: must not render plain load_number in approval queue`);
}
if (!/customer_id\?: string \| null/.test(api)) {
  fails.push(`${API}: DetentionApprovalRequest must declare customer_id`);
}

if (process.argv.includes("--selftest")) {
  if (fails.length) {
    console.error(`${LABEL} --selftest FAIL live red:\n  ${fails.join("\n  ")}`);
    process.exit(1);
  }
  const plant = page
    .replace(/<EntityLinkOrTombstone kind="load" id=\{row\.load_id\} name=\{row\.load_number\} noun="Load" \/>/g, "{row.load_number ?? \"—\"}")
    .replace(/<EntityLinkOrTombstone kind="customer" id=\{row\.customer_id\} name=\{row\.customer_name\} noun="Customer" \/>/g, "{row.customer_name ?? \"—\"}");
  if (/kind="load" id=\{row\.load_id\}/.test(plant) && /kind="customer" id=\{row\.customer_id\}/.test(plant)) {
    console.error(`${LABEL} --selftest FAIL plant weak`);
    process.exit(1);
  }
  console.log(`${LABEL} --selftest PASS`);
  process.exit(0);
}

if (fails.length) {
  console.error(`${LABEL}: FAIL\n  ${fails.join("\n  ")}`);
  process.exit(1);
}
console.log(`${LABEL}: PASS — Detention approval queue EntityLinks load + customer`);
