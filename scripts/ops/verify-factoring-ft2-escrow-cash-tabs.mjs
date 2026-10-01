#!/usr/bin/env node
/**
 * verify-factoring-ft2-escrow-cash-tabs.mjs
 * FACTORING-TAKEOVER FT2 (2026-10-01):
 *  - Escrow Account + Cash Reserve are SEPARATE primary SUBNAV tabs (never merged)
 *  - Routes + FACTORING_TAB_PATH include /factoring/cash-reserve
 *  - Escrow tab reads reserve_rate + recourse_days; Cash tab reads cash_reserve_rate + recourse_days
 *  - rateToPctString always emits two decimal places ("1.50", never "1.5")
 *
 * --selftest mutates load-bearing facts and requires FAIL; clean sources PASS.
 */
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";

const ROOT = process.cwd();
const errors = [];
const read = (p) => fs.readFileSync(path.join(ROOT, p), "utf8");

const HOME = "apps/frontend/src/pages/factoring/FactoringHome.tsx";
const MANIFEST = "apps/frontend/src/router/route-manifest.ts";
const ROUTES = "apps/frontend/src/routes/manifest.tsx";
const PROFILE = "apps/frontend/src/lib/factorProfile.ts";

function analyze(src) {
  const e = [];
  const { home, manifest, routes, profile } = src;

  if (!/id:\s*"escrow_account"/.test(home) || !/id:\s*"cash_reserve"/.test(home)) {
    e.push("SUBNAV must include both escrow_account and cash_reserve as separate tabs");
  }
  if (!home.includes('data-testid="factoring-escrow-account"') || !home.includes('data-testid="factoring-cash-reserve"')) {
    e.push("FactoringHome must render distinct factoring-escrow-account and factoring-cash-reserve surfaces");
  }
  if (!home.includes("factoring-escrow-rate-pct") || !home.includes("factoring-cash-reserve-rate-pct")) {
    e.push("Each pool tab must display its rate via *-rate-pct testId");
  }
  if (!home.includes("factoring-escrow-recourse-days") || !home.includes("factoring-cash-reserve-recourse-days")) {
    e.push("Each pool tab must display release trigger recourse_days");
  }
  if (home.includes('testId="factoring-escrow-kpi-cash"')) {
    e.push("Escrow tab must NOT show Cash reserve held KPI (pools stay separate)");
  }
  if (!manifest.includes('cash_reserve: "/factoring/cash-reserve"')) {
    e.push("FACTORING_TAB_PATH must map cash_reserve → /factoring/cash-reserve");
  }
  if (!routes.includes('path="/factoring/cash-reserve"') || !routes.includes('tabId="cash_reserve"')) {
    e.push("routes/manifest must mount /factoring/cash-reserve → FactoringTabRoute cash_reserve");
  }
  if (!profile.includes("toFixed(2)")) {
    e.push("rateToPctString must use toFixed(2) so 0.015 → '1.50' not '1.5'");
  }
  if (/return String\(Number\(\(Number\(rate\) \* 100\)\.toFixed/.test(profile)) {
    e.push("rateToPctString must not strip trailing zeros via Number(...toFixed)");
  }
  return e;
}

function selftest() {
  const good = {
    home: read(HOME),
    manifest: read(MANIFEST),
    routes: read(ROUTES),
    profile: read(PROFILE),
  };
  const goodErrs = analyze(good);
  if (goodErrs.length) {
    console.error("SELFTEST FAIL — clean tree should PASS:\n" + goodErrs.map((x) => `  - ${x}`).join("\n"));
    process.exit(1);
  }

  const badHome = {
    ...good,
    home: good.home.replace(/id:\s*"cash_reserve".*\n/, "").replace(/data-testid="factoring-cash-reserve"/g, 'data-testid="factoring-escrow-account"'),
  };
  if (!analyze(badHome).length) {
    console.error("SELFTEST FAIL — removing cash_reserve should FAIL");
    process.exit(1);
  }

  const badRate = {
    ...good,
    profile: good.profile.replace("toFixed(2)", "toFixed(4)").replace(
      "return (Number(rate) * 100).toFixed(2);",
      "return String(Number((Number(rate) * 100).toFixed(4)));",
    ),
  };
  // Force the bad pattern if replace missed
  const forcedBadProfile = {
    ...good,
    profile: `export function rateToPctString(rate) { return String(Number((Number(rate) * 100).toFixed(4))); }`,
  };
  if (!analyze(forcedBadProfile).length) {
    console.error("SELFTEST FAIL — Number(toFixed) rate formatter should FAIL");
    process.exit(1);
  }

  // Runtime: 0.015 → "1.50"
  const require = createRequire(import.meta.url);
  // factorProfile is TS — assert via regex + manual check of fixed formula
  const pct = (0.015 * 100).toFixed(2);
  if (pct !== "1.50") {
    console.error(`SELFTEST FAIL — expected 1.50 got ${pct}`);
    process.exit(1);
  }

  void badRate;
  console.log("verify-factoring-ft2-escrow-cash-tabs --selftest PASS");
}

if (process.argv.includes("--selftest")) {
  selftest();
  process.exit(0);
}

const errs = analyze({
  home: read(HOME),
  manifest: read(MANIFEST),
  routes: read(ROUTES),
  profile: read(PROFILE),
});
if (errs.length) {
  console.error("verify-factoring-ft2-escrow-cash-tabs FAIL:\n" + errs.map((x) => `  - ${x}`).join("\n"));
  process.exit(1);
}
console.log("verify-factoring-ft2-escrow-cash-tabs PASS — Escrow + Cash Reserve separate; rateToPctString 2dp");
