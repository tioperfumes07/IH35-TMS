#!/usr/bin/env node
/**
 * ACCT-F3534 — Escrow pending deductions must use ParityTable (Search+Range+gear),
 * not a raw HTML table that skips the surface bar.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const PAGE = "apps/frontend/src/pages/driver-finance/EscrowDeductionsPendingTab.tsx";

function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}

export function check() {
  const src = fs.readFileSync(path.join(ROOT, PAGE), "utf8");
  assert(src.includes("ParityTable"), "EscrowDeductionsPendingTab: must use ParityTable");
  assert(src.includes('storageKey="escrow-deductions-pending"'), "EscrowDeductionsPendingTab: must set storageKey");
  assert(!/<table\b/.test(src), "EscrowDeductionsPendingTab: must not use raw HTML table");
  assert(src.includes('kind="driver"') && src.includes('kind="load"'), "EscrowDeductionsPendingTab: keep driver+load drills");
  assert(src.includes("approvePendingEscrowDeduction") && src.includes("rejectPendingEscrowDeduction"), "EscrowDeductionsPendingTab: keep approve/reject writers");
}

function selftest() {
  check();
  const filePath = path.join(ROOT, PAGE);
  const good = fs.readFileSync(filePath, "utf8");
  const planted = good
    .replace(/import \{ ParityTable[\s\S]*?\} from "[^"]+";\n/, "")
    .replace(/const columns = useMemo[\s\S]*?\],\s*\[\],\s*\);\n\n/, "")
    .replace(
      /\/\/ ACCT-F3534:[\s\S]*?\/>\n\s*\) : null\}/,
      `<div><table className="min-w-full text-left text-sm"><tbody /></table></div>`,
    );
  assert(planted.includes("<table"), "selftest plant must include raw table");
  assert(!planted.includes("ParityTable"), "selftest plant must remove ParityTable");
  fs.writeFileSync(filePath, planted);
  let failed = false;
  try {
    check();
  } catch {
    failed = true;
  }
  fs.writeFileSync(filePath, good);
  assert(failed, "selftest: expected FAIL on raw HTML table");
  console.log("verify-escrow-pending-parity-surface-bar --selftest PASS");
}

const args = process.argv.slice(2);
if (args.includes("--selftest")) selftest();
else {
  check();
  console.log("verify-escrow-pending-parity-surface-bar PASS");
}
