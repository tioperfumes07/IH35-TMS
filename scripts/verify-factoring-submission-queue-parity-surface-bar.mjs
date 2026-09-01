#!/usr/bin/env node
/**
 * FAC-F3540 — Factoring SubmissionQueue must use ParityTable (Search+Range+gear),
 * not a raw HTML table that skips the surface bar.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { withMutatedCopy } from "./_lib/selftest-safe-mutation.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const PAGE = "apps/frontend/src/pages/factoring/SubmissionQueue.tsx";

function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}

export function check(filePath = path.join(ROOT, PAGE)) {
  const src = fs.readFileSync(filePath, "utf8");
  assert(src.includes("ParityTable"), "SubmissionQueue: must use ParityTable");
  assert(src.includes('storageKey="factoring-submission-queue"'), "SubmissionQueue: must set storageKey");
  assert(src.includes('tableTestId="factoring-submission-queue-table"'), "SubmissionQueue: must set tableTestId");
  assert(src.includes('data-testid="factoring-submit-honest-empty"'), "SubmissionQueue: keep honest-empty test id");
  assert(!/<table\b/.test(src), "SubmissionQueue: must not use raw HTML table");
  assert(src.includes("listSubmissionQueue"), "SubmissionQueue: keep queue API");
  assert(src.includes("is_submittable"), "SubmissionQueue: keep submittable gating");
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
  console.log("verify-factoring-submission-queue-parity-surface-bar --selftest PASS");
}

const args = process.argv.slice(2);
if (args.includes("--selftest")) await selftest();
else {
  check();
  console.log("verify-factoring-submission-queue-parity-surface-bar PASS");
}
