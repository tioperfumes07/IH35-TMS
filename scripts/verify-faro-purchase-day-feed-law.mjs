#!/usr/bin/env node
/**
 * LAW guard — RULE 52 / FARO-PURCHASE-DAY-FEED-NO-DEVIATION (owner 2026-09-24).
 * Existence + hard-line text. Fails closed if the always-apply rule is removed or gutted,
 * or if new scripts/ops feed-day* paths use raw accounting INSERT as the feed writer.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const RULE = path.join(ROOT, ".cursor/rules/52-faro-purchase-day-feed-no-deviation.mdc");
const SPEC = path.join(ROOT, "docs/specs/FARO-PURCHASE-DAY-FEED-NO-DEVIATION-LAW-2026-09-24.md");

const REQUIRED_PHRASES = [
  "Faro purchase day",
  "A load fed without its money is not fed",
  "NO direct",
  "feed_cursor",
  "Forbidden shortcuts",
  "Advance-only",
];

/** Pure: rule 52's body must be always-apply and carry every hard line. */
export function ruleFailures(body) {
  const out = [];
  if (!/alwaysApply:\s*true/.test(body)) out.push("rule 52 must have alwaysApply: true");
  for (const phrase of REQUIRED_PHRASES) if (!body.includes(phrase)) out.push(`rule 52 missing hard line: ${JSON.stringify(phrase)}`);
  return out;
}

/** Pure: an ops feed-day script may not be a raw-SQL money writer (INSERT INTO accounting.* as feed). */
export function opsScriptFailure(name, text) {
  if (!/^feed-day/i.test(name)) return null;
  if (!/\.(mts|ts|mjs|js|sql)$/i.test(name)) return null;
  // Allow measuring SELECTs; forbid INSERT INTO accounting / factoring as the primary path
  // unless the file also calls a canonical create/book/seed function.
  const hasRawInsert = /INSERT\s+INTO\s+(accounting|driver_finance|factoring)\./i.test(text);
  const hasCanonical =
    /createLoadWithFullSideEffects|bookLoad|seedSettlementDocument|executeHistoricalFeedDay|createHistoricalDriverBill/.test(text);
  return hasRawInsert && !hasCanonical ? `${name}: raw INSERT into money schema without canonical create path — Rule 52 deviation` : null;
}

/** Pure: close-faro-day must LIVE-measure — never echo day_control as --measured. */
export function closeHelperFailures(closeBody) {
  const out = [];
  if (!closeBody.includes("measureDayLive") || !closeBody.includes("CLOSE REFUSED")) {
    out.push("scripts/feed/close-faro-day.mjs must LIVE-measure (measureDayLive) and CLOSE REFUSED on missing FA — never control-as-measured");
  }
  if (/dayMeasured\s*=\s*\{\s*invoices:\s*control\.invoices/.test(closeBody)) {
    out.push("scripts/feed/close-faro-day.mjs still echoes control as measured — Rule 52 deviation");
  }
  return out;
}

/** Pure: closed_purchase_days must be a contiguous prefix of day_control (no skipping open days). */
export function prefixFailure(closed, days) {
  const isoOf = (d) => {
    const [m, day, y] = d.date.split("/").map(Number);
    return `20${String(y).padStart(2, "0")}-${String(m).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
  };
  const order = days.map(isoOf);
  for (let i = 0; i < closed.length; i++) {
    if (closed[i] !== order[i]) return `closed_purchase_days not contiguous prefix: index ${i} has ${closed[i]}, want ${order[i]} (Round 152.1 — no skipping)`;
  }
  return null;
}

if (process.argv.includes("--selftest")) {
  const goodRule = ["alwaysApply: true", ...REQUIRED_PHRASES].join("\n");
  const goodClose = "const m = await measureDayLive(day); if (!m.fa) throw new Error('CLOSE REFUSED');";
  const days = [{ date: "9/1/26" }, { date: "9/2/26" }, { date: "9/3/26" }];
  const cases = [
    ["a complete rule 52 passes", ruleFailures(goodRule).length === 0],
    ["rule 52 not always-apply fails", ruleFailures(goodRule.replace("alwaysApply: true", "alwaysApply: false")).length === 1],
    ["rule 52 missing a hard line fails", ruleFailures(goodRule.replace("feed_cursor", "")).length === 1],
    ["a feed-day script through bookLoad passes", opsScriptFailure("feed-day-x.mjs", "INSERT INTO accounting.x; await bookLoad()") === null],
    ["a raw-INSERT feed-day script fails", opsScriptFailure("feed-day-x.mjs", "INSERT INTO accounting.invoices VALUES (1)") !== null],
    ["a non feed-day script is out of scope", opsScriptFailure("other.mjs", "INSERT INTO accounting.invoices VALUES (1)") === null],
    ["a live-measuring close helper passes", closeHelperFailures(goodClose).length === 0],
    ["a close helper echoing control as measured fails", closeHelperFailures(`${goodClose} dayMeasured = { invoices: control.invoices }`).length === 1],
    ["a contiguous closed prefix passes", prefixFailure(["2026-09-01", "2026-09-02"], days) === null],
    ["a skipped open day fails", prefixFailure(["2026-09-01", "2026-09-03"], days) !== null],
  ];
  for (const [n, p] of cases) console.log(`  ${p ? "✓" : "✗"} ${n}`);
  const bad = cases.filter(([, p]) => !p).length;
  console.log(bad ? "verify-faro-purchase-day-feed-law --selftest FAIL" : `verify-faro-purchase-day-feed-law --selftest PASS (${cases.length}/${cases.length})`);
  process.exit(bad ? 1 : 0);
}

const failures = [];

function mustExist(p, label) {
  if (!fs.existsSync(p)) failures.push(`missing ${label}: ${p}`);
}

mustExist(RULE, "always-apply rule 52");
mustExist(SPEC, "spec");

if (fs.existsSync(RULE)) failures.push(...ruleFailures(fs.readFileSync(RULE, "utf8")));

// Ops feed-day scripts must not be raw-SQL money writers (INSERT INTO accounting.* as feed).
const opsDir = path.join(ROOT, "scripts/ops");
if (fs.existsSync(opsDir)) {
  for (const name of fs.readdirSync(opsDir)) {
    if (!/^feed-day/i.test(name) || !/\.(mts|ts|mjs|js|sql)$/i.test(name)) continue;
    const f = opsScriptFailure(name, fs.readFileSync(path.join(opsDir, name), "utf8"));
    if (f) failures.push(f);
  }
}

// close-faro-day must LIVE-measure — never echo day_control as --measured.
const closeHelper = path.join(ROOT, "scripts/feed/close-faro-day.mjs");
if (fs.existsSync(closeHelper)) failures.push(...closeHelperFailures(fs.readFileSync(closeHelper, "utf8")));

// closed_purchase_days must be a contiguous prefix of day_control (no skipping open days).
const closedPath = path.join(ROOT, "scripts/feed/closed_purchase_days.json");
const dayControlPath = path.join(ROOT, "scripts/feed/day_control.json");
if (fs.existsSync(closedPath) && fs.existsSync(dayControlPath)) {
  const closed = JSON.parse(fs.readFileSync(closedPath, "utf8")).closed_purchase_days || [];
  const days = JSON.parse(fs.readFileSync(dayControlPath, "utf8")).days || [];
  const f = prefixFailure(closed, days);
  if (f) failures.push(f);
}

if (failures.length) {
  console.error("FAIL verify-faro-purchase-day-feed-law:");
  for (const f of failures) console.error(" -", f);
  process.exit(1);
}

console.log("PASS verify-faro-purchase-day-feed-law — Rule 52 hard lines present; ops feed-day paths clean");
process.exit(0);
