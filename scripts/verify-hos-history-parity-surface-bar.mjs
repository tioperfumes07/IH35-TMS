#!/usr/bin/env node
/**
 * COMP-F3538 — HOS History events list must use ParityTable (Search+Range+gear),
 * not a raw HTML table that skips the surface bar.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const PAGE = "apps/frontend/src/pages/compliance/HosHistorySection.tsx";

function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}

export function check() {
  const src = fs.readFileSync(path.join(ROOT, PAGE), "utf8");
  assert(src.includes("ParityTable"), "HosHistorySection: must use ParityTable");
  assert(src.includes('storageKey="hos-history-events"'), "HosHistorySection: must set storageKey");
  assert(src.includes('tableTestId="hos-history-table"'), "HosHistorySection: must keep hos-history-table test id");
  assert(!/<table\b/.test(src), "HosHistorySection: must not use raw HTML table");
  assert(src.includes('kind="driver"'), "HosHistorySection: keep EntityPicker driver");
}

function selftest() {
  check();
  const filePath = path.join(ROOT, PAGE);
  const good = fs.readFileSync(filePath, "utf8");
  const planted = good
    .replace(/import \{ ParityTable[\s\S]*?\} from "[^"]+";\n/, "")
    .replace(/type HosEventRow[\s\S]*?const columns = useMemo[\s\S]*?\],\s*\[\],\s*\);\n\n/, "")
    .replace(
      /\/\/ COMP-F3538:[\s\S]*?\/>\n\s*\)\}/,
      `<div><table className="w-full" data-testid="hos-history-table"><tbody /></table></div>`,
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
  console.log("verify-hos-history-parity-surface-bar --selftest PASS");
}

const args = process.argv.slice(2);
if (args.includes("--selftest")) selftest();
else {
  check();
  console.log("verify-hos-history-parity-surface-bar PASS");
}
