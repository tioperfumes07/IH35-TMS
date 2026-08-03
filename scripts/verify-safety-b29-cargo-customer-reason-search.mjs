#!/usr/bin/env node
/**
 * GUARD: Cargo claim claimant + reason pickers server-search (SAF-B29).
 * Wave-2 wired driver/unit/load; customer + reason stayed silent 200-cap.
 */
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const ROOT = new URL("..", import.meta.url).pathname.replace(/\/$/, "");
const FILE = join(ROOT, "apps/frontend/src/pages/safety/components/CargoClaimIntakeSurface.tsx");
const strip = (s) => s.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/\/\/[^\n]*/g, " ");
const LABEL = "verify-safety-b29-cargo-customer-reason-search";

export function run() {
  const s = strip(readFileSync(FILE, "utf8"));
  const checks = [
    ["customer-term-state", /const \[customerSearch, setCustomerSearch\] = useState/.test(s)],
    ["reason-term-state", /const \[reasonSearch, setReasonSearch\] = useState/.test(s)],
    ["customer-reaches-server", /search:\s*customerSearch \|\| undefined/.test(s)],
    ["reason-reaches-server", /search:\s*reasonSearch \|\| undefined/.test(s)],
    ["customer-in-query-key", /"cargo-claim-picker",\s*operatingCompanyId,\s*customerSearch/.test(s)],
    ["reason-in-query-key", /"cargo-claim-reasons",\s*operatingCompanyId,\s*reasonSearch/.test(s)],
    ["customer-onSearch", /onSearch=\{setCustomerSearch\}/.test(s)],
    ["reason-onSearch", /onSearch=\{setReasonSearch\}/.test(s)],
  ];
  const failed = checks.filter(([, ok]) => !ok).map(([id]) => id);
  return {
    ok: failed.length === 0,
    failed,
    message:
      failed.length === 0
        ? `PASS: cargo claimant+reason server-search (${checks.length}/${checks.length}).`
        : `FAIL: ${failed.join(", ")}`,
  };
}

function selftest() {
  const original = readFileSync(FILE, "utf8");
  if (!run().ok) {
    console.error(`${LABEL} SELFTEST FAIL: already red`);
    process.exit(1);
  }
  try {
    writeFileSync(FILE, original.replace(", customerSearch]", "]"), "utf8");
    const caught = run();
    if (caught.ok || !caught.failed.includes("customer-in-query-key")) {
      console.error(`${LABEL} SELFTEST FAIL: not caught`, caught.message);
      process.exit(1);
    }
  } finally {
    writeFileSync(FILE, original, "utf8");
  }
  console.log(`${LABEL} SELFTEST OK`);
}

if (process.argv.includes("--selftest")) selftest();
else {
  const r = run();
  console.log(r.message);
  if (!r.ok) process.exit(1);
}
