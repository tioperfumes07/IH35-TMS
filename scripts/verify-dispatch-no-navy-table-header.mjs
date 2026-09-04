#!/usr/bin/env node
/**
 * Dispatch table/section headers must use light --th-bg tokens, never navy fill #14314F.
 * Owner 2026-09-04: navy retired from column/section headers.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";

const root = process.cwd();
const targets = [
  "apps/frontend/src/pages/dispatch/DispatchBoard.tsx",
  "apps/frontend/src/components/dispatch/DispatchKanban.tsx",
];
const banned = [/bg-\[#14314F\]/i, /backgroundColor:\s*["']#14314F["']/i];
let failed = false;
for (const rel of targets) {
  const src = readFileSync(join(root, rel), "utf8");
  for (const re of banned) {
    if (re.test(src)) {
      console.error(`FAIL ${rel}: navy table/section header fill still present (${re})`);
      failed = true;
    }
  }
}
if (failed) process.exit(1);
console.log("verify-dispatch-no-navy-table-header: PASS");
