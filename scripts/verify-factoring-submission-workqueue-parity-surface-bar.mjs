#!/usr/bin/env node
/**
 * FAC-F3542 — Factoring SubmissionWorkqueue must use ParityTable (Search+Range+gear),
 * not a raw HTML table / empty early-return that skips the surface bar.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const PAGE = "apps/frontend/src/pages/factoring/SubmissionWorkqueue.tsx";

function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}

export function check() {
  const src = fs.readFileSync(path.join(ROOT, PAGE), "utf8");
  assert(src.includes("ParityTable"), "SubmissionWorkqueue: must use ParityTable");
  assert(src.includes('storageKey="factoring-submission-workqueue"'), "SubmissionWorkqueue: must set storageKey");
  assert(src.includes('tableTestId="factoring-submission-workqueue-table"'), "SubmissionWorkqueue: must set tableTestId");
  assert(!/<table\b/.test(src), "SubmissionWorkqueue: must not use raw HTML table");
  assert(src.includes("listWorkqueue"), "SubmissionWorkqueue: keep workqueue API");
  assert(!/if \(items\.length === 0\)/.test(src), "SubmissionWorkqueue: must not early-return empty (skips ParityTable)");
}

function selftest() {
  check();
  const filePath = path.join(ROOT, PAGE);
  const good = fs.readFileSync(filePath, "utf8");
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
  fs.writeFileSync(filePath, planted);
  let failed = false;
  try {
    check();
  } catch {
    failed = true;
  }
  fs.writeFileSync(filePath, good);
  assert(failed, "selftest: expected FAIL on raw HTML table");
  console.log("verify-factoring-submission-workqueue-parity-surface-bar --selftest PASS");
}

const args = process.argv.slice(2);
if (args.includes("--selftest")) selftest();
else {
  check();
  console.log("verify-factoring-submission-workqueue-parity-surface-bar PASS");
}
