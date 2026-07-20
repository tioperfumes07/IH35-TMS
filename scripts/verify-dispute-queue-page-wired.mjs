#!/usr/bin/env node
/**
 * verify-dispute-queue-page-wired.mjs — 0441-mod7-dispute-queue-stub
 *
 * DisputeQueuePage must call the real queue APIs (list / start-review / decide),
 * not render prose stubs naming those endpoints.
 *
 * Self-test: node scripts/verify-dispute-queue-page-wired.mjs --selftest
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const PAGE = path.join(ROOT, "apps/frontend/src/pages/accounting/DisputeQueuePage.tsx");
const API = path.join(ROOT, "apps/frontend/src/api/disputes.ts");
const LABEL = "verify-dispute-queue-page-wired";

/**
 * @param {string} pageSrc
 * @param {string} apiSrc
 * @returns {string[]}
 */
export function computeFailures(pageSrc, apiSrc) {
  const errors = [];
  if (!/\buseQuery\b/.test(pageSrc)) {
    errors.push("DisputeQueuePage.tsx must use useQuery");
  }
  if (!/\blistDisputeQueue\b/.test(pageSrc) && !/\/api\/v1\/disputes\b/.test(pageSrc)) {
    errors.push("DisputeQueuePage.tsx must call listDisputeQueue or /api/v1/disputes");
  }
  if (!/\bstartDisputeReview\b/.test(pageSrc) && !/start-review/.test(pageSrc)) {
    errors.push("DisputeQueuePage.tsx must call startDisputeReview or start-review");
  }
  if (!/\bdecideDispute\b/.test(pageSrc) && !/\/decide\b/.test(pageSrc)) {
    errors.push("DisputeQueuePage.tsx must call decideDispute or /decide");
  }
  if (!/\bListErrorState\b/.test(pageSrc) || !/\bisError\b/.test(pageSrc)) {
    errors.push("DisputeQueuePage.tsx must render ListErrorState on isError");
  }
  if (/Queue API:/.test(pageSrc) && !/\buseQuery\b/.test(pageSrc)) {
    errors.push("DisputeQueuePage.tsx must not be a prose-only stub naming Queue API");
  }
  if (!/\/api\/v1\/disputes/.test(apiSrc)) {
    errors.push("api/disputes.ts must call GET /api/v1/disputes");
  }
  if (!/start-review/.test(apiSrc)) {
    errors.push("api/disputes.ts must call start-review");
  }
  if (!/\/decide/.test(apiSrc)) {
    errors.push("api/disputes.ts must call /decide");
  }
  return errors;
}

function selftest() {
  const goodPage = `
    import { useQuery } from "@tanstack/react-query";
    import { listDisputeQueue, startDisputeReview, decideDispute } from "../../api/disputes";
    import { ListErrorState } from "../../components/ListErrorState";
    export function DisputeQueuePage() {
      const q = useQuery({ queryFn: () => listDisputeQueue(id) });
      if (q.isError) return <ListErrorState />;
      startDisputeReview; decideDispute;
      return null;
    }
  `;
  const goodApi = `
    apiRequest('/api/v1/disputes?' + q);
    apiRequest('/api/v1/disputes/' + id + '/start-review?' + q, { method: 'POST' });
    apiRequest('/api/v1/disputes/' + id + '/decide', { method: 'POST', body });
  `;
  const badPage = `
    export function DisputeQueuePage() {
      return <p>Queue API: GET /api/v1/disputes</p>;
    }
  `;
  const badApi = `export function noop() {}`;
  let ok = true;
  for (const c of [
    { name: "wired", page: goodPage, api: goodApi, expectPass: true },
    { name: "stub page", page: badPage, api: goodApi, expectPass: false },
    { name: "missing api", page: goodPage, api: badApi, expectPass: false },
  ]) {
    const failures = computeFailures(c.page, c.api);
    const passed = failures.length === 0;
    if (passed !== c.expectPass) {
      ok = false;
      console.error(`SELFTEST FAIL — ${c.name}: ${JSON.stringify(failures)}`);
    } else console.log(`selftest ok — ${c.name}`);
  }
  if (!ok) process.exit(1);
  console.log(`${LABEL} --selftest OK`);
}

function run() {
  const pageSrc = fs.readFileSync(PAGE, "utf8");
  const apiSrc = fs.readFileSync(API, "utf8");
  const failures = computeFailures(pageSrc, apiSrc);
  if (failures.length) {
    console.error(`[${LABEL}] FAIL:`);
    for (const f of failures) console.error(`  - ${f}`);
    process.exit(1);
  }
  console.log(`[${LABEL}] OK — DisputeQueuePage wired to /api/v1/disputes`);
}

if (process.argv.includes("--selftest")) selftest();
else run();
