#!/usr/bin/env node
/**
 * ACCT-F3532 — Cash advance requests list must use ParityTable (Search+Range+gear),
 * not a raw HTML table that skips the surface bar.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const PAGE = "apps/frontend/src/pages/driver-finance/CashAdvanceRequestsPage.tsx";

function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}

export function check() {
  const src = fs.readFileSync(path.join(ROOT, PAGE), "utf8");
  assert(src.includes("ParityTable"), "CashAdvanceRequestsPage: must use ParityTable");
  assert(src.includes('storageKey="cash-advance-requests"'), "CashAdvanceRequestsPage: must set storageKey");
  assert(!/<table\b/.test(src), "CashAdvanceRequestsPage: must not use raw HTML table");
  assert(src.includes("+ Create"), "CashAdvanceRequestsPage: keep + Create");
  assert(src.includes("DriverPickerWithCreate"), "CashAdvanceRequestsPage: keep nested driver create");
  assert(src.includes('kind="driver"'), "CashAdvanceRequestsPage: keep driver EntityLink/EntityPicker");
  assert(!src.includes("text-[11px]"), "CashAdvanceRequestsPage leftover chrome must use text-xs, not text-[11px]");
  assert(!src.includes("#8A92AB") && !src.includes("#334155"), "CashAdvanceRequestsPage leftover chrome must not use off-scale #334155 / #8A92AB");
}

function selftest() {
  check();
  const filePath = path.join(ROOT, PAGE);
  const good = fs.readFileSync(filePath, "utf8");
  const planted = good
    .replace(/import \{ ParityTable[\s\S]*?\} from "[^"]+";\n/, "")
    .replace(/const columns = useMemo[\s\S]*?\],\s*\[[^\]]*\]\s*,\s*\);\n\n/, "")
    .replace(
      /\/\/ ACCT-F3532:[\s\S]*?\/>\n\s*\)\}/,
      `<div className="overflow-x-auto"><table className="min-w-full text-left text-sm"><tbody /></table></div>\n      )}`,
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

  fs.writeFileSync(filePath, `${good}\n<div className="text-[11px] text-[#8A92AB]">plant</div>`);
  let leftoverFailed = false;
  try {
    check();
  } catch (err) {
    leftoverFailed = String(err).includes("leftover");
  }
  fs.writeFileSync(filePath, good);
  assert(leftoverFailed, "selftest: expected FAIL on leftover text-[11px]");
  console.log("verify-cash-advance-requests-parity-surface-bar --selftest PASS");
}

const args = process.argv.slice(2);
if (args.includes("--selftest")) selftest();
else {
  check();
  console.log("verify-cash-advance-requests-parity-surface-bar PASS");
}
