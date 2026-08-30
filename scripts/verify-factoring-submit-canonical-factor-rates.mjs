#!/usr/bin/env node
/**
 * verify-factoring-submit-canonical-factor-rates — guard against dual-path + ungoverned defaults.
 *
 * SubmitFactoringModal batch submit rates MUST come from canonical factoring.factor
 * (listFactors advance_rate / reserve_rate / fee_rate — same source as FactoringHome KPI),
 * not mdata.vendors vendor-notes parseVendorNotes, and MUST NOT seed 92/8/0 when no factor resolves.
 *
 * FACT-RESERVE-02: omitted factor_fee_pct must not silently default to 0 on the create route.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = "verify-factoring-submit-canonical-factor-rates";
const PAGE = "apps/frontend/src/pages/accounting/SubmitFactoringModal.tsx";
const ROUTES = "apps/backend/src/accounting/factoring-advances.routes.ts";

function read(rel) {
  const full = path.join(ROOT, rel);
  if (!fs.existsSync(full)) {
    console.error(`[${LABEL}] FAIL: missing ${rel}`);
    process.exit(1);
  }
  return fs.readFileSync(full, "utf8");
}

function pass(msg) {
  console.log(`[${LABEL}] PASS: ${msg}`);
}

function fail(msg) {
  console.error(`[${LABEL}] FAIL: ${msg}`);
  process.exit(1);
}

function checkPage(src) {
  if (src.includes("parseVendorNotes")) {
    return "must not derive submit rates via parseVendorNotes (mdata.vendors dual-path)";
  }
  if (!src.includes("listFactors")) {
    return "must load canonical factor rates via listFactors";
  }
  if (!/activeFactor\.advance_rate/.test(src)) {
    return "must default advance rate from activeFactor.advance_rate";
  }
  if (!/activeFactor\.reserve_rate/.test(src)) {
    return "must default reserve rate from activeFactor.reserve_rate";
  }
  if (!/activeFactor\.fee_rate/.test(src)) {
    return "must default factor fee from activeFactor.fee_rate";
  }
  if (/useState\("92"\)/.test(src) || /useState\("8"\)/.test(src)) {
    return "must not seed advance 92 / reserve 8 when no factor resolves";
  }
  if (/const \[factorFeePct, setFactorFeePct\] = useState\("0"\)/.test(src)) {
    return "must not seed factorFeePct to 0 (silent fee-omission bug)";
  }
  if (!src.includes('return activeFactors[0] ?? null') === false && src.includes("return activeFactors[0] ?? null")) {
    return "must not silent-fallback to activeFactors[0] when multiple factors exist";
  }
  if (src.includes("return activeFactors[0] ?? null")) {
    return "must not silent-fallback to activeFactors[0] when multiple factors exist";
  }
  if (!src.includes("No factor resolved")) {
    return "submit must FAIL CLOSED when no factor resolves";
  }
  if (/factor_fee_pct: Number\(factorFeePct \|\| 0\)/.test(src)) {
    return "must not coerce omitted factor_fee_pct to 0 on submit";
  }
  return null;
}

function checkRoutes(src) {
  const createIdx = src.indexOf("const createBodySchema");
  if (createIdx === -1) return "createBodySchema missing";
  const nextConst = src.indexOf("\nconst ", createIdx + 1);
  const block = src.slice(createIdx, nextConst === -1 ? undefined : nextConst);
  if (/factor_fee_pct:[\s\S]*?\.optional\(\)\.default\(0\)/.test(block)) {
    return "createBodySchema factor_fee_pct must not optional().default(0)";
  }
  if (!/factor_fee_pct: z\.coerce\.number\(\)\.min\(0\)\.max\(100\),/.test(block)) {
    return "createBodySchema must require factor_fee_pct (no omit-to-zero)";
  }
  const feeLine = src.match(/Math\.round\(\(invoiceTotalCents \* Number\(body\.data\.factor_fee_pct[^)]*\)/);
  if (feeLine && feeLine[0].includes("?? 0")) {
    return "feeAmount must not coerce omitted factor_fee_pct with ?? 0";
  }
  return null;
}

function selftest() {
  const badPage = `
    const [advanceRatePct, setAdvanceRatePct] = useState("92");
    const [reservePct, setReservePct] = useState("8");
    const [factorFeePct, setFactorFeePct] = useState("0");
    listFactors();
    activeFactor.advance_rate; activeFactor.reserve_rate; activeFactor.fee_rate;
    return activeFactors[0] ?? null;
    factor_fee_pct: Number(factorFeePct || 0),
  `;
  const badRoutes = `
const createBodySchema = z.object({
  factor_fee_pct: z.coerce.number().min(0).max(100).optional().default(0),
});
const advanceBodySchema = z.object({});
const feeAmount = Math.round((invoiceTotalCents * Number(body.data.factor_fee_pct ?? 0)) / 100);
`;
  const pageErr = checkPage(badPage);
  const routeErr = checkRoutes(badRoutes);
  if (!pageErr) fail("selftest: planted 92/8/0 page must FAIL");
  if (!routeErr) fail("selftest: planted optional().default(0) routes must FAIL");
  pass("selftest planted 92/8/0 + zod default(0) FAIL");
}

if (process.argv.includes("--selftest")) {
  selftest();
  console.log(`\n[${LABEL}] SELFTEST PASSED`);
  process.exit(0);
}

const pageErr = checkPage(read(PAGE));
if (pageErr) fail(`${PAGE} ${pageErr}`);
pass("page: canonical factor rates, no 92/8/0 seeds, fail-closed submit");

const routeErr = checkRoutes(read(ROUTES));
if (routeErr) fail(`${ROUTES} ${routeErr}`);
pass("routes: factor_fee_pct required, no omit-to-zero");

console.log(`\n[${LABEL}] ALL CHECKS PASSED`);
