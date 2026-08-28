#!/usr/bin/env node
/**
 * MAINT-F5697-CLASS: a WO created with payment_timing='paid_same_day' had its cost inserted into
 * accounting.expenses (status='posted', document lifecycle) but never actually posted to the GL —
 * autoCreateExpenseFromWO (apps/backend/src/maintenance/two-section-service.ts) had no equivalent
 * of the canonical POST /api/v1/expenses route's own EXPENSE_GL_POSTING_ENABLED-gated
 * postSourceTransaction call. Compounding it: WO-close (getOrCreateBillForWorkOrder,
 * apps/backend/src/accounting/maintenance-posting/poster.service.ts) ran unconditionally regardless
 * of payment_timing, creating a SECOND, redundant accounting.bills row (status='unpaid') for the
 * identical total_actual_cost — a phantom A/P liability to a vendor already paid in cash.
 *
 * FAIL: either half of the fix is missing — the creation-time posting call, or the close-time skip
 * check for an already-linked accounting.expenses row.
 * PASS: both present.
 *
 * Self-test: node scripts/verify-maintenance-paid-same-day-gl-and-no-double-bill.mjs --selftest
 */
import fs from "node:fs";

const LABEL = "verify-maintenance-paid-same-day-gl-and-no-double-bill";
const TWO_SECTION = "apps/backend/src/maintenance/two-section-service.ts";
const MAINT_POSTER = "apps/backend/src/accounting/maintenance-posting/poster.service.ts";

function failures(sources) {
  const out = [];
  const twoSection = sources[TWO_SECTION];
  const poster = sources[MAINT_POSTER];

  // --- Creation-time GL posting (two-section-service.ts) ---
  if (!/postSourceTransactionInClientTx/.test(twoSection)) {
    out.push("two-section-service.ts: autoCreateExpenseFromWO must call postSourceTransactionInClientTx (the same-transaction variant — a separate-connection call would hit the READ-COMMITTED visibility bug already fixed once this session for the revenue latch)");
  }
  const fnStart = twoSection.indexOf("export async function autoCreateExpenseFromWO");
  if (fnStart === -1) {
    out.push("two-section-service.ts: autoCreateExpenseFromWO not found — file shape changed, re-check this guard");
  } else {
    const fnBody = twoSection.slice(fnStart);
    // MAINT-MONEY-F7019 — PROGRAM-EXPENSE-DOCUMENT-POSTED-WITHOUT-JE widened this gate from
    // `paymentAccountUuid` alone to `paymentAccountUuid || wo.vendor_uuid`, matching the canonical
    // POST /api/v1/expenses/:id/post route's own orphan rule (`!payment_account_uuid && !vendor_uuid`).
    // A known vendor with no payment account is an A/P case, not an orphan — the old narrower gate
    // meant every in_house/vendor_invoice WO completion with no payment account NEVER even tried to
    // post, forever (live-proven gap: expense 57cabbab-f06a-4fa3-ad67-877eb2e64b0f sat
    // posting_status=unposted from creation until that fix). Do not narrow this back to
    // paymentAccountUuid alone — that is the exact regression this class exists to catch.
    if (!/if\s*\(\s*paymentAccountUuid\s*\|\|\s*wo\.vendor_uuid\s*\)/.test(fnBody)) {
      out.push("two-section-service.ts: GL posting must be gated on paymentAccountUuid || wo.vendor_uuid (matches the canonical route's !payment_account_uuid && !vendor_uuid orphan rule) — narrowing this back to paymentAccountUuid alone reintroduces PROGRAM-EXPENSE-DOCUMENT-POSTED-WITHOUT-JE");
    }
    if (!/postSourceTransactionInClientTx\(/.test(fnBody)) {
      out.push("two-section-service.ts: autoCreateExpenseFromWO body must call postSourceTransactionInClientTx");
    }
    if (!/source_transaction_type:\s*["']expense["']/.test(fnBody)) {
      out.push("two-section-service.ts: the posting call must use source_transaction_type: 'expense' (the same source type the canonical route posts)");
    }
    if (!/posting_status\s*=\s*'posted'/.test(fnBody)) {
      out.push("two-section-service.ts: must stamp accounting.expenses.posting_status='posted' after a successful post (same as the canonical route)");
    }
    if (!/instanceof\s+PostingEngineError/.test(fnBody)) {
      out.push("two-section-service.ts: a posting failure must be swallowed via instanceof PostingEngineError (non-fatal contract) — a WO create must never 500 on this, matching the canonical route");
    }
  }

  // --- Close-time skip-if-already-expensed (maintenance-posting/poster.service.ts) ---
  const getOrCreateStart = poster.indexOf("async function getOrCreateBillForWorkOrder");
  if (getOrCreateStart === -1) {
    out.push("maintenance-posting/poster.service.ts: getOrCreateBillForWorkOrder not found — file shape changed, re-check this guard");
  } else {
    const fnBody = poster.slice(getOrCreateStart, getOrCreateStart + 6000);
    if (!/FROM accounting\.expenses/.test(fnBody)) {
      out.push("maintenance-posting/poster.service.ts: getOrCreateBillForWorkOrder must query accounting.expenses for an already-linked row before creating a bill");
    }
    if (!/linked_work_order_uuid\s*=\s*\$2::uuid/.test(fnBody) || (fnBody.match(/linked_work_order_uuid\s*=\s*\$2::uuid/g) || []).length < 2) {
      out.push("maintenance-posting/poster.service.ts: both the expenses check and the bills reuse check must scope on linked_work_order_uuid = $2::uuid");
    }
    if (!/skipped_already_expensed/.test(fnBody)) {
      out.push("maintenance-posting/poster.service.ts: must return action: 'skipped_already_expensed' and bill_id: null when an expense is already linked — never create a second bill");
    }
    // The already-expensed check must run BEFORE the INSERT INTO accounting.bills.
    const skipIdx = fnBody.indexOf("skipped_already_expensed");
    const insertIdx = fnBody.indexOf("INSERT INTO accounting.bills");
    if (skipIdx === -1 || insertIdx === -1 || skipIdx > insertIdx) {
      out.push("maintenance-posting/poster.service.ts: the already-expensed skip must be checked BEFORE the bill INSERT, not after");
    }
  }
  if (!/"skipped_already_expensed"/.test(poster)) {
    out.push("maintenance-posting/poster.service.ts: the bill_action type unions (getOrCreateBillForWorkOrder return type + ClosePostingResult) must include 'skipped_already_expensed'");
  }

  return out;
}

const live = { [TWO_SECTION]: fs.readFileSync(TWO_SECTION, "utf8"), [MAINT_POSTER]: fs.readFileSync(MAINT_POSTER, "utf8") };

if (process.argv.includes("--selftest") || process.argv.includes("--self-test")) {
  const mutations = [
    {
      name: "creation-time posting call removed",
      file: TWO_SECTION,
      mutate: (text) => text.replace(/const posting = await postSourceTransactionInClientTx\([\s\S]*?\);/, "const posting = { journal_entry_id: null };"),
    },
    {
      name: "gate narrowed back to paymentAccountUuid alone (PROGRAM-EXPENSE-DOCUMENT-POSTED-WITHOUT-JE regression)",
      file: TWO_SECTION,
      mutate: (text) => text.replace("if (paymentAccountUuid || wo.vendor_uuid) {", "if (paymentAccountUuid) {"),
    },
    {
      // `if (!(err instanceof PostingEngineError)) throw err;` appears TWICE in this file — once
      // in the sibling autoCreateBillFromWO, once in autoCreateExpenseFromWO. A plain text.replace()
      // always hits the FIRST (wrong) occurrence, silently leaving autoCreateExpenseFromWO's own
      // swallow untouched — this guard's own selftest caught exactly that (planted defect escaped)
      // before this fix. Scope the mutation to only the text from autoCreateExpenseFromWO onward.
      name: "PostingEngineError swallow removed (throws on any failure)",
      file: TWO_SECTION,
      mutate: (text) => {
        const fnStart = text.indexOf("export async function autoCreateExpenseFromWO");
        if (fnStart === -1) return text;
        const before = text.slice(0, fnStart);
        const after = text.slice(fnStart).replace("if (!(err instanceof PostingEngineError)) throw err;", "throw err;");
        return before + after;
      },
    },
    {
      name: "posting_status stamp removed",
      file: TWO_SECTION,
      mutate: (text) => text.replace(/SET posting_status = 'posted'.*?updated_at = now\(\)/s, "SET updated_at = now()"),
    },
    {
      name: "already-expensed skip check removed (double-bill regression)",
      file: MAINT_POSTER,
      mutate: (text) =>
        text.replace(
          /const alreadyExpensed = await client\.query[\s\S]*?if \(alreadyExpensed\.rows\[0\]\?\.id\) \{\s*return \{ bill_id: null, action: "skipped_already_expensed" \};\s*\}\n\n\s*/,
          ""
        ),
    },
  ];
  const escaped = [];
  for (const { name, file, mutate } of mutations) {
    const mutated = mutate(live[file]);
    if (mutated === live[file]) {
      escaped.push(`${name}: mutation anchor missing`);
      continue;
    }
    const mutant = { ...live, [file]: mutated };
    if (failures(mutant).length === 0) escaped.push(`${name}: planted defect escaped`);
  }
  if (escaped.length) {
    console.error(`${LABEL} SELFTEST FAIL\n${escaped.join("\n")}`);
    process.exit(1);
  }
  console.log(`${LABEL} SELFTEST PASS — ${mutations.length}/${mutations.length} planted defects rejected`);
  process.exit(0);
}

const missing = failures(live);
if (missing.length) {
  console.error(`${LABEL} FAIL\n${missing.map((f) => ` - ${f}`).join("\n")}`);
  process.exit(1);
}
console.log(`${LABEL} PASS — paid_same_day WO expenses post to GL on create, and WO-close never double-books a bill for an already-expensed WO`);
