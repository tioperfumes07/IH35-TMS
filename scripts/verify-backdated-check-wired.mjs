#!/usr/bin/env node
/**
 * verify-backdated-check-wired.mjs  (0441-mod8-backdated-check-dead)
 *
 * Root cause: BankingTransactionsDesignView ▾ "Create backdated check" only fired an info toast
 * ("backdated check is available via detailed categorization flow") — no expand, no categorize panel.
 *
 * Fix: openBackdatedCheckFlow() enables check-no + editable-date view settings, seeds Expense
 * categorize mode, and expands the row (QBO detailed categorization flow — no new backend).
 *
 * Usage:
 *   node scripts/verify-backdated-check-wired.mjs            # scan
 *   node scripts/verify-backdated-check-wired.mjs --selftest # planted-bug harness
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = "verify-backdated-check-wired";
const TARGET = "apps/frontend/src/pages/banking/components/BankingTransactionsDesignView.tsx";

const STUB_TOAST = /pushToast\(\s*["']backdated check is available via detailed categorization flow["']/;

/** Pure checks — takes text so --selftest can inject fixtures. */
export function check(source) {
  const f = [];

  if (!source) {
    f.push(`${TARGET}: missing`);
    return f;
  }

  if (STUB_TOAST.test(source)) {
    f.push(`${TARGET}: must not keep toast-only stub for Create backdated check`);
  }

  if (!/Create backdated check/.test(source)) {
    f.push(`${TARGET}: must retain Create backdated check menu label`);
  }

  if (!/function openBackdatedCheckFlow/.test(source) && !/const openBackdatedCheckFlow/.test(source)) {
    f.push(`${TARGET}: must define openBackdatedCheckFlow helper`);
  }

  const helperIdx = source.search(/(?:function|const)\s+openBackdatedCheckFlow/);
  const helperSlice = helperIdx >= 0 ? source.slice(helperIdx, helperIdx + 1200) : "";
  if (helperSlice && !/editableDateField:\s*true/.test(helperSlice)) {
    f.push(`${TARGET}: openBackdatedCheckFlow must enable editableDateField`);
  }
  if (helperSlice && !/showCheckNo:\s*true/.test(helperSlice)) {
    f.push(`${TARGET}: openBackdatedCheckFlow must enable showCheckNo`);
  }
  if (helperSlice && !/transactionType:\s*["']Expense["']/.test(helperSlice)) {
    f.push(`${TARGET}: openBackdatedCheckFlow must seed transactionType Expense`);
  }
  if (helperSlice && !/setExpandedTxId\(tx\.id\)/.test(helperSlice)) {
    f.push(`${TARGET}: openBackdatedCheckFlow must expand the transaction row`);
  }

  if (!/data-testid="action-create-backdated-check"/.test(source)) {
    f.push(`${TARGET}: menu button must carry data-testid="action-create-backdated-check"`);
  } else if (!/openBackdatedCheckFlow\(tx\)/.test(source)) {
    f.push(`${TARGET}: Create backdated check menu must call openBackdatedCheckFlow(tx)`);
  }

  return f;
}

export function run() {
  const read = (rel) => {
    try {
      return fs.readFileSync(path.join(ROOT, rel), "utf8");
    } catch {
      return null;
    }
  };
  return check(read(TARGET));
}

if (process.argv.includes("--selftest")) {
  const good = `
    function openBackdatedCheckFlow(tx) {
      setActionMenuTxId(null);
      setViewSettings((prev) => ({
        ...prev,
        editableDateField: true,
        showCheckNo: true,
      }));
      setDraft(tx, {
        mode: "categorize",
        transactionType: "Expense",
      });
      setExpandedTxId(tx.id);
    }
    <button
      type="button"
      data-testid="action-create-backdated-check"
      onClick={() => openBackdatedCheckFlow(tx)}
    >
      Create backdated check
    </button>
  `;
  const bad = `
    <button onClick={() => {
      setActionMenuTxId(null);
      pushToast("backdated check is available via detailed categorization flow", "info");
    }}>
      Create backdated check
    </button>
  `;
  const checks = [
    ["wired source passes", check(good).length === 0],
    ["toast stub fails", check(bad).length > 0],
  ];
  const failed = checks.filter(([, ok]) => !ok);
  if (failed.length) {
    console.error(`${LABEL} --selftest FAIL:`);
    for (const [n] of failed) console.error("  ✗ " + n);
    process.exit(1);
  }
  console.log(`${LABEL} --selftest PASS (${checks.length} checks)`);
  process.exit(0);
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  const failures = run();
  if (failures.length) {
    console.error(`${LABEL} FAIL:`);
    for (const msg of failures) console.error("  ✗ " + msg);
    process.exit(1);
  }
  console.log(`${LABEL} PASS (Create backdated check wired to categorize flow)`);
}
