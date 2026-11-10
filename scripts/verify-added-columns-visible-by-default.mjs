#!/usr/bin/env node
/**
 * verify-added-columns-visible-by-default — ACCT-F11106.
 *
 * The additive-only law (docs/LAW.md L379, BRD-25 pattern ratchet in verify-additive-only.mjs)
 * says the repo-wide count of literal `defaultHidden: true` must not grow. PRs #28074/#27870/#27883
 * added 8 new board columns that each shipped hidden by default, pushing the count 70 -> 78 and
 * turning verify-additive-only red on every open PR. Root fix: the new columns are VISIBLE by
 * default (still toggleable from the gear menu — showing more is additive). This guard pins each
 * of those 8 columns so a later edit cannot quietly re-hide them.
 *
 *   node scripts/verify-added-columns-visible-by-default.mjs            # live tree
 *   node scripts/verify-added-columns-visible-by-default.mjs --selftest # planted defects
 */
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = "verify-added-columns-visible-by-default";

const PINS = [
  ["apps/frontend/src/pages/dispatch/TripPairingBoardPage.tsx", ["customer", "miles_total", "rate_total_cents"]],
  ["apps/frontend/src/pages/driver-finance/CompanySettlementsPage.tsx", ["period_start", "period_end"]],
  ["apps/frontend/src/pages/driver-finance/SettlementsDeductionsBoard.tsx", ["created_at"]],
  ["apps/frontend/src/pages/drivers/SettlementsDeductionsKpiRow.tsx", ["created_at"]],
  ["apps/frontend/src/pages/insurance/components/InsuranceHomeBoard.tsx", ["expiry_date"]],
];

/** Returns failure strings for one file's text and its pinned column keys. */
export function check(text, keys, file = "<text>") {
  const fails = [];
  for (const k of keys) {
    const re = new RegExp(`\\bkey:\\s*["']${k}["']`, "g");
    const hits = [...text.matchAll(re)];
    if (hits.length === 0) {
      fails.push(`${file}: column key "${k}" not found (renamed or removed?)`);
      continue;
    }
    for (const h of hits) {
      const rest = text.slice(h.index + h[0].length);
      const next = rest.search(/\bkey:\s*["']/);
      const body = next === -1 ? rest.slice(0, 800) : rest.slice(0, next);
      if (/\bdefaultHidden\s*:\s*true\b/.test(body)) {
        fails.push(`${file}: column "${k}" is hidden by default (defaultHidden: true) — must be visible`);
      }
    }
  }
  return fails;
}

function selftest() {
  const good = `const cols = [\n { key: "customer", label: "Customer", sortable: true },\n { key: "tour", label: "Tour", defaultHidden: true },\n];`;
  const bad = `const cols = [\n { key: "customer", label: "Customer", defaultHidden: true, sortable: true },\n { key: "tour", label: "Tour" },\n];`;
  const missing = `const cols = [ { key: "client", label: "Customer" } ];`;
  const r1 = check(good, ["customer"]);
  const r2 = check(bad, ["customer"]);
  const r3 = check(missing, ["customer"]);
  if (r1.length !== 0) { console.error(`${LABEL}: SELFTEST FAIL — visible column flagged (neighbour's defaultHidden leaked): ${r1}`); process.exit(1); }
  if (r2.length !== 1) { console.error(`${LABEL}: SELFTEST FAIL — planted defaultHidden:true on pinned column not caught`); process.exit(1); }
  if (r3.length !== 1) { console.error(`${LABEL}: SELFTEST FAIL — missing pinned column key not caught`); process.exit(1); }
  console.log(`${LABEL}: SELFTEST PASS`);
}

if (process.argv.includes("--selftest")) {
  selftest();
} else {
  const fails = [];
  let n = 0;
  for (const [file, keys] of PINS) {
    n += keys.length;
    fails.push(...check(readFileSync(join(ROOT, file), "utf8"), keys, file));
  }
  if (fails.length) {
    console.error(`FAIL ${LABEL}:\n  - ${fails.join("\n  - ")}`);
    process.exit(1);
  }
  console.log(`PASS ${LABEL} — ${n} pinned columns across ${PINS.length} boards are visible by default.`);
}
