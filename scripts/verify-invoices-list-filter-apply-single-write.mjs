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

// LEAD 443.99 class B (2026-10-12).
//   old rule: a staged useStagedListFilters onApply must exist and route through ONE combined-write helper that
//             touches status, has_balance, customer_id and source_load_id.
//   new rule: the invariant without the retired shape —
//             (1) every URL writer is a function whose body makes exactly ONE functional setSearchParams call;
//             (2) no handler (onApply, onClearAll) synchronously invokes more than one URL writer or more than one
//                 setSearchParams — react-router's functional setSearchParams reads the render snapshot, so a
//                 second call drops the first call's fields;
//             (3) the reset path (onClearAll, or a staged onApply when present) goes through one writer that touches
//                 status, has_balance, customer_id and source_load_id.
//   why: FILTER-MULTI-01 (#22497, 8d2aab421e) replaced the staged Apply with immediate per-control writers. The
//        old anchor no longer matched — and Clear all had reintroduced the exact multi-write defect (three writers
//        back to back), now fixed in the page and pinned here.
function writerFunctions(src) {
  const writers = new Map();
  for (const m of src.matchAll(/function (\w+)\([^)]*\)\s*\{([\s\S]*?)\n  \}/g)) {
    const calls = (m[2].match(/setSearchParams\(/g) ?? []).length;
    if (calls > 0) writers.set(m[1], { body: m[2], calls });
  }
  return writers;
}

function handlerBody(src, prop) {
  const i = src.indexOf(`${prop}: (next) => {`) >= 0 ? src.indexOf(`${prop}: (next) => {`) : src.indexOf(`${prop}={() => {`);
  if (i < 0) return null;
  const end = src.indexOf("\n        }", i);
  return src.slice(i, end < 0 ? i + 800 : end);
}

export function check(src) {
  const failures = [];
  if (src === null) return [`${FILE} not found`];
  const writers = writerFunctions(src);
  if (writers.size === 0) failures.push("no URL writer function (setSearchParams((prev) => …)) found — parser stale, refusing to pass vacuously");
  for (const [name, w] of writers) {
    if (w.calls > 1) failures.push(`URL writer ${name}() calls setSearchParams ${w.calls} times — it must be a single write`);
  }
  const resetProp = src.includes("onApply: (next) => {") ? "onApply" : "onClearAll";
  const reset = handlerBody(src, resetProp);
  if (reset === null) {
    failures.push("no reset path (staged onApply or onClearAll) found");
  } else {
    const invoked = [...writers.keys()].filter((name) => new RegExp(`\\b${name}\\(`).test(reset));
    const direct = (reset.match(/setSearchParams\(/g) ?? []).length;
    if (invoked.length + direct > 1) {
      failures.push(`${resetProp} makes ${invoked.length + direct} URL writes (${invoked.join(", ") || "direct"}) — react-router does not chain them, only the last survives`);
    }
    const resetWriter = writers.get(invoked[0] ?? "");
    for (const field of ["status", "has_balance", "customer_id", "source_load_id"]) {
      if (!resetWriter || !resetWriter.body.includes(`"${field}"`)) {
        failures.push(`${resetProp}'s single writer does not touch "${field}"`);
      }
    }
  }
  return failures;
}

if (process.argv.includes("--selftest")) {
  const writer = (name, sig, body) => `  function ${name}(${sig}) {\n    setSearchParams(\n      (prev) => {\n        const params = new URLSearchParams(prev);\n${body}        return params;\n      },\n      { replace: true },\n    );\n  }\n`;
  const STATUS = writer("applyStatusFilters", "next", '        params.delete("status");\n        params.delete("has_balance");\n');
  const LOAD = writer("setSourceLoadFilter", "next", '        params.delete("source_load_id");\n');
  const CUSTOMER = writer("setCustomerFilterAndUrl", "next", '        params.delete("customer_id");\n');
  const CLEAR = writer("clearUrlFilters", "", '        params.delete("status");\n        params.delete("has_balance");\n        params.delete("customer_id");\n        params.delete("source_load_id");\n');
  const GOOD = `${STATUS}${LOAD}${CUSTOMER}${CLEAR}
        onClearAll={() => {
          setSearch("");
          clearUrlFilters();
          setFromDate("");
        }}
  `;
  const goodFailures = check(GOOD);
  if (goodFailures.length) {
    console.error(`[${LABEL}] selftest FAIL: known-good fixture should pass — ${goodFailures.join("; ")}`);
    process.exit(1);
  }

  // The defect this file exists for, in today's shape: Clear all fires three writers back to back.
  const REGRESSED = `${STATUS}${LOAD}${CUSTOMER}
        onClearAll={() => {
          setSearch("");
          applyStatusFilters({ statuses: ["active"] });
          setCustomerFilterAndUrl([]);
          setSourceLoadFilter("");
        }}
  `;
  // A writer that itself calls setSearchParams twice.
  const DOUBLE = GOOD.replace("  function clearUrlFilters() {\n", "  function clearUrlFilters() {\n    setSearchParams((prev) => prev);\n");
  if (!check(DOUBLE).some((f) => /calls setSearchParams 2 times/.test(f))) {
    console.error(`[${LABEL}] selftest FAIL: a double-write writer should fail`);
    process.exit(1);
  }
  // Clear all through one writer that forgets a field.
  const PARTIAL = GOOD.replace('        params.delete("source_load_id");\n        return params;\n      },\n      { replace: true },\n    );\n  }\n\n        onClearAll', "        return params;\n      },\n      { replace: true },\n    );\n  }\n\n        onClearAll");
  if (PARTIAL === GOOD || !check(PARTIAL).some((f) => /source_load_id/.test(f))) {
    console.error(`[${LABEL}] selftest FAIL: a reset writer missing source_load_id should fail`);
    process.exit(1);
  }
  const realFailures = check(fs.existsSync(path.join(ROOT, FILE)) ? fs.readFileSync(path.join(ROOT, FILE), "utf8") : null);
  if (realFailures.length) {
    console.error(`[${LABEL}] selftest FAIL: real page flagged — ${realFailures.join("; ")}`);
    process.exit(1);
  }
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
console.log(`[${LABEL}] PASS — every InvoicesListPage URL writer is one setSearchParams; the reset path is one combined write`);
