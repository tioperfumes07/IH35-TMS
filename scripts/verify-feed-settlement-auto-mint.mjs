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

/** The day feed mints + closes settlements from fed bills; returns every missing piece. */
export function failures(feedSrc, svcSrc) {
  const fails = [];
  if (!feedSrc.includes("ensureSettlementFromFedBills")) {
    fails.push("feed-settlement-day.mts must import/call ensureSettlementFromFedBills");
  }
  if (!feedSrc.includes("closeFedSettlementIfRequested")) {
    fails.push("feed-settlement-day.mts must call closeFedSettlementIfRequested after mint commit");
  }
  if (!/for \(const rec of records\)[\s\S]*ensureSettlementFromFedBills/.test(feedSrc)) {
    fails.push("settlement mint must run AFTER the per-load feed loop");
  }
  if (!svcSrc.includes("export async function ensureSettlementFromFedBills")) {
    fails.push("ensure-settlement-from-fed-bills.service.ts missing ensureSettlementFromFedBills");
  }
  if (!svcSrc.includes("export async function closeFedSettlementIfRequested")) {
    fails.push("ensure-settlement-from-fed-bills.service.ts missing closeFedSettlementIfRequested");
  }
  if (!svcSrc.includes("postLoadBookendedSettlementGlAfterClose")) {
    fails.push("close path must use postLoadBookendedSettlementGlAfterClose (company settlement rides with it)");
  }
  return fails;
}

if (process.argv.includes("--selftest")) {
  const cases = [
    ["the real feed + service pass", failures(feed, svc).length === 0],
    ["a feed that never mints fails", failures(feed.split("ensureSettlementFromFedBills").join("x"), svc).length > 0],
    ["a feed that never closes fails", failures(feed.split("closeFedSettlementIfRequested").join("x"), svc).length > 0],
    ["a service without the bookended GL close fails", failures(feed, svc.split("postLoadBookendedSettlementGlAfterClose").join("x")).length > 0],
    ["a service without closeFedSettlementIfRequested fails", failures(feed, svc.replace("export async function closeFedSettlementIfRequested", "async function x")).length > 0],
  ];
  for (const [n, p] of cases) console.log(`  ${p ? "✓" : "✗"} ${n}`);
  const bad = cases.filter(([, p]) => !p).length;
  console.log(bad ? "verify-feed-settlement-auto-mint --selftest FAIL" : `verify-feed-settlement-auto-mint --selftest PASS (${cases.length}/${cases.length})`);
  process.exit(bad ? 1 : 0);
}

const fails = failures(feed, svc);
if (fails.length) {
  console.error("FAIL verify-feed-settlement-auto-mint:");
  for (const f of fails) console.error(" -", f);
  process.exit(1);
}
console.log("OK verify-feed-settlement-auto-mint: day feed mints+closes settlements from fed bills");
