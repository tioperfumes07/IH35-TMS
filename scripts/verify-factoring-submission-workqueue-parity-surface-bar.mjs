#!/usr/bin/env node
/**
 * FAC-F3542 — Factoring SubmissionWorkqueue must use ParityTable (Search+Range+gear),
 * not a raw HTML table / empty early-return that skips the surface bar.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { withMutatedCopy } from "./_lib/selftest-safe-mutation.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const PAGE = "apps/frontend/src/pages/factoring/SubmissionWorkqueue.tsx";

function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}

export function check(filePath = path.join(ROOT, PAGE)) {
  const src = fs.readFileSync(filePath, "utf8");
  assert(src.includes("ParityTable"), "SubmissionWorkqueue: must use ParityTable");
  assert(src.includes('storageKey="factoring-submission-workqueue"'), "SubmissionWorkqueue: must set storageKey");
  assert(src.includes('tableTestId="factoring-submission-workqueue-table"'), "SubmissionWorkqueue: must set tableTestId");
  assert(!/<table\b/.test(src), "SubmissionWorkqueue: must not use raw HTML table");
  assert(src.includes("listWorkqueue"), "SubmissionWorkqueue: keep workqueue API");
  assert(!/if \(items\.length === 0\)/.test(src), "SubmissionWorkqueue: must not early-return empty (skips ParityTable)");
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
    "export function SubmissionWorkqueue() {",
    "  const items = [];",
    "  if (items.length === 0) return <div>empty</div>;",
    '  return <table className="w-full" data-testid="factoring-submission-workqueue-table"><tbody /></table>;',
    "}",
    "",
  ].join("\n");
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
  console.log("verify-factoring-submission-workqueue-parity-surface-bar --selftest PASS");
}

const args = process.argv.slice(2);
if (args.includes("--selftest")) await selftest();
else {
  check();
  console.log("verify-factoring-submission-workqueue-parity-surface-bar PASS");
}
