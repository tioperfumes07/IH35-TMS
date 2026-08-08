#!/usr/bin/env node
/**
 * GUARD: every production route that fires the delivery revenue latch must ALSO ping settlement.
 *
 * THE DEFECT THIS EXISTS FOR — a delivery has TWO money halves and only one of them was wired.
 * `latchOnDeliveryEvidence` recognises the revenue. `pingSettlementOnLoadEvent` on
 * `delivered_pending_docs` calls `closeSettlementForFinalLoad`, which CLOSES the driver's trip
 * settlement. A route that fires the first and not the second recognises revenue and leaves the
 * settlement that pays the driver OPEN FOREVER.
 *
 * MEASURED ON main 2026-08-08 — FOUR of the five latch paths were missing the ping:
 *     dispatch/loads.routes.ts              latch ✔  ping ✔
 *     mdata/loads.routes.ts                 latch ✔  ping ✘   <- office status FALLBACK
 *     driver/loads.routes.ts                latch ✔  ping ✘
 *     dispatch/loads-bulk.routes.ts         latch ✔  ping ✘   <- bulk "Mark delivered"
 *     dispatch/driver-pwa/…view.routes.ts   latch ✔  ping ✘   <- the driver's own departure tap
 * Every one of those is a real delivery path a human can trigger today.
 *
 * WHY A PAIR GUARD RATHER THAN "IS THE POSTER CALLED". The existing
 * `verify-delivery-evidence-latch-wired` proves the latch reaches every delivery path — and it was
 * GREEN through all four of those gaps, correctly, because it only ever asked about one half. The
 * lesson from four money defects in one day is the same each time: **assert the PAIR, not the call.**
 * A money side-effect with two halves needs a guard that fails when only one of them lands.
 *
 * SCOPING: production code only; the shared helper `delivery-evidence-latch.ts` is exempt because it
 * IS the latch (it does not own settlement), and `__tests__` are exempt.
 *
 * Run:  node scripts/verify-delivery-latch-pings-settlement.mjs [--selftest]
 */
import { readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";

const ROOT = path.resolve(new URL("..", import.meta.url).pathname);
const SRC = path.join(ROOT, "apps/backend/src");
const LATCH_CALL = "latchOnDeliveryEvidence(";
const PING_CALL = "pingSettlementOnLoadEvent(";

/** The helper that DEFINES the latch owns no settlement concern — exempt by design, not by convenience. */
const EXEMPT = new Set(["apps/backend/src/dispatch/delivery-evidence-latch.ts"]);

function walk(dir, out = []) {
  let entries;
  try {
    entries = readdirSync(dir);
  } catch {
    return out;
  }
  for (const entry of entries) {
    const full = path.join(dir, entry);
    let st;
    try {
      st = statSync(full);
    } catch {
      continue;
    }
    if (st.isDirectory()) {
      if (entry === "__tests__" || entry === "node_modules" || entry === "dist") continue;
      walk(full, out);
    } else if (entry.endsWith(".ts") && !entry.endsWith(".test.ts") && !entry.endsWith(".d.ts")) {
      out.push(full);
    }
  }
  return out;
}

/**
 * PURE: given a file's source, does it fire the latch without pinging settlement?
 * Returns null when the file is not a latch path at all.
 */
export function pairViolation(source) {
  // Strip comments FIRST. A `// TODO: await pingSettlementOnLoadEvent(...)` is not wiring, and a guard
  // that accepts it rewards the comment-only "fix" — the exact failure mode the money guards keep
  // having to defend against. My own selftest caught this guard doing it on the first draft.
  const code = source
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/(^|[^:])\/\/[^\n]*/g, "$1");

  const latches = code.includes(LATCH_CALL) && /await\s+latchOnDeliveryEvidence\s*\(/.test(code);
  if (!latches) return null;
  const pings = /await\s+pingSettlementOnLoadEvent\s*\(/.test(code);
  return pings ? null : "fires the delivery latch but never pings settlement";
}

const SELFTEST = process.argv.includes("--selftest");

if (SELFTEST) {
  const failures = [];
  const both = `await latchOnDeliveryEvidence(client, {}); await pingSettlementOnLoadEvent(client, {});`;
  const latchOnly = `await latchOnDeliveryEvidence(client, {});`;
  const pingOnly = `await pingSettlementOnLoadEvent(client, {});`;
  const neither = `await somethingElse(client, {});`;
  // A mention in a COMMENT must not count as wiring — the comment-only "fix" is a real failure mode.
  const commented = `await latchOnDeliveryEvidence(client, {});\n// TODO: await pingSettlementOnLoadEvent(client, {})`;

  if (pairViolation(both) !== null) failures.push("a correctly paired route was flagged (false positive)");
  if (pairViolation(latchOnly) === null) failures.push("latch-without-ping NOT caught — the actual defect");
  if (pairViolation(pingOnly) !== null) failures.push("a ping-only file was flagged (not a latch path)");
  if (pairViolation(neither) !== null) failures.push("an unrelated file was flagged");
  if (pairViolation(commented) === null) {
    failures.push('a COMMENTED-OUT ping counted as wiring — comment-only "fixes" must stay RED');
  }

  if (failures.length) {
    console.error("verify-delivery-latch-pings-settlement SELFTEST FAILED:");
    for (const f of failures) console.error(`  - ${f}`);
    process.exit(1);
  }
  console.log(
    "verify-delivery-latch-pings-settlement SELFTEST OK — 5/5 (latch-only RED, paired GREEN, ping-only and unrelated ignored, commented-out ping stays RED)"
  );
  process.exit(0);
}

const offenders = [];
for (const file of walk(SRC)) {
  const rel = path.relative(ROOT, file);
  if (EXEMPT.has(rel)) continue;
  let source;
  try {
    source = readFileSync(file, "utf8");
  } catch {
    continue;
  }
  const why = pairViolation(source);
  if (why) offenders.push({ file: rel, why });
}

if (offenders.length) {
  console.error(
    `verify-delivery-latch-pings-settlement FAILED — ${offenders.length} delivery path(s) recognise revenue but never close the settlement:`
  );
  for (const o of offenders) console.error(`  ${o.file} — ${o.why}`);
  console.error(
    "\n  A delivery has TWO money halves. `latchOnDeliveryEvidence` recognises the revenue;\n" +
      "  `pingSettlementOnLoadEvent` on delivered_pending_docs closes the driver's trip settlement.\n" +
      "  Firing only the first leaves revenue on the books and the settlement that pays the driver\n" +
      "  OPEN FOREVER. Add the ping beside the latch, non-fatal (a settlement failure must never 500\n" +
      "  a driver's departure tap or an office status change)."
  );
  process.exit(1);
}

console.log(
  "verify-delivery-latch-pings-settlement OK — every production delivery-latch path also pings settlement"
);
