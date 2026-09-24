#!/usr/bin/env node
/**
 * VERIFY: historical settlement day feed mints driver settlements after bills
 * (ROUND 152.1 — owner: settlements create automatically from data fed in).
 *
 * Asserts feed-settlement-day.mts imports ensureSettlementFromFedBills +
 * closeFedSettlementIfRequested and calls them after the per-load feed loop.
 */
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const FEED = join(ROOT, "scripts/feed/feed-settlement-day.mts");
const SVC = join(ROOT, "apps/backend/src/feed/ensure-settlement-from-fed-bills.service.ts");

const feed = readFileSync(FEED, "utf8");
const svc = readFileSync(SVC, "utf8");

const fails = [];
if (!feed.includes("ensureSettlementFromFedBills")) {
  fails.push("feed-settlement-day.mts must import/call ensureSettlementFromFedBills");
}
if (!feed.includes("closeFedSettlementIfRequested")) {
  fails.push("feed-settlement-day.mts must call closeFedSettlementIfRequested after mint commit");
}
if (!/for \(const rec of records\)[\s\S]*ensureSettlementFromFedBills/.test(feed)) {
  fails.push("settlement mint must run AFTER the per-load feed loop");
}
if (!svc.includes("export async function ensureSettlementFromFedBills")) {
  fails.push("ensure-settlement-from-fed-bills.service.ts missing ensureSettlementFromFedBills");
}
if (!svc.includes("export async function closeFedSettlementIfRequested")) {
  fails.push("ensure-settlement-from-fed-bills.service.ts missing closeFedSettlementIfRequested");
}
if (!svc.includes("postLoadBookendedSettlementGlAfterClose")) {
  fails.push("close path must use postLoadBookendedSettlementGlAfterClose (company settlement rides with it)");
}

if (fails.length) {
  console.error("FAIL verify-feed-settlement-auto-mint:");
  for (const f of fails) console.error(" -", f);
  process.exit(1);
}
console.log("OK verify-feed-settlement-auto-mint: day feed mints+closes settlements from fed bills");
