#!/usr/bin/env node
/**
 * LV-INVOICES-FILTER-APPLY-DROPS-FIELDS (2026-08-20, CC-3).
 *
 * react-router's useSearchParams().setSearchParams closes over the `searchParams` value from the
 * CURRENT render (node_modules/react-router/dist/development/chunk-7XGYIT3M.js:712-738) — it does
 * NOT chain across multiple synchronous calls the way React's own useState updater form does. Every
 * `setSearchParams(prev => ...)` call in the same tick recomputes `prev` from the SAME pre-batch
 * snapshot, so when InvoicesListPage's staged-filter Apply called setStatus(), then setCustomerId(),
 * then setSourceLoadId() back-to-back, only the LAST call's diff (relative to the state before any
 * of them ran) survived — Apply silently dropped every field but one. Live repro: open the filter
 * panel with ?customer_id=X&has_balance=true, change Status to "Sent", click Apply — the URL stayed
 * exactly `?customer_id=X&has_balance=true`, unchanged, because the final call in the chain
 * (setSourceLoadId with an empty draft value) computed its diff against the ORIGINAL pre-Apply
 * params and found nothing to change.
 *
 * Fix: one combined setSearchParams call (applyUrlFilters) writes status/has_balance, customer_id,
 * and source_load_id together from a single `prev`. This guard fails if the staged-filter Apply path
 * goes back to calling setSearchParams more than once per field.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, "..");
const LABEL = "verify-invoices-list-filter-apply-single-write";
const FILE = "apps/frontend/src/pages/accounting/InvoicesListPage.tsx";

export function check(src) {
  const failures = [];
  if (src === null) return [`${FILE} not found`];

  // The onApply callback passed to useStagedListFilters must call setSearchParams (directly or via
  // one combined helper) exactly ONCE — never one call per field.
  const onApplyMatch = src.match(/onApply:\s*\(next\)\s*=>\s*\{([\s\S]{0,600}?)\},\s*\}\);/);
  if (!onApplyMatch) {
    failures.push("useStagedListFilters onApply callback not found in expected shape");
  } else {
    const body = onApplyMatch[1];
    const setSearchParamsCallCount = (body.match(/setSearchParams\(/g) ?? []).length;
    // onApply may call setSearchParams 0 times directly if it delegates to a helper — but that
    // helper itself must only call setSearchParams once. Either way, count total setSearchParams
    // invocations reachable from onApply's own body plus a directly-referenced single-write helper.
    if (setSearchParamsCallCount > 1) {
      failures.push(
        `onApply calls setSearchParams ${setSearchParamsCallCount} times directly — react-router does not chain multiple synchronous calls, so only the last field would survive Apply`
      );
    }
  }

  // The combined helper (however named) must exist and write status/has_balance, customer_id, and
  // source_load_id from a SINGLE setSearchParams call.
  const helperMatch = src.match(/function (\w+)\([^)]*\)\s*\{\s*setSearchParams\(\s*\(prev\)\s*=>\s*\{([\s\S]{0,900}?)return params;/);
  if (!helperMatch) {
    failures.push("no single setSearchParams((prev) => {...return params}) combined-write helper found");
  } else {
    const helperBody = helperMatch[2];
    const fields = ["status", "has_balance", "customer_id", "source_load_id"];
    for (const field of fields) {
      if (!helperBody.includes(`"${field}"`)) {
        failures.push(`combined-write helper does not touch "${field}"`);
      }
    }
    // The helper's own body must call setSearchParams only once (it IS the single write).
    const nestedCalls = (helperMatch[0].match(/setSearchParams\(/g) ?? []).length;
    if (nestedCalls > 1) {
      failures.push("combined-write helper itself calls setSearchParams more than once");
    }
  }

  return failures;
}

if (process.argv.includes("--selftest")) {
  const GOOD = `
    function applyUrlFilters(next) {
      setSearchParams((prev) => {
        const params = new URLSearchParams(prev);
        params.delete("status");
        params.delete("has_balance");
        if (next.status === "with_balance") params.set("has_balance", "true");
        else if (next.status) params.set("status", next.status);
        if (next.customerId) params.set("customer_id", next.customerId);
        else params.delete("customer_id");
        if (next.sourceLoadId) params.set("source_load_id", next.sourceLoadId);
        else params.delete("source_load_id");
        return params;
      }, { replace: true });
    }
    const staged = useStagedListFilters({
      applied: { status, customerId, fromDate, toDate, sourceLoadId },
      empty: EMPTY,
      onApply: (next) => {
        applyUrlFilters({ status: next.status, customerId: next.customerId, sourceLoadId: next.sourceLoadId });
        setFromDate(next.fromDate);
        setToDate(next.toDate);
      },
    });
  `;
  const goodFailures = check(GOOD);
  if (goodFailures.length) {
    console.error(`[${LABEL}] selftest FAIL: known-good fixture should pass — ${goodFailures.join("; ")}`);
    process.exit(1);
  }

  const REGRESSED = `
    function setCustomerId(next) {
      setSearchParams((prev) => {
        const params = new URLSearchParams(prev);
        if (next) params.set("customer_id", next); else params.delete("customer_id");
        return params;
      }, { replace: true });
    }
    function setStatus(next) {
      setSearchParams((prev) => {
        const params = new URLSearchParams(prev);
        params.delete("status");
        params.delete("has_balance");
        if (next) params.set("status", next);
        return params;
      }, { replace: true });
    }
    const staged = useStagedListFilters({
      applied: { status, customerId, fromDate, toDate, sourceLoadId },
      empty: EMPTY,
      onApply: (next) => {
        setStatus(next.status);
        setCustomerId(next.customerId);
        setFromDate(next.fromDate);
        setToDate(next.toDate);
        setSourceLoadId(next.sourceLoadId);
      },
    });
  `;
  const regressedFailures = check(REGRESSED);
  if (!regressedFailures.length) {
    console.error(`[${LABEL}] selftest FAIL: regressed (multi-call) fixture should fail`);
    process.exit(1);
  }

  const missingFailures = check(null);
  if (missingFailures.length !== 1) {
    console.error(`[${LABEL}] selftest FAIL: missing-file fixture should report exactly one failure`);
    process.exit(1);
  }

  console.log(`[${LABEL}] selftest: PASS — good/regressed/missing fixtures classify correctly`);
  process.exit(0);
}

const filePath = path.join(ROOT, FILE);
const src = fs.existsSync(filePath) ? fs.readFileSync(filePath, "utf8") : null;
const failures = check(src);

if (failures.length) {
  console.error(`[${LABEL}] FAILED — ${failures.length} check(s) regressed:`);
  for (const f of failures) console.error("  ✗", f);
  process.exit(1);
}
console.log(`[${LABEL}] PASS — InvoicesListPage's staged-filter Apply writes status/customer_id/source_load_id in one combined setSearchParams call`);
