#!/usr/bin/env node
/** U29 — Factoring submission queue / workqueue Factor column must EntityLink when id present. */
import fs from "node:fs";

const LABEL = "verify-factoring-queue-u29-factor-links";
const QUEUE = "apps/frontend/src/pages/factoring/SubmissionQueue.tsx";
const WORK = "apps/frontend/src/pages/factoring/SubmissionWorkqueue.tsx";
const API = "apps/frontend/src/api/factoring.ts";
const SVC = "apps/backend/src/factoring/submission-queue.service.ts";

const queue = fs.readFileSync(QUEUE, "utf8");
const work = fs.readFileSync(WORK, "utf8");
const api = fs.readFileSync(API, "utf8");
const svc = fs.readFileSync(SVC, "utf8");
const fails = [];

if (!/kind="factor"/.test(queue) || !/item\.factor_id/.test(queue)) {
  fails.push(`${QUEUE}: Factor column must EntityLink kind=factor via factor_id`);
}
if (/render:\s*\(item\)\s*=>\s*<span[^>]*>\{item\.factor_name \?\?/.test(queue)) {
  fails.push(`${QUEUE}: must not only paint plain factor_name`);
}
if (!/kind="vendor"/.test(work) || !/item\.factor_vendor_id/.test(work)) {
  fails.push(`${WORK}: Factor column must EntityLink vendor via factor_vendor_id`);
}
if (!/factor_vendor_id: string \| null/.test(api)) {
  fails.push(`${API}: WorkqueueItem must declare factor_vendor_id`);
}
if (!/fv\.id::text\s+AS factor_vendor_id/.test(svc) || !/factor_vendor_id: row\.factor_vendor_id/.test(svc)) {
  fails.push(`${SVC}: workqueue must SELECT + return factor_vendor_id`);
}

if (process.argv.includes("--selftest")) {
  if (fails.length) {
    console.error(`${LABEL} --selftest FAIL live red:\n  ${fails.join("\n  ")}`);
    process.exit(1);
  }
  const plantQ = queue.replace(/kind="factor"/g, 'kind="load"');
  const plantW = work.replace(/kind="vendor"/g, 'kind="load"');
  if (/kind="factor"/.test(plantQ) || /kind="vendor"/.test(plantW)) {
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
console.log(`${LABEL}: PASS — Factoring queue/workqueue Factor EntityLinks`);
