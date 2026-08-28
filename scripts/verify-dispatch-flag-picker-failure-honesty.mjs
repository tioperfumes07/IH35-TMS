#!/usr/bin/env node
/** @matrix-built dispatch:load.drawer.overview connectivity picker_law */
import fs from "node:fs";
let src = fs.readFileSync("apps/frontend/src/components/dispatch/LoadDetailDrawer.tsx", "utf8");

function failures() {
  const out = [];
  if (!/title="Couldn't load dispatch flags"/.test(src)) out.push("dispatch-flag failure must be visible");
  if (!/onRetry=\{\(\) => void flagColorsQuery\.refetch\(\)\}/.test(src)) out.push("dispatch-flag failure must retry exact query");
  if (!/disabled=\{flagColorsQuery\.isLoading \|\| flagColorsQuery\.isError\}/.test(src)) out.push("picker/create must fail closed while unknown");
  if (!/loading=\{flagColorsQuery\.isLoading\}/.test(src)) out.push("picker must disclose loading");
  if (!/createKind="dispatch_flag_color"[\s\S]{0,600}onOptionCreated=\{\(\) => void flagColorsQuery\.refetch\(\)\}/.test(src)) out.push("successful inline create must refetch canonical catalog");
  return out;
}

if (process.argv.includes("--selftest")) {
  const original = src;
  const mutations = [
    ["Couldn't load dispatch flags", "Dispatch flags"],
    ["flagColorsQuery.refetch()", "Promise.resolve()"],
    ["disabled={flagColorsQuery.isLoading || flagColorsQuery.isError}", "disabled={false}"],
    ["loading={flagColorsQuery.isLoading}", "loading={false}"],
    ["onOptionCreated={() => void flagColorsQuery.refetch()}", "onOptionCreated={() => undefined}"],
  ];
  for (const [from, to] of mutations) {
    src = original.replace(from, to);
    if (failures().length === 0) throw new Error(`selftest mutation escaped: ${from}`);
  }
  console.log(`verify-dispatch-flag-picker-failure-honesty selftest PASS (${mutations.length} mutations)`);
  process.exit(0);
}
const found = failures();
if (found.length) { console.error(found.join("\n")); process.exit(1); }
console.log("verify-dispatch-flag-picker-failure-honesty PASS");
