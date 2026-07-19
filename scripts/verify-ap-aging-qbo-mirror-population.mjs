#!/usr/bin/env node
/**
 * ACCOUNTING-2 — A/P Aging QBO mirror population / honesty guard (Rule 17 auto-discovered via 925-).
 *
 * Semantic locks:
 *   (1) Internal aging = accounting.bills reconstructed with ap_aging_as_of payment semantics
 *       + vendor_credit_applications netting (entity + as-of).
 *   (2) QBO mirror status separate; freshness uses canonical 24h QBO_SYNC_STALE_AFTER_MS on the
 *       AP-mirror source ONLY (ap_bills_inbound_mirror) — QBO-STALENESS-B, no aggregate masking.
 *   (3) Reconcile never claims matched when as_of is historical / mirror N/A (incomparable).
 *   (4) Inbound pull: HTTP outside txn; upsert short txn; durable qbo.sync_runs audit; no TMS→QBO.
 *   (5) UI shows flags / freshness / signed delta / false-empty; bills drill-through.
 *
 * --selftest exercises assertGuard() against inline fixtures.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = "verify-ap-aging-qbo-mirror-population";

const PATHS = {
  svc: "apps/backend/src/accounting/ap-aging.service.ts",
  page: "apps/frontend/src/pages/accounting/AccountsPayableAgingPage.tsx",
  puller: "apps/backend/src/qbo-sync/ap-bills-puller.ts",
  kind: "apps/backend/src/qbo-sync/ap-bills-sync-kind.ts",
  freshness: "apps/backend/src/qbo/sync-freshness.ts",
  api: "apps/frontend/src/api/accounting.ts",
  test: "apps/backend/src/accounting/ap-aging.service.test.ts",
  pullerTest: "apps/backend/src/qbo-sync/__tests__/ap-bills-puller-txn.unit.test.ts",
};

function stripComments(src) {
  return src.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/\/\/.*$/gm, "");
}

export function assertGuard(src) {
  const errs = [];
  const { svc, page, puller, kind, freshness, api, test, pullerTest } = src;

  // (1) TMS basis + as-of payments + credits
  if (!svc.includes('internal_basis') || !svc.includes('"accounting.bills"')) {
    errs.push(`${PATHS.svc}: must declare internal_basis accounting.bills`);
  }
  if (!svc.includes("AP_AGING_OPEN_BILLS_SQL") || !svc.includes("FROM accounting.bill_payments bp")) {
    errs.push(`${PATHS.svc}: must reconstruct open A/P via bill_payments as-of (ap_aging_as_of semantics)`);
  }
  if (!svc.includes("vendor_credit_applications")) {
    errs.push(`${PATHS.svc}: must net applied vendor_credit_applications`);
  }
  if (!svc.includes("isHistoricalAsOf") || !svc.includes("reconcile_applicable") || !svc.includes("incomparable")) {
    errs.push(`${PATHS.svc}: must mark historical as_of incomparable for mirror reconcile`);
  }
  if (/\bb\.paid_cents\b/.test(svc) && /AP_AGING_OPEN_BILLS_SQL[\s\S]*b\.paid_cents/.test(svc)) {
    errs.push(`${PATHS.svc}: open SQL must not use live b.paid_cents snapshot`);
  }
  {
    const stripped = stripComments(svc);
    // Full write-keyword fence — never narrow. UPDATE…SET (e.g. "healing" paid_cents drift) must be
    // caught alongside INSERT/DELETE/DDL/TRUNCATE/MERGE on this financial reporting path.
    if (/\bINSERT\s+INTO\b|\bUPDATE\b[\s\S]{0,120}?\bSET\b|\bDELETE\s+FROM\b|\bCREATE\s+TABLE\b|\bALTER\s+TABLE\b|\bDROP\s+TABLE\b|\bTRUNCATE\s+TABLE\b|\bMERGE\s+INTO\b/i.test(stripped)) {
      errs.push(`${PATHS.svc}: aging service must stay SQL read-only`);
    }
  }

  // (2) QBO-STALENESS-B — canonical 24h, per AP source
  if (!freshness.includes("QBO_SYNC_STALE_AFTER_MS = 24 * 60 * 60 * 1000")) {
    errs.push(`${PATHS.freshness}: canonical 24h threshold missing`);
  }
  if (!svc.includes("computeQboSyncFreshness") || !svc.includes("QBO_SYNC_STALE_AFTER_MS")) {
    errs.push(`${PATHS.svc}: must reuse computeQboSyncFreshness / QBO_SYNC_STALE_AFTER_MS`);
  }
  if (!kind.includes("ap_bills_inbound_mirror") || !svc.includes("AP_BILLS_MIRROR_SYNC_KIND")) {
    errs.push(`AP mirror sync kind ap_bills_inbound_mirror must be shared + queried`);
  }
  if (/master_data_cdc/.test(svc) && /computeQboSyncFreshness\(\[[\s\S]*master_data_cdc/.test(svc)) {
    errs.push(`${PATHS.svc}: must not aggregate-mask AP freshness with master_data_cdc`);
  }

  // (3) Mirror status shape
  for (const needle of [
    "qbo_mirror",
    "pull_enabled",
    "projection_enabled",
    "freshness",
    "empty_state",
    "delta_cents",
  ]) {
    if (!svc.includes(needle)) errs.push(`${PATHS.svc}: missing '${needle}'`);
  }
  if (!api.includes("ApAgingQboMirrorStatus") || !api.includes("reconcile_applicable")) {
    errs.push(`${PATHS.api}: FE contract missing qbo_mirror fields`);
  }

  // (4) Puller txn + durable audit
  if (!puller.includes("beginApMirrorSyncRun") || !puller.includes("finishApMirrorSyncRun")) {
    errs.push(`${PATHS.puller}: missing durable sync_runs audit helpers`);
  }
  if (!puller.includes("INSERT INTO qbo.sync_runs") || !puller.includes("ON CONFLICT (operating_company_id, qbo_id)")) {
    errs.push(`${PATHS.puller}: must upsert mdata.qbo_ap_bills + audit qbo.sync_runs`);
  }
  if (/process\.env\.(QBO_AP_MIRROR_PULL_ENABLED|QBO_AP_BILLS_PROJECTION_ENABLED)/.test(puller)) {
    errs.push(`${PATHS.puller}: must not use process.env gate`);
  }
  if (
    /INSERT INTO mdata\.qbo_ap_bills[\s\S]*FROM accounting\.bills/.test(puller) ||
    /FROM accounting\.bills[\s\S]*INSERT INTO mdata\.qbo_ap_bills/.test(puller)
  ) {
    errs.push(`${PATHS.puller}: must never invent mirror rows from TMS bills`);
  }
  // HTTP before upsert txn: qboPaginateEntity must appear in pullApBillsFromQbo before upsertApBillMirror
  const pullFn = puller.slice(puller.indexOf("export async function pullApBillsFromQbo"));
  const paginateIdx = pullFn.indexOf("qboPaginateEntity");
  const upsertIdx = pullFn.indexOf("upsertApBillMirror");
  if (paginateIdx < 0 || upsertIdx < 0 || paginateIdx > upsertIdx) {
    errs.push(`${PATHS.puller}: QBO pagination must run outside/before upsert transaction`);
  }
  if (!/catch \(error\) \{[\s\S]*finishApMirrorSyncRun\([\s\S]*success:\s*false/.test(puller)) {
    errs.push(`${PATHS.puller}: failed audit must commit in catch (durable)`);
  }

  // (5) UI honesty
  if (!page.includes("ap-aging-qbo-mirror-status") || !page.includes("pull_enabled")) {
    errs.push(`${PATHS.page}: must render mirror pull/projection/freshness panel`);
  }
  if (!page.includes("from TMS bills") || !page.includes("emptyMessage")) {
    errs.push(`${PATHS.page}: must name TMS basis + false-empty messaging`);
  }
  if (!page.includes("no match claim") && !page.includes("incomparable")) {
    errs.push(`${PATHS.page}: must refuse match claim when N/A or historical`);
  }
  if (/subtitle="[^"]*(tie to QBO|mirrored from QuickBooks)[^"]*"/i.test(page)) {
    errs.push(`${PATHS.page}: hardcoded unconditional QBO-tie subtitle forbidden`);
  }
  if (!page.includes("/accounting/bills?vendor_id=")) {
    errs.push(`${PATHS.page}: must forward-drill open bills`);
  }

  // (6) Behavioral tests present
  if (!test.includes("vendor_credit_applications") || !test.includes("incomparable")) {
    errs.push(`${PATHS.test}: missing credit / historical reconcile behavioral coverage`);
  }
  if (!test.includes("QBO_SYNC_STALE_AFTER_MS") || !test.includes("24")) {
    errs.push(`${PATHS.test}: missing 24h freshness boundary coverage`);
  }
  if (!pullerTest || !pullerTest.includes("finishApMirrorSyncRun") || !pullerTest.includes("qboPaginateEntity")) {
    errs.push(`${PATHS.pullerTest}: missing durable-audit / txn-boundary coverage`);
  }

  return errs;
}

function selftest() {
  const good = {
    svc: `
      import { computeQboSyncFreshness, QBO_SYNC_STALE_AFTER_MS } from "../qbo/sync-freshness.js";
      import { AP_BILLS_MIRROR_SYNC_KIND } from "../qbo-sync/ap-bills-sync-kind.js";
      export const AP_AGING_OPEN_BILLS_SQL = \`FROM accounting.bills b FROM accounting.bill_payments bp vendor_credit_applications\`;
      function isHistoricalAsOf(){}
      reconcile_applicable incomparable
      internal_basis: "accounting.bills"
      qbo_mirror pull_enabled projection_enabled freshness empty_state delta_cents
      computeQboSyncFreshness([{ source: "qbo_sync_runs", completedAt }])
    `,
    page: `
      data-testid="ap-aging-qbo-mirror-status"
      pull_enabled from TMS bills emptyMessage
      no match claim when source N/A
      /accounting/bills?vendor_id=
    `,
    puller: `
      export async function pullApBillsFromQbo() {
        beginApMirrorSyncRun();
        for await (const page of qboPaginateEntity) {}
        await withLuciaBypass(async (client) => { await upsertApBillMirror(); });
        ON CONFLICT (operating_company_id, qbo_id)
        INSERT INTO qbo.sync_runs
        isEnabled(client, AP_MIRROR_PULL_FLAG
        try {} catch (error) { finishApMirrorSyncRun({ success: false }); throw error; }
      }
      finishApMirrorSyncRun beginApMirrorSyncRun
    `,
    kind: `export const AP_BILLS_MIRROR_SYNC_KIND = "ap_bills_inbound_mirror";`,
    freshness: `export const QBO_SYNC_STALE_AFTER_MS = 24 * 60 * 60 * 1000;`,
    api: `export type ApAgingQboMirrorStatus = { reconcile_applicable: boolean };`,
    test: `vendor_credit_applications incomparable QBO_SYNC_STALE_AFTER_MS 24`,
    pullerTest: `finishApMirrorSyncRun qboPaginateEntity`,
  };
  const cases = [
    { n: "well-formed → 0", in: good, want: 0 },
    { n: "svc missing credits", in: { ...good, svc: good.svc.replace("vendor_credit_applications", "") }, min: 1 },
    {
      n: "puller invents from TMS",
      in: { ...good, puller: good.puller + "\nINSERT INTO mdata.qbo_ap_bills SELECT * FROM accounting.bills" },
      min: 1,
    },
    {
      n: "page hardcoded QBO tie",
      in: { ...good, page: good.page + `\n<Wrap subtitle="totals tie to QBO's A/P aging.">` },
      min: 1,
    },
  ];
  let f = 0;
  for (const c of cases) {
    const n = assertGuard(c.in).length;
    const ok = c.want !== undefined ? n === c.want : n >= c.min;
    if (!ok) f++;
    console.log(`${ok ? "ok  " : "FAIL"}  ${c.n}  (errors=${n})`);
  }
  if (f) {
    console.error(`\n${LABEL} SELFTEST FAILED: ${f}`);
    process.exit(1);
  }
  console.log(`\n${LABEL} SELFTEST PASS`);
}

function readRel(rel) {
  try {
    return fs.readFileSync(path.join(ROOT, rel), "utf8");
  } catch {
    return null;
  }
}

if (process.argv.includes("--selftest")) {
  selftest();
  process.exit(0);
}

const loaded = Object.fromEntries(Object.entries(PATHS).map(([k, rel]) => [k, readRel(rel)]));
if (Object.values(loaded).some((v) => v == null)) {
  console.error(`[${LABEL}] FAILED — missing source file`);
  process.exit(1);
}
const errs = assertGuard(loaded);
if (errs.length) {
  console.error(`[${LABEL}] FAILED — ${errs.length} issue(s):`);
  for (const e of errs) console.error(`  ✗ ${e}`);
  process.exit(1);
}
console.log(
  `[${LABEL}] OK — A/P Aging: TMS as-of+credits basis; AP-source 24h freshness; durable inbound audit; UI honesty.`
);
