#!/usr/bin/env node
import "./verify-customer-complete-roster-consumers.mjs";
/**
 * GUARD — a customer picker must not be capped below the real customer count.
 *
 * THE DEFECT: four call sites fetched customers with limit: 200 and no server-side search. Prod has
 * 2,693 customers, so each returned the first 200 alphabetically and dropped 92% — silently. No empty
 * state, no warning, nothing to indicate the list had been cut. Three of the four were money surfaces:
 * invoice creation, payment recording, and the invoice list filter. In practice you could not invoice
 * or take payment from a customer whose name sorted past the cap; they simply were not there.
 *
 * WHY A CAP IS WORSE THAN A FAILURE: a failed request shows an error. A silent truncation shows a
 * shorter list that looks complete. The operator's only signal is "that customer isn't set up yet",
 * which is false and leads to creating a DUPLICATE customer — which then splits that customer's A/R
 * across two records.
 *
 * ASSERTED: no listCustomers call uses a numeric limit below MIN_LIMIT unless it also passes a
 * `search` term (server-side type-ahead makes a small page correct, because the server does the
 * filtering rather than the page boundary).
 */
import { readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = "verify:customer-picker-not-capped-below-fleet";
const MIN_LIMIT = 1000;

export function findCappedCalls(source) {
  const out = [];
  const re = /listCustomers\(\s*\{([^}]*)\}/g;
  let m;
  while ((m = re.exec(source)) !== null) {
    const args = m[1];
    const lim = args.match(/limit:\s*(\d+)/);
    if (!lim) continue;                       // no explicit limit — not this guard's concern
    if (/\bsearch\s*:/.test(args)) continue;  // server-side filtering makes a small page correct
    if (Number(lim[1]) < MIN_LIMIT) out.push(Number(lim[1]));
  }
  return out;
}

function walk(dir, out = []) {
  for (const e of readdirSync(dir)) {
    if (e === "node_modules" || e === "dist" || e.startsWith(".")) continue;
    const full = path.join(dir, e);
    if (statSync(full).isDirectory()) walk(full, out);
    else if (/\.tsx?$/.test(e) && !/\.(test|spec)\./.test(e)) out.push(full);
  }
  return out;
}

export function run() {
  const files = walk(path.join(ROOT, "apps/frontend/src"));
  const problems = [];
  for (const f of files) {
    const hits = findCappedCalls(readFileSync(f, "utf8"));
    for (const lim of hits) {
      problems.push(
        `${path.relative(ROOT, f)}: listCustomers(limit: ${lim}) with no search term. Prod has ~2,693 ` +
          `customers, so this silently drops most of them. Use limit >= ${MIN_LIMIT}, or pass a search term.`
      );
    }
  }
  if (problems.length) return { ok: false, message: `${LABEL} FAILED:\n  - ${problems.join("\n  - ")}` };
  return { ok: true, message: `${LABEL} OK — no customer picker capped below ${MIN_LIMIT} without a search term` };
}

function selftest() {
  let bad = 0;
  const t = (n, c) => { if (!c) { console.error(`  SELFTEST FAIL: ${n}`); bad++; } };
  t("the ORIGINAL capped call is caught",
    findCappedCalls("listCustomers({ operating_company_id: x, limit: 200 })").length === 1);
  t("limit 5000 passes", findCappedCalls("listCustomers({ operating_company_id: x, limit: 5000 })").length === 0);
  t("a small limit WITH search is allowed",
    findCappedCalls("listCustomers({ operating_company_id: x, limit: 50, search: term })").length === 0);
  t("no explicit limit is not flagged", findCappedCalls("listCustomers({ operating_company_id: x })").length === 0);
  t("multiple capped calls are all reported",
    findCappedCalls("listCustomers({ limit: 200 })\nlistCustomers({ limit: 100 })").length === 2);
  // Mutation arms — the detector must be able to return the opposite answer.
  t("mutation: detector returns empty on unrelated source", findCappedCalls("const x = 1;").length === 0);
  t("mutation: detector reports the actual limit value", findCappedCalls("listCustomers({ limit: 200 })")[0] === 200);
  return bad;
}

const DIRECT = process.argv[1] && process.argv[1].endsWith("verify-customer-picker-not-capped-below-fleet.mjs");
if (DIRECT) {
  if (process.argv.includes("--selftest")) {
    const bad = selftest();
    console.log(bad === 0 ? `${LABEL} SELFTEST PASS — 7 cases` : `${LABEL} SELFTEST FAILED (${bad})`);
    process.exit(bad === 0 ? 0 : 1);
  }
  const r = run();
  console.log(r.message);
  process.exit(r.ok ? 0 : 1);
}
