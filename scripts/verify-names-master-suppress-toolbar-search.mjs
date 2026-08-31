#!/usr/bin/env node
/**
 * LST-F3528 — Names Master Hub keeps server-bound searchNamesMaster;
 * ParityTable must pass suppressToolbarSearch so toolbar Search does not compete.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { withMutatedCopy } from "./_lib/selftest-safe-mutation.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const PAGE = "apps/frontend/src/pages/lists/names/NamesMasterHub.tsx";

function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}

export function check(filePath = path.join(ROOT, PAGE)) {
  const src = fs.readFileSync(filePath, "utf8");
  assert(src.includes("ParityTable"), "NamesMasterHub: must use ParityTable");
  assert(src.includes("searchNamesMaster"), "NamesMasterHub: must call searchNamesMaster");
  assert(/setQ\(/.test(src) && /qInput/.test(src), "NamesMasterHub: must keep server-bound search form");
  assert(/suppressToolbarSearch/.test(src), "NamesMasterHub: must pass suppressToolbarSearch");
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
  const bad = good.replace(/\n\s*\/\/ LST-F3528:[^\n]*\n\s*suppressToolbarSearch\n/, "\n");
  assert(!/suppressToolbarSearch/.test(bad), "selftest fixture must remove all suppressToolbarSearch tokens");
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
  assert(failed, "selftest: expected FAIL without suppressToolbarSearch");
  console.log("verify-names-master-suppress-toolbar-search --selftest PASS");
}

const args = process.argv.slice(2);
if (args.includes("--selftest")) selftest();
else {
  check();
  console.log("verify-names-master-suppress-toolbar-search PASS");
}
