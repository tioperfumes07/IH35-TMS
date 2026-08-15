#!/usr/bin/env node
/**
 * FAC-F3540 — Factoring SubmissionQueue must use ParityTable (Search+Range+gear),
 * not a raw HTML table that skips the surface bar.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const PAGE = "apps/frontend/src/pages/factoring/SubmissionQueue.tsx";

function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}

export function check() {
  const src = fs.readFileSync(path.join(ROOT, PAGE), "utf8");
  assert(src.includes("ParityTable"), "SubmissionQueue: must use ParityTable");
  assert(src.includes('storageKey="factoring-submission-queue"'), "SubmissionQueue: must set storageKey");
  assert(src.includes('tableTestId="factoring-submission-queue-table"'), "SubmissionQueue: must set tableTestId");
  assert(src.includes('data-testid="factoring-submit-honest-empty"'), "SubmissionQueue: keep honest-empty test id");
  assert(!/<table\b/.test(src), "SubmissionQueue: must not use raw HTML table");
  assert(src.includes("listSubmissionQueue"), "SubmissionQueue: keep queue API");
  assert(src.includes("is_submittable"), "SubmissionQueue: keep submittable gating");
}

function selftest() {
  check();
  const filePath = path.join(ROOT, PAGE);
  const good = fs.readFileSync(filePath, "utf8");
  const planted = [
    'export function SubmissionQueue() {',
    '  return (',
    '    <div data-testid="factoring-submit-honest-empty">',
    '      <table className="w-full" data-testid="factoring-submission-queue-table"><tbody /></table>',
    "    </div>",
    "  );",
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
  console.log("verify-factoring-submission-queue-parity-surface-bar --selftest PASS");
}

const args = process.argv.slice(2);
if (args.includes("--selftest")) selftest();
else {
  check();
  console.log("verify-factoring-submission-queue-parity-surface-bar PASS");
}
