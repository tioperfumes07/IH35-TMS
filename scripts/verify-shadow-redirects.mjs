#!/usr/bin/env node
/**
 * verify-shadow-redirects.mjs
 * Assert that alias-shadow paths redirect to real routes, not ComingSoonPage / coming-soon stubs.
 *
 * CLS-DEAD-CLICK (2026-08-04): /catalogs/accounts and /catalogs/items had ComingSoon redirects
 * while Live Lists surfaces existed at /lists/accounting/chart-of-accounts and /lists/accounting/items.
 */
import fs from "node:fs";
import path from "node:path";
import process from "node:process";

const ROOT = process.cwd();
const MANIFEST = path.join(ROOT, "apps/frontend/src/routes/manifest.tsx");
const LABEL = "verify-shadow-redirects";

export const SHADOW_REDIRECT_CHECKS = [
  { alias: "/safety/accidents-incidents", realTarget: "/safety/accidents" },
  { alias: "/catalogs/classes", realTarget: "/lists/accounting/classes" },
  { alias: "/catalogs/payment-terms", realTarget: "/lists/accounting/payment-terms" },
  { alias: "/catalogs/posting-templates", realTarget: "/lists/accounting/posting-templates" },
  { alias: "/catalogs/account-role-bindings", realTarget: "/lists/accounting/account-role-bindings" },
  { alias: "/catalogs/accounts", realTarget: "/lists/accounting/chart-of-accounts" },
  { alias: "/accounting/chart-of-accounts", realTarget: "/lists/accounting/chart-of-accounts" },
  { alias: "/catalogs/items", realTarget: "/lists/accounting/items" },
  { alias: "/accounting/recurring-transactions", realTarget: "/accounting/bills/recurring" },
  { alias: "/accounting/period-close", realTarget: "/accounting/month-close" },
];

/** Honest stubs — must still resolve to ComingSoon / coming-soon when no live surface exists. */
export const HONEST_STUB_ALIASES = [];

export function assertShadowRedirects(src, checks = SHADOW_REDIRECT_CHECKS) {
  const errors = [];
  for (const { alias, realTarget } of checks) {
    const idx = src.indexOf(`path="${alias}"`);
    if (idx === -1) {
      errors.push(`${alias}: route not found in manifest`);
      continue;
    }
    const raw = src.slice(idx, idx + 800);
    const nextRoute = raw.indexOf("<Route", 10);
    const block = nextRoute > 0 ? raw.slice(0, nextRoute) : raw;
    if (block.includes(realTarget)) continue;
    if (block.includes("ComingSoonPage") || block.includes("coming-soon")) {
      errors.push(`${alias}: still points to ComingSoon — expected redirect to ${realTarget}`);
    } else {
      errors.push(`${alias}: redirect target not found — expected ${realTarget}`);
    }
  }
  return errors;
}

function selftest() {
  const good = `<Route path="/catalogs/accounts" element={<ProtectedRoute><Navigate to="/lists/accounting/chart-of-accounts" replace /></ProtectedRoute>} />`;
  const bad = `<Route path="/catalogs/accounts" element={<ProtectedRoute><Navigate to="/coming-soon?feature=Chart%20of%20Accounts" replace /></ProtectedRoute>} />`;
  const cases = [
    { name: "live redirect passes", src: good, want: 0 },
    { name: "coming-soon stub fails", src: bad, want: 1 },
  ];
  let failed = 0;
  for (const c of cases) {
    const got = assertShadowRedirects(c.src, [{ alias: "/catalogs/accounts", realTarget: "/lists/accounting/chart-of-accounts" }]).length;
    const ok = got === c.want;
    if (!ok) failed++;
    console.log(`${ok ? "ok  " : "FAIL"}  ${c.name}  (errors=${got}, want=${c.want})`);
  }
  if (failed) {
    console.error(`\n${LABEL} SELFTEST FAILED: ${failed}`);
    process.exit(1);
  }
  console.log(`\n${LABEL} SELFTEST PASS`);
}

function main() {
  if (process.argv.includes("--selftest")) return selftest();
  if (!fs.existsSync(MANIFEST)) {
    console.error(`${LABEL} FAIL: manifest.tsx not found`);
    process.exit(1);
  }
  const src = fs.readFileSync(MANIFEST, "utf8");
  const errors = assertShadowRedirects(src);
  if (errors.length) {
    console.error(`[${LABEL}] FAILED:`);
    for (const e of errors) console.error(`  ✗ ${e}`);
    process.exit(1);
  }
  console.log(`[${LABEL}] OK — ${SHADOW_REDIRECT_CHECKS.length} alias shadow redirect(s) wired to live routes`);
}

main();
