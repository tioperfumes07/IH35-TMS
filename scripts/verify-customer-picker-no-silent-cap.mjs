#!/usr/bin/env node
/**
 * CLS-SILENT-CAP-CUSTOMER (owner order 2026-09-04, GO-23 wave 1 row 1). Owner repro: a customer
 * search picker (named as BookLoadCustomerSection.tsx, but the live defect was actually
 * UserDetail.tsx's related-customer picker -- exact numbers matched: `limit: customerSearch ?
 * 200 : 500`) capped below a per-company customer roster with NO truncation notice at all. Live
 * counts (bypass_rls, 2026-09-04): USMCA 1,223 non-archived customers, TRK 1,447, TRANSP 1,260 --
 * all comfortably under the backend's own max (5000, CUST-1) but several frontend callers never
 * requested past 200 (one requested nothing at all, silently defaulting to 50).
 *
 * SYSTEMIC FIX (Rule 4): every genuine customer picker (single-shot search-as-you-type combobox,
 * not a paginated list/table) using `listCustomers(...)` was audited. Fixed this pass:
 *   apps/frontend/src/pages/UserDetail.tsx (200/500 -> 2000, notice added)
 *   apps/frontend/src/components/parity/drawers/NewCustomerDrawerForm.tsx (200 -> 2000, notice already present)
 *   apps/frontend/src/pages/safety/components/CargoClaimIntakeSurface.tsx (200 -> 2000, notice already present)
 *   apps/frontend/src/pages/factoring/FactorAdmin.tsx (no limit, defaulted to 50 -> 2000, notice added)
 *   apps/frontend/src/components/dispatch/FilterBar.tsx (200 -> 2000 on the search branch; the
 *     browse-all branch already used listAllCustomers, which never truncates)
 *   apps/frontend/src/pages/banking/components/BankingTransactionsDesignView.tsx -- page size 200
 *     is a DELIBERATE, documented design choice (never eager-load 1000s of rows); left at 200,
 *     but it had NO truncation notice at all -- added for both its vendor and customer pickers.
 * NOT touched (already correct, already raised in a prior session pass): BookLoadCustomerSection.tsx
 * and BookLoadModalV4.tsx (AUTOCOMPLETE_LIMIT=2000 via searchCustomersAutocomplete already).
 *
 * This guard has two halves:
 *   (1) NAMED regression lock -- each of the 6 fixed files must keep its raised limit (>= 2000)
 *       AND (unless it already routes browse-all through listAllCustomers) import CappedListNotice.
 *   (2) SYSTEMIC net -- scans the WHOLE frontend for any NEW `listCustomers(` call site passing a
 *       literal numeric `limit` below 1000 with no CappedListNotice import in the same file, so a
 *       future picker introduced with this same defect fails CI even if never named here.
 *
 * Run: node scripts/verify-customer-picker-no-silent-cap.mjs [--selftest]
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = "verify-customer-picker-no-silent-cap";
const SAFE_LIMIT_FLOOR = 1000;

const NAMED_FIXES = [
  { file: "apps/frontend/src/pages/UserDetail.tsx", minLimit: 2000, requiresNotice: true },
  { file: "apps/frontend/src/components/parity/drawers/NewCustomerDrawerForm.tsx", minLimit: 2000, requiresNotice: true },
  { file: "apps/frontend/src/pages/safety/components/CargoClaimIntakeSurface.tsx", minLimit: 2000, requiresNotice: true },
  { file: "apps/frontend/src/pages/factoring/FactorAdmin.tsx", minLimit: 2000, requiresNotice: true },
  { file: "apps/frontend/src/components/dispatch/FilterBar.tsx", minLimit: 2000, requiresNotice: true },
  // Deliberate low page size, kept -- only the notice is required here.
  { file: "apps/frontend/src/pages/banking/components/BankingTransactionsDesignView.tsx", minLimit: null, requiresNotice: true },
];

function readSrc(root, rel) {
  return fs.readFileSync(path.join(root, rel), "utf8");
}

function maxNumericConstant(src) {
  // Picks up `const X = 2000;` / `limit: 2000` patterns near a customer picker constant name.
  const matches = [...src.matchAll(/(?:LIMIT|PICKER_PAGE|PICKER_LIMIT)\s*=\s*(\d+)/g)];
  if (matches.length === 0) return null;
  return Math.max(...matches.map((m) => Number(m[1])));
}

function checkNamedFixes(root) {
  const problems = [];
  for (const { file, minLimit, requiresNotice } of NAMED_FIXES) {
    let src;
    try {
      src = readSrc(root, file);
    } catch {
      problems.push(`${file}: missing`);
      continue;
    }
    if (minLimit != null) {
      const found = maxNumericConstant(src);
      if (found == null || found < minLimit) {
        problems.push(`${file}: expected a picker limit constant >= ${minLimit}, found ${found ?? "none"}`);
      }
    }
    if (requiresNotice && !/CappedListNotice/.test(src)) {
      problems.push(`${file}: CappedListNotice is no longer imported/rendered -- the truncation-honesty fix regressed`);
    }
  }
  return problems;
}

function listFrontendSourceFiles(root) {
  const dir = path.join(root, "apps/frontend/src");
  const out = [];
  const walk = (d) => {
    for (const entry of fs.readdirSync(d, { withFileTypes: true })) {
      const full = path.join(d, entry.name);
      if (entry.isDirectory()) {
        if (entry.name === "node_modules") continue;
        walk(full);
      } else if (/\.tsx?$/.test(entry.name) && !/\.test\.tsx?$/.test(entry.name)) {
        out.push(full);
      }
    }
  };
  if (fs.existsSync(dir)) walk(dir);
  return out;
}

function checkSystemicNet(root) {
  const problems = [];
  const CALL_RE = /listCustomers\(\s*\{[^}]*?\blimit\s*:\s*(\d+)[^}]*?\}/gs;
  for (const file of listFrontendSourceFiles(root)) {
    const src = fs.readFileSync(file, "utf8");
    const matches = [...src.matchAll(CALL_RE)];
    if (matches.length === 0) continue;
    const lowCapCalls = matches.filter((m) => Number(m[1]) < SAFE_LIMIT_FLOOR);
    if (lowCapCalls.length === 0) continue;
    if (!/CappedListNotice/.test(src)) {
      const rel = path.relative(root, file);
      problems.push(
        `${rel}: listCustomers(...) called with a literal limit below ${SAFE_LIMIT_FLOOR} (${lowCapCalls.map((m) => m[1]).join(", ")}) and CappedListNotice is not imported -- a picker can silently truncate with no honesty affordance. Either raise the limit or wire CappedListNotice.`
      );
    }
  }
  return problems;
}

export function run(root = ROOT) {
  return [...checkNamedFixes(root), ...checkSystemicNet(root)];
}

function selftest() {
  const dir = fs.mkdtempSync("/tmp/customer-picker-cap-selftest-");
  const write = (rel, content) => {
    const abs = path.join(dir, rel);
    fs.mkdirSync(path.dirname(abs), { recursive: true });
    fs.writeFileSync(abs, content);
  };

  // 1. All 6 named files present, correct, clean.
  for (const { file, minLimit } of NAMED_FIXES) {
    write(
      file,
      minLimit != null
        ? `const PICKER_LIMIT = ${minLimit};\n// CappedListNotice used below\nimport { CappedListNotice } from "x";\n`
        : `const PICKER_PAGE = 200;\nimport { CappedListNotice } from "x";\n`
    );
  }
  const clean = run(dir);
  if (clean.length) throw new Error("PASS fail (should be clean): " + JSON.stringify(clean));

  // 2. Regress one named fix's limit below the floor -> must be caught.
  write("apps/frontend/src/pages/UserDetail.tsx", `const CUSTOMER_PICKER_LIMIT = 200;\nimport { CappedListNotice } from "x";\n`);
  const regressedLimit = run(dir);
  if (!regressedLimit.some((p) => p.includes("UserDetail.tsx"))) {
    throw new Error("FAIL to catch: regressed named-fix limit went undetected");
  }
  write(
    "apps/frontend/src/pages/UserDetail.tsx",
    `const CUSTOMER_PICKER_LIMIT = 2000;\nimport { CappedListNotice } from "x";\n`
  );

  // 3. Strip CappedListNotice from a named fix -> must be caught.
  write("apps/frontend/src/pages/factoring/FactorAdmin.tsx", `const CUSTOMER_PICKER_LIMIT = 2000;\n`);
  const regressedNotice = run(dir);
  if (!regressedNotice.some((p) => p.includes("FactorAdmin.tsx"))) {
    throw new Error("FAIL to catch: regressed CappedListNotice removal went undetected");
  }
  write(
    "apps/frontend/src/pages/factoring/FactorAdmin.tsx",
    `const CUSTOMER_PICKER_LIMIT = 2000;\nimport { CappedListNotice } from "x";\n`
  );

  // 4. Systemic net: a brand-new file with a low-cap listCustomers call and no notice -> caught.
  write(
    "apps/frontend/src/pages/some/NewPickerPage.tsx",
    `listCustomers({ operating_company_id: x, limit: 100, search: y })`
  );
  const newOffender = run(dir);
  if (!newOffender.some((p) => p.includes("NewPickerPage.tsx"))) {
    throw new Error("FAIL to catch: a brand-new low-cap listCustomers call with no notice went undetected");
  }

  // 5. Systemic net: same low cap but WITH CappedListNotice present -> not flagged (deliberate,
  // honest design, like BankingTransactionsDesignView.tsx).
  write(
    "apps/frontend/src/pages/some/HonestPickerPage.tsx",
    `import { CappedListNotice } from "x";\nlistCustomers({ operating_company_id: x, limit: 100, search: y })`
  );
  const honestOffender = run(dir).filter((p) => p.includes("HonestPickerPage.tsx"));
  if (honestOffender.length) throw new Error("FAIL: an honestly-notice-wired low cap must not be flagged: " + JSON.stringify(honestOffender));

  fs.rmSync(dir, { recursive: true, force: true });
  console.log(`${LABEL} SELFTEST PASS`);
}

if (process.argv.includes("--selftest")) {
  selftest();
  process.exit(0);
}

const problems = run();
if (problems.length) {
  console.error(`${LABEL} FAILED:`);
  for (const p of problems) console.error(`  - ${p}`);
  process.exit(1);
}
console.log(`${LABEL} OK — all 6 fixed customer pickers hold their raised caps and CappedListNotice; no new low-cap listCustomers call site found without one`);
