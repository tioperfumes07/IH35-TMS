#!/usr/bin/env node
/**
 * ACCT-2 guard — the A/P Aging page must not FALSELY assert a QuickBooks tie. It showed
 * "totals tie to QBO's A/P aging" unconditionally while reading $0 (the QBO A/P mirror pull is flag-gated
 * OFF). Path A: the tie is real only once the read-only mirror has synced. Locks:
 *   (1) ap-aging.service.ts exposes qbo_synced_at sourced from the canonical mirror mdata.qbo_ap_bills.
 *   (2) AccountsPayableAgingPage keys its subtitle on qbo_synced_at (only claims a QBO tie when synced) —
 *       no unconditional hardcoded "tie to QBO" / "mirrored from QuickBooks" subtitle string remains.
 *
 * --selftest exercises assertGuard() against inline fixtures.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = "verify-ap-aging-qbo-tie";
const SVC = "apps/backend/src/accounting/ap-aging.service.ts";
const PAGE = "apps/frontend/src/pages/accounting/AccountsPayableAgingPage.tsx";

export function assertGuard({ svc, page }) {
  const errs = [];
  if (!/qbo_synced_at/.test(svc) || !/mdata\.qbo_ap_bills/.test(svc))
    errs.push(`${SVC}: does not expose qbo_synced_at from the canonical mirror mdata.qbo_ap_bills`);
  if (!/qbo_synced_at/.test(page))
    errs.push(`${PAGE}: subtitle does not key on qbo_synced_at (must only claim a QBO tie when actually synced)`);
  // no unconditional false-tie subtitle STRING literal (a dynamic subtitle built from qbo_synced_at is fine).
  if (/subtitle="[^"]*(tie to QBO|mirrored from QuickBooks)[^"]*"/i.test(page))
    errs.push(`${PAGE}: still has a hardcoded subtitle asserting a QBO tie unconditionally — make it depend on qbo_synced_at`);
  return errs;
}

function selftest() {
  const goodSvc = `return { vendors, totals, qbo_synced_at: q }; // MAX(updated_at) FROM mdata.qbo_ap_bills`;
  const goodPage = `const apSubtitle = query.data?.qbo_synced_at ? "synced from QuickBooks as of x" : "from TMS bills";\n<Wrap subtitle={apSubtitle}>`;
  const cases = [
    { n: "well-formed → 0", in: { svc: goodSvc, page: goodPage }, want: 0 },
    { n: "svc no qbo_synced_at", in: { svc: `return { vendors, totals };`, page: goodPage }, min: 1 },
    { n: "page not keyed on sync", in: { svc: goodSvc, page: `<Wrap subtitle="static">` }, min: 1 },
    { n: "hardcoded false tie", in: { svc: goodSvc, page: goodPage + `\n<Wrap subtitle="totals tie to QBO's A/P aging.">` }, min: 1 },
  ];
  let f = 0;
  for (const c of cases) {
    const n = assertGuard(c.in).length;
    const ok = c.want !== undefined ? n === c.want : n >= c.min;
    if (!ok) f++;
    console.log(`${ok ? "ok  " : "FAIL"}  ${c.n}  (errors=${n})`);
  }
  if (f) { console.error(`\n${LABEL} SELFTEST FAILED: ${f}`); process.exit(1); }
  console.log(`\n${LABEL} SELFTEST PASS`);
}

if (process.argv.includes("--selftest")) { selftest(); process.exit(0); }
const svc = (() => { try { return fs.readFileSync(path.join(ROOT, SVC), "utf8"); } catch { return null; } })();
const page = (() => { try { return fs.readFileSync(path.join(ROOT, PAGE), "utf8"); } catch { return null; } })();
if (svc == null || page == null) { console.error(`[${LABEL}] FAILED — missing source file`); process.exit(1); }
const errs = assertGuard({ svc, page });
if (errs.length) { console.error(`[${LABEL}] FAILED — ${errs.length} issue(s):`); for (const e of errs) console.error(`  ✗ ${e}`); process.exit(1); }
console.log(`[${LABEL}] OK — A/P Aging only claims a QBO tie when the mirror has synced (qbo_synced_at from mdata.qbo_ap_bills).`);
