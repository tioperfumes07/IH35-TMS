#!/usr/bin/env node
/**
 * verify-fuel-reconciliation-tabs-url-sync.mjs — Ops FE
 *
 * Root cause: FuelReconciliationPage kept unmatched sub-tabs ("card" | "wo") in local
 * useState — bookmarking /reports/fuel-reconciliation?tab=wo always reset to card.
 *
 * Locks:
 *   1. FuelReconciliationPage uses useSearchParams
 *   2. Active tab derives from searchParams.get("tab") (parseFuelReconTab)
 *   3. Tab clicks update URL via setSearchParams (not local useState tab)
 *
 * Usage:
 *   node scripts/verify-fuel-reconciliation-tabs-url-sync.mjs
 *   node scripts/verify-fuel-reconciliation-tabs-url-sync.mjs --selftest
 */
import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = "verify-fuel-reconciliation-tabs-url-sync";
const PAGE = "apps/frontend/src/pages/reports/FuelReconciliationPage.tsx";

/** Pure checks — takes text so --selftest can inject fixtures. */
export function check(source) {
  const f = [];

  if (!source) {
    f.push(`${PAGE}: missing`);
    return f;
  }

  if (!/useSearchParams/.test(source)) {
    f.push(`${PAGE}: must use useSearchParams to honor ?tab=`);
  }
  if (!/searchParams\.get\(\s*["']tab["']\s*\)/.test(source)) {
    f.push(`${PAGE}: must read active tab from searchParams.get("tab")`);
  }
  if (!/setSearchParams/.test(source)) {
    f.push(`${PAGE}: must sync tab clicks via setSearchParams`);
  }
  if (/useState\s*<\s*["']card["']\s*\|\s*["']wo["']\s*>/.test(source)) {
    f.push(`${PAGE}: must not keep tab in local useState — use URL ?tab= sync`);
  }
  if (!/parseFuelReconTab/.test(source)) {
    f.push(`${PAGE}: must parse ?tab= via parseFuelReconTab helper`);
  }

  return f;
}

export function run() {
  let source;
  try {
    source = fs.readFileSync(path.join(ROOT, PAGE), "utf8");
  } catch {
    source = null;
  }
  return check(source);
}

if (process.argv.includes("--selftest")) {
  const good = `
    import { useSearchParams } from "react-router-dom";
    function parseFuelReconTab(searchParams) {
      const raw = (searchParams.get("tab") ?? "card").toLowerCase();
      return raw === "wo" ? "wo" : "card";
    }
    export function FuelReconciliationPage() {
      const [searchParams, setSearchParams] = useSearchParams();
      const tab = parseFuelReconTab(searchParams);
      const setTab = (next) => {
        setSearchParams((prev) => {
          const params = new URLSearchParams(prev);
          if (next === "card") params.delete("tab");
          else params.set("tab", next);
          return params;
        }, { replace: true });
      };
      return tab;
    }
  `;

  const checks = [
    ["healthy wiring passes", check(good).length === 0],
    [
      "missing useSearchParams caught",
      check(good.replace(/useSearchParams/g, "useParams")).some((x) => x.includes("useSearchParams")),
    ],
    [
      "missing searchParams.get(tab) caught",
      check(good.replace('searchParams.get("tab")', 'searchParams.get("segment")')).some((x) =>
        x.includes('searchParams.get("tab")'),
      ),
    ],
    [
      "local useState tab caught",
      check(`${good}\nconst [tab, setTab] = useState<"card" | "wo">("card");`).some((x) =>
        x.includes("useState"),
      ),
    ],
    [
      "missing parseFuelReconTab caught",
      check(good.replace(/parseFuelReconTab/g, "parseTab")).some((x) => x.includes("parseFuelReconTab")),
    ],
  ];

  const failed = checks.filter(([, ok]) => !ok);
  if (failed.length) {
    console.error(`${LABEL} --selftest FAIL:`);
    for (const [n] of failed) console.error("  ✗ " + n);
    process.exit(1);
  }
  console.log(`${LABEL}: selftest PASS`);
  process.exit(0);
}

const failures = run();
if (failures.length) {
  console.error(`${LABEL}: FAIL`);
  for (const f of failures) console.error(`  - ${f}`);
  process.exit(1);
}

console.log(`${LABEL}: OK — fuel reconciliation unmatched tabs sync ?tab= via URL`);
process.exit(0);
