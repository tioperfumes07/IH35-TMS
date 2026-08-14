#!/usr/bin/env node
/** @matrix-built {"modules":["dispatch","customers"],"cols":["reverse_link"],"leafRe":"^(home\\.round_trips|detail\\.quality)$","task":"LINK-F5171-ROUNDTRIPS-QUALITY-LOAD-DRILL","vertical":"column-wave"} */
/**
 * LINK-F5171 — (1) home.round_trips header must EntityLink unit + driver (not plain text).
 * (2) customers.detail.quality events with related_load_id / related_invoice_id must EntityLink.
 *
 * Run: node scripts/verify-roundtrips-quality-load-entitylink.mjs [--selftest]
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = "verify-roundtrips-quality-load-entitylink";
const ROUND = "apps/frontend/src/pages/dispatch/RoundTrips.tsx";
const QUAL = "apps/frontend/src/pages/CustomerDetail.tsx";

function auditRound(src) {
  const failures = [];
  if (!/data-testid=["']round-trip-unit-link["']/.test(src)) {
    failures.push(`${ROUND}: missing data-testid=round-trip-unit-link`);
  }
  if (!/data-testid=["']round-trip-driver-link["']/.test(src)) {
    failures.push(`${ROUND}: missing data-testid=round-trip-driver-link`);
  }
  if (!/kind=["']unit["']/.test(src) || !/kind=["']driver["']/.test(src)) {
    failures.push(`${ROUND}: header must EntityLink kind=unit and kind=driver`);
  }
  if (/\{pair\.unitNumber\}/.test(src) && !/round-trip-unit-link/.test(src)) {
    failures.push(`${ROUND}: unitNumber still plain text without EntityLink`);
  }
  return failures;
}

function auditQuality(src) {
  const failures = [];
  if (!/data-testid=["']customer-quality-related-load-link["']/.test(src)) {
    failures.push(`${QUAL}: missing data-testid=customer-quality-related-load-link`);
  }
  if (!/related_load_id[\s\S]{0,200}kind=["']load["']/.test(src) && !/kind=["']load["'][\s\S]{0,120}related_load_id/.test(src)) {
    // Prefer explicit testid + load kind near related_load
    if (!/customer-quality-related-load-link/.test(src) || !/kind=["']load["']/.test(src)) {
      failures.push(`${QUAL}: quality events must EntityLink kind=load for related_load_id`);
    }
  }
  if (!/data-testid=["']customer-quality-related-invoice-link["']/.test(src)) {
    failures.push(`${QUAL}: missing data-testid=customer-quality-related-invoice-link`);
  }
  return failures;
}

function audit(roundSrc, qualSrc) {
  return [...auditRound(roundSrc), ...auditQuality(qualSrc)];
}

if (process.argv.includes("--selftest")) {
  const round = fs.readFileSync(path.join(ROOT, ROUND), "utf8");
  const qual = fs.readFileSync(path.join(ROOT, QUAL), "utf8");
  if (audit(round, qual).length) {
    console.error(`${LABEL} SELFTEST FAIL — live files should pass`);
    process.exit(1);
  }
  const brokenRound = round.replace(/round-trip-unit-link/g, "x");
  if (!audit(brokenRound, qual).length) {
    console.error(`${LABEL} SELFTEST FAIL — planted RoundTrips regression not caught`);
    process.exit(1);
  }
  console.log(`${LABEL} --selftest OK`);
  process.exit(0);
}

const failures = audit(
  fs.readFileSync(path.join(ROOT, ROUND), "utf8"),
  fs.readFileSync(path.join(ROOT, QUAL), "utf8"),
);
if (failures.length) {
  console.error(`${LABEL} FAIL:`);
  for (const f of failures) console.error(" -", f);
  process.exit(1);
}
console.log(`${LABEL} PASS — round-trips unit/driver + customer quality related load/invoice EntityLinks`);
