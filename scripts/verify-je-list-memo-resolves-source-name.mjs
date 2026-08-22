#!/usr/bin/env node
/**
 * LV-JE-MEMO-RECORD-NOT-VISIBLE — the Manual Journal Entries LIST page (ManualJEListPage.tsx) always
 * rendered "<noun> — not visible" for every memo with an embedded UUID, because humanMemo() called
 * entityLabel(null, uuid, noun) with a HARDCODED null name — structurally unable to resolve, even
 * though 97.7% of live posted JEs (1,885/1,930) have a genuinely resolvable source. FIX: the backend
 * list query (journal-entries.service.ts) now resolves a human document id for the JE's representative
 * source posting (same join convention as ACCT-F5708/account-register.service.ts), and the frontend
 * threads it into entityLabel() as the real name. Live-confirmed before shipping: fuel_event (the
 * dominant shape, 82%+ of live JEs) went from 0/1,558 resolved to 1,417/1,558 (91%) via the SAME
 * unit-number identity FuelTransactionsTable.tsx already uses.
 *
 * This guard locks the shape, not the live numbers (those drift):
 *   (1) backend: the 3 correlated-subquery SQL constants exist and are wired into the SELECT list.
 *   (2) backend: the mdata.units join for fuel_event is NOT scoped by an operating_company_id
 *       predicate against that table (mdata.units has owner_company_id/currently_leased_to_company_id,
 *       never a bare operating_company_id column — a real bug caught live during this fix: a unit
 *       leased cross-entity made the join return NULL even though the fuel_transactions row itself
 *       was already correctly entity-scoped one hop up).
 *   (3) frontend: humanMemo() accepts resolvedSourceId/resolvedDisplayId and passes a real name to
 *       entityLabel() when the embedded uuid matches, not always null.
 *   (4) frontend: both call sites (the Memo column render, and journalEntryListLabel) pass
 *       entry.source_transaction_id / entry.source_transaction_display_id through.
 *
 * Self-test: node scripts/verify-je-list-memo-resolves-source-name.mjs --selftest
 */
import fs from "node:fs";

const LABEL = "verify-je-list-memo-resolves-source-name";
const SERVICE = "apps/backend/src/accounting/journal-entries.service.ts";
const PAGE = "apps/frontend/src/pages/accounting/ManualJEListPage.tsx";

function failures(sources) {
  const out = [];
  const service = sources[SERVICE];
  const page = sources[PAGE];

  // (1) backend resolver wired
  if (!/JE_SOURCE_TRANSACTION_DISPLAY_ID_SQL\s*=/.test(service)) {
    out.push(`${SERVICE}: JE_SOURCE_TRANSACTION_DISPLAY_ID_SQL constant not found`);
  }
  if (!/\$\{JE_SOURCE_TRANSACTION_TYPE_SQL\}\s*AS\s*source_transaction_type/.test(service)) {
    out.push(`${SERVICE}: listJournalEntries SELECT no longer projects source_transaction_type via JE_SOURCE_TRANSACTION_TYPE_SQL`);
  }
  if (!/\$\{JE_SOURCE_TRANSACTION_DISPLAY_ID_SQL\}\s*AS\s*source_transaction_display_id/.test(service)) {
    out.push(`${SERVICE}: listJournalEntries SELECT no longer projects source_transaction_display_id via JE_SOURCE_TRANSACTION_DISPLAY_ID_SQL`);
  }

  // (2) mdata.units join must not be scoped by a nonexistent operating_company_id column on that
  // table, and must not be scoped by je.operating_company_id either (cross-entity lease landmine).
  const unitsJoinMatch = service.match(/LEFT JOIN mdata\.units ftu\s*\n\s*ON[^\n]*/);
  if (!unitsJoinMatch) {
    out.push(`${SERVICE}: could not locate the mdata.units ftu join for fuel_event resolution`);
  } else if (/operating_company_id/.test(unitsJoinMatch[0])) {
    out.push(`${SERVICE}: mdata.units join for fuel_event reintroduced an operating_company_id predicate — mdata.units has no such column, and scoping on je.operating_company_id silently drops cross-entity-leased units (confirmed live: unit 181b5c93... owner=TRK, leased-to=USMCA, fuel posted under TRANSP)`);
  }

  // (3) frontend humanMemo threads the resolved name through
  if (!/export function humanMemo\(\s*memo:[^)]*resolvedSourceId\?:[^)]*resolvedDisplayId\?:/s.test(page)) {
    out.push(`${PAGE}: humanMemo() no longer accepts resolvedSourceId/resolvedDisplayId parameters`);
  }
  if (/entityLabel\(null,\s*uuid,\s*noun\)/.test(page) || /entityLabel\(null,\s*uuid,\s*"Record"\)/.test(page)) {
    out.push(`${PAGE}: humanMemo() still calls entityLabel with a hardcoded null name — the structural bug this fix closes`);
  }

  // (4) both call sites pass the resolved fields through
  if (!/humanMemo\(entry\.memo,\s*entry\.source_transaction_id,\s*entry\.source_transaction_display_id\)/.test(page)) {
    out.push(`${PAGE}: at least one humanMemo(entry.memo, ...) call site no longer threads source_transaction_id/source_transaction_display_id through`);
  }
  const memoCallCount = (page.match(/humanMemo\(entry\.memo,\s*entry\.source_transaction_id,\s*entry\.source_transaction_display_id\)/g) || []).length;
  if (memoCallCount < 2) {
    out.push(`${PAGE}: expected 2 call sites (Memo column render + journalEntryListLabel) threading the resolved fields — found ${memoCallCount}`);
  }

  // (5) bill_payment resolves through the bill it paid (no display id of its own) — the 229-row
  // residual's largest remaining backend gap, closed by a second-hop join.
  if (!/LEFT JOIN accounting\.bill_payments bpp\s*\n\s*ON src\.t = 'bill_payment'/.test(service)) {
    out.push(`${SERVICE}: bill_payment source resolution join (accounting.bill_payments bpp) is missing`);
  }
  if (!/bpay\.display_id,\s*bpay\.bill_number/.test(service)) {
    out.push(`${SERVICE}: reference_display_id COALESCE no longer includes bpay.display_id/bpay.bill_number (the bill_payment's underlying bill)`);
  }

  // (6) frontend covers the 3 void-reversal shapes discovered live (229-row residual) that the
  // original 8-pattern list missed: expense, bill payment, and payment (customer_payment).
  for (const needle of [
    "Void reversal of bill payment",
    "Void reversal of expense",
    "Void reversal of payment",
    "Void reversal of settlement",
  ]) {
    if (!page.includes(needle)) {
      out.push(`${PAGE}: KNOWN_MEMO_ID_PATTERNS no longer covers "${needle}"`);
    }
  }

  return out;
}

function read(rel) {
  return fs.existsSync(rel) ? fs.readFileSync(rel, "utf8") : null;
}

function selftest() {
  const goodService = `
    const JE_SOURCE_TRANSACTION_TYPE_SQL = \`(SELECT ...)\`;
    const JE_SOURCE_TRANSACTION_DISPLAY_ID_SQL = \`(SELECT
      bpay.display_id, bpay.bill_number,
    SELECT
      \${JE_SOURCE_TRANSACTION_TYPE_SQL} AS source_transaction_type,
      \${JE_SOURCE_TRANSACTION_DISPLAY_ID_SQL} AS source_transaction_display_id,
    LEFT JOIN accounting.bill_payments bpp
      ON src.t = 'bill_payment' AND bpp.id::text = src.sid
    LEFT JOIN mdata.units ftu
      ON ftu.id = ft.unit_id
  `;
  const goodPage = `
export function humanMemo(
  memo: string | null | undefined,
  resolvedSourceId?: string | null,
  resolvedDisplayId?: string | null
): string {
  return entityLabel(name, uuid, noun);
}
render: (entry) => humanMemo(entry.memo, entry.source_transaction_id, entry.source_transaction_display_id)
const memo = entry.memo?.trim() ? humanMemo(entry.memo, entry.source_transaction_id, entry.source_transaction_display_id) : "";
{ re: /Void reversal of bill payment .../gi, noun: "Bill payment" },
{ re: /Void reversal of expense .../gi, noun: "Expense" },
{ re: /Void reversal of payment .../gi, noun: "Payment" },
{ re: /Void reversal of settlement .../gi, noun: "Settlement" },
  `;

  const cases = [
    { name: "correct shape -> 0", service: goodService, page: goodPage, want: 0 },
    {
      name: "backend resolver removed -> error",
      service: goodService.replace("JE_SOURCE_TRANSACTION_DISPLAY_ID_SQL", "REMOVED"),
      page: goodPage,
      wantMin: 1,
    },
    {
      name: "units join re-scoped by operating_company_id -> error",
      service: goodService.replace("ON ftu.id = ft.unit_id", "ON ftu.id = ft.unit_id AND ftu.operating_company_id = je.operating_company_id"),
      page: goodPage,
      wantMin: 1,
    },
    {
      name: "humanMemo reverted to hardcoded null -> error",
      service: goodService,
      page: goodPage.replace("return entityLabel(name, uuid, noun);", 'return entityLabel(null, uuid, noun);'),
      wantMin: 1,
    },
    {
      name: "call site reverted to bare humanMemo(entry.memo) -> error",
      service: goodService,
      page: goodPage.replace(
        'render: (entry) => humanMemo(entry.memo, entry.source_transaction_id, entry.source_transaction_display_id)',
        "render: (entry) => humanMemo(entry.memo)"
      ),
      wantMin: 1,
    },
    {
      name: "bill_payment join removed -> error",
      service: goodService.replace(
        "LEFT JOIN accounting.bill_payments bpp\n      ON src.t = 'bill_payment' AND bpp.id::text = src.sid",
        ""
      ),
      page: goodPage,
      wantMin: 1,
    },
    {
      name: "bill_payment display-id fallback dropped from COALESCE -> error",
      service: goodService.replace("bpay.display_id, bpay.bill_number,\n", ""),
      page: goodPage,
      wantMin: 1,
    },
    {
      name: "void-reversal expense/bill-payment/payment/settlement patterns removed -> error",
      service: goodService,
      page: goodPage
        .replace('{ re: /Void reversal of bill payment .../gi, noun: "Bill payment" },\n', "")
        .replace('{ re: /Void reversal of expense .../gi, noun: "Expense" },\n', "")
        .replace('{ re: /Void reversal of payment .../gi, noun: "Payment" },\n', "")
        .replace('{ re: /Void reversal of settlement .../gi, noun: "Settlement" },\n', ""),
      wantMin: 4,
    },
  ];
  let failed = 0;
  for (const c of cases) {
    const n = failures({ [SERVICE]: c.service, [PAGE]: c.page }).length;
    const ok = c.want !== undefined ? n === c.want : n >= c.wantMin;
    if (!ok) failed++;
    console.log(`${ok ? "ok  " : "FAIL"}  ${c.name}  (errors=${n})`);
  }
  if (failed) {
    console.error(`\n${LABEL} SELFTEST FAILED: ${failed}`);
    process.exit(1);
  }
  console.log(`\n${LABEL} SELFTEST PASS`);
}

if (process.argv.includes("--selftest")) {
  selftest();
  process.exit(0);
}

const service = read(SERVICE);
const page = read(PAGE);
if (service == null) {
  console.error(`[${LABEL}] FAILED — missing ${SERVICE}`);
  process.exit(1);
}
if (page == null) {
  console.error(`[${LABEL}] FAILED — missing ${PAGE}`);
  process.exit(1);
}
const errors = failures({ [SERVICE]: service, [PAGE]: page });
if (errors.length) {
  console.error(`[${LABEL}] FAILED — ${errors.length} issue(s):`);
  for (const e of errors) console.error(`  ✗ ${e}`);
  process.exit(1);
}
console.log(`[${LABEL}] OK — JE list memo resolves a real human source name (fuel_event/bill/invoice/customer_payment/settlement/expense/bank_categorization), never a hardcoded-null tombstone for the JE's own resolved source.`);
