#!/usr/bin/env node
/**
 * ACCT-F11129 — the customer relationship worker scores each company in chunks through the company batch
 * (computeRelationshipScoresForCompany: five set-based reads per chunk), never one customer at a time. Measured on prod
 * 2026-11-10: ~10 s a customer x 1,217 USMCA customers, longer than the gap between deploys; last success 2026-10-25.
 * The batch reads use ANY($2::uuid[]) + GROUP BY customer_id, and the per-customer and batch paths share one formula per
 * subscore. Static; --selftest plants each defect.
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const LABEL = "verify-relationship-scorer-batched";
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const WORKER = "apps/backend/src/jobs/customer-relationship-scorer.ts";
const SCORER = "apps/backend/src/customers/relationship-score/scorer.service.ts";
const strip = (s) => String(s ?? "").replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/[^\n]*/g, "$1");

export function evaluate(worker, scorer) {
  const p = [];
  const w = strip(worker);
  if (!/computeRelationshipScoresForCompany\(client, companyId, chunk\)/.test(w)) p.push("the worker does not score through the company batch");
  if (/computeRelationshipScore\(client/.test(w)) p.push("the worker still scores one customer at a time");
  const s = strip(scorer);
  const at = s.indexOf("export async function computeRelationshipScoresForCompany(");
  const fn = at < 0 ? "" : s.slice(at, s.indexOf("export async function upsertRelationshipScore(", at));
  if (!fn) return [...p, "computeRelationshipScoresForCompany not found"];
  const groups = (fn.match(/GROUP BY (i\.|q\.)?customer_id/g) ?? []).length;
  if (groups < 4) p.push(`the batch has ${groups} grouped reads (want 4: loads, invoices, arrivals, complaints)`);
  const anys = (fn.match(/customer_id = ANY\(\$2::uuid\[\]\)/g) ?? []).length;
  if (anys < 4) p.push(`the batch filters ${anys} reads by the chunk (want 4)`);
  for (const f of ["engagementFromCounts(", "paymentFromOpen(", "serviceFromArrivals(", "marginFromRevenue(", "complaintFromCount("]) {
    if ((s.split(f).length - 1) < 3) p.push(`${f.slice(0, -1)} is not shared by the per-customer and batch paths`);
  }
  return p;
}

function selftest() {
  const w = readFileSync(path.join(ROOT, WORKER), "utf8");
  const s = readFileSync(path.join(ROOT, SCORER), "utf8");
  const cases = [
    ["the real sources pass", w, s, 0],
    ["planted: worker back to one customer at a time", w.replace("computeRelationshipScoresForCompany(client, companyId, chunk)", "computeRelationshipScore(client, { operating_company_id: companyId, customer_uuid: chunk[0] })"), s, 1],
    ["planted: arrivals no longer grouped", w, s.replace("        FROM completed\n       GROUP BY customer_id", "        FROM completed"), 1],
    ["planted: per-customer path keeps its own formula", w, s.replace("return serviceFromArrivals(Number(res.rows[0]?.total_count ?? 0), Number(res.rows[0]?.late_count ?? 0));", "return null;"), 1],
  ];
  let bad = 0;
  for (const [name, a, b, want] of cases) {
    const got = evaluate(a, b).length > 0 ? 1 : 0;
    if (got !== want) bad++;
    console.log(`${got === want ? "ok  " : "FAIL"} ${name}`);
  }
  console.log(`${LABEL} --selftest: ${cases.length - bad}/${cases.length}`);
  process.exit(bad ? 1 : 0);
}

if (process.argv.includes("--selftest")) selftest();
else {
  const problems = evaluate(readFileSync(path.join(ROOT, WORKER), "utf8"), readFileSync(path.join(ROOT, SCORER), "utf8"));
  if (problems.length) { console.error(`${LABEL}: FAIL`); for (const x of problems) console.error(`  - ${x}`); process.exit(1); }
  console.log(`${LABEL}: PASS — the relationship worker scores each company in batched set reads`);
}
