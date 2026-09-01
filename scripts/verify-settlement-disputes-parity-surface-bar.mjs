#!/usr/bin/env node
/**
 * ACCT-F3536 — Settlement disputes list must use ParityTable (Search+Range+gear),
 * not a raw HTML table that skips the surface bar.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { withMutatedCopy } from "./_lib/selftest-safe-mutation.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const PAGE = "apps/frontend/src/pages/driver-finance/components/SettlementDisputesTab.tsx";

function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}

export function check(filePath = path.join(ROOT, PAGE)) {
  const src = fs.readFileSync(filePath, "utf8");
  assert(src.includes("ParityTable"), "SettlementDisputesTab: must use ParityTable");
  assert(src.includes('storageKey="settlement-disputes"'), "SettlementDisputesTab: must set storageKey");
  assert(!/<table\b/.test(src), "SettlementDisputesTab: must not use raw HTML table");
  assert(src.includes('kind="driver"'), "SettlementDisputesTab: keep driver drills/filter");
  assert(src.includes("resolveSettlementDispute"), "SettlementDisputesTab: keep resolve writer");
}

// GUARD-SELFTEST-MUTATES-SOURCE fix: never write the plant into the real tracked file. Copy it
// to a temp path (withMutatedCopy), plant there, assert against the copy — apps/ is never touched.
async function selftest() {
  check();
  const realPath = path.join(ROOT, PAGE);
  let failed = false;
  await withMutatedCopy(
    realPath,
    (good) => {
  const planted = good
    .replace(/import \{ ParityTable[\s\S]*?\} from "[^"]+";\n/, "")
    .replace(/const columns = useMemo[\s\S]*?\],\s*\[\],\s*\);\n\n/, "")
    .replace(
      /\/\/ ACCT-F3536:[\s\S]*?\/>\n\s*\)\}/,
      `<div><table className="min-w-full text-left text-xs"><tbody /></table></div>`,
    );
  assert(planted.includes("<table"), "selftest plant must include raw table");
  assert(!planted.includes("ParityTable"), "selftest plant must remove ParityTable");
      return planted;
    },
    (tmpPath) => {
      try {
        check(tmpPath);
      } catch {
        failed = true;
      }
    },
  );
  assert(failed, "selftest: expected FAIL on raw HTML table");
  console.log("verify-settlement-disputes-parity-surface-bar --selftest PASS");
}

const args = process.argv.slice(2);
if (args.includes("--selftest")) await selftest();
else {
  check();
  console.log("verify-settlement-disputes-parity-surface-bar PASS");
}
