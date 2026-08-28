#!/usr/bin/env node
/** @matrix-built {"modules":["dispatch"],"cols":["connectivity"],"leaves":["secondary.book_load","planning.templates"],"task":"DSP-F7093-LOAD-TEMPLATE-READ-FAILURE-HONESTY","vertical":"class-sweep"} */
import fs from "node:fs";

const FILE = "apps/frontend/src/pages/dispatch/LoadTemplateLibrary.tsx";
const read = () => fs.readFileSync(FILE, "utf8");

export function audit(source = read()) {
  const failures = [];
  for (const token of [
    "q.isLoading || q.isError || templates.length === 0",
    'q.isError ? "Templates unavailable"',
    "Retry template list",
    "onClick={() => void q.refetch()}",
    "<ListErrorState title=\"Couldn't load saved templates\"",
    "onRetry={() => void q.refetch()}",
    "!q.isLoading && !q.isError && rows.length === 0",
  ]) if (!source.includes(token)) failures.push(`load-template read failure honesty missing ${token}`);
  return failures;
}

if (process.argv.includes("--selftest")) {
  const source = read();
  const mutations = [
    source.replace("q.isLoading || q.isError || templates.length === 0", "q.isLoading || templates.length === 0"),
    source.replace("onClick={() => void q.refetch()}", "onClick={() => undefined}"),
    source.replace("<ListErrorState title=\"Couldn't load saved templates\"", "<ListErrorState title=\"Saved templates\""),
    source.replace("!q.isLoading && !q.isError && rows.length === 0", "!q.isLoading && rows.length === 0"),
  ];
  for (const [index, mutant] of mutations.entries()) {
    if (mutant === source) throw new Error(`mutation ${index + 1} was inert`);
    if (audit(mutant).length === 0) throw new Error(`mutation ${index + 1} survived`);
  }
  console.log(`verify-dispatch-load-template-read-failure-honesty SELFTEST PASS — ${mutations.length} planted defects rejected`);
  process.exit(0);
}

const failures = audit();
if (failures.length) {
  console.error(`verify-dispatch-load-template-read-failure-honesty FAIL\n- ${failures.join("\n- ")}`);
  process.exit(1);
}
console.log("verify-dispatch-load-template-read-failure-honesty PASS — picker and library never turn failed reads into empty catalogs");
