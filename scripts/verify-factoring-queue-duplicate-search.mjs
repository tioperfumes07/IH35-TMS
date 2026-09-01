#!/usr/bin/env node
/**
 * FAC-F3496 — FactoringQueuePage must not mount page-local free-text search;
 * ParityTable toolbar owns search. Stage filter may remain page-local.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { withMutatedCopy } from "./_lib/selftest-safe-mutation.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const PAGE = "apps/frontend/src/pages/dispatch/FactoringQueuePage.tsx";

function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}

export function check(filePath = path.join(ROOT, PAGE)) {
  const src = fs.readFileSync(filePath, "utf8");
  assert(src.includes("ParityTable"), "FactoringQueuePage: must use ParityTable");
  assert(!/\[search,\s*setSearch\]/.test(src), "FactoringQueuePage: must not keep page-local search state");
  assert(!/Search load # or customer/.test(src), "FactoringQueuePage: must not mount page-local search input");
  assert(/stageFilter/.test(src), "FactoringQueuePage: must keep stage filter");
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
  const bad =
    good.replace(/const \[stageFilter/, `const [search, setSearch] = useState("");\n  const [stageFilter`) +
    `\n<input placeholder="Search load # or customer…" value={search} />\n`;
      return bad;
    },
    (tmpPath) => {
      try {
        check(tmpPath);
      } catch {
        failed = true;
      }
    },
  );
  assert(failed, "selftest: expected FAIL with page-local search restored");
  console.log("verify-factoring-queue-duplicate-search --selftest PASS");
}

if (process.argv.includes("--selftest")) {
  try {
    await selftest();
  } catch (e) {
    console.error(`verify-factoring-queue-duplicate-search FAIL — ${e.message}`);
    process.exit(1);
  }
} else {
  try {
    check();
    console.log("verify-factoring-queue-duplicate-search PASS — FactoringQueue ParityTable-owned search");
  } catch (e) {
    console.error(`verify-factoring-queue-duplicate-search FAIL — ${e.message}`);
    process.exit(1);
  }
}
