#!/usr/bin/env node
/**
 * SETL-F3554 — PayRunClosePanel JE legs must use ParityTable (Search+Range+gear),
 * not a raw HTML table that skips the surface bar.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { withMutatedCopy } from "./_lib/selftest-safe-mutation.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const PAGE = "apps/frontend/src/pages/driver-finance/components/PayRunClosePanel.tsx";

function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}

export function check(filePath = path.join(ROOT, PAGE)) {
  const src = fs.readFileSync(filePath, "utf8");
  assert(src.includes("ParityTable"), "PayRunClosePanel: must use ParityTable");
  assert(src.includes('storageKey="payrun-je-legs"'), "PayRunClosePanel: must set storageKey");
  assert(src.includes('tableTestId="payrun-je-legs"'), "PayRunClosePanel: must keep payrun-je-legs test id");
  assert(!/<table\b/.test(src), "PayRunClosePanel: must not use raw HTML table");
  assert(src.includes("previewSettlementPayRun"), "PayRunClosePanel: keep preview API");
  assert(src.includes("closeSettlementPayRun"), "PayRunClosePanel: keep close API");
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
  const planted = [
    "export function PayRunClosePanel() {",
    '  return <table className="w-full" data-testid="payrun-je-legs"><tbody /></table>;',
    "}",
    "",
  ].join("\n");
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
  console.log("verify-pay-run-close-parity-surface-bar --selftest PASS");
}

const args = process.argv.slice(2);
if (args.includes("--selftest")) await selftest();
else {
  check();
  console.log("verify-pay-run-close-parity-surface-bar PASS");
}
