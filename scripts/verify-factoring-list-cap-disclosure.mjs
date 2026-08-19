#!/usr/bin/env node
/**
 * CLS-SILENT-LIST-CAP-FACTORING — the two capped factoring history surfaces must receive exact,
 * company/filter-scoped totals and disclose truncation with the shared notice.
 */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const ROOT = fileURLToPath(new URL("..", import.meta.url));
const read = (path) => readFileSync(`${ROOT}/${path}`, "utf8");

export function verify({ route, api, page }) {
  const failures = [];
  if ((route.match(/COUNT\(\*\) OVER\(\)::int AS _total_count/g) ?? []).length < 2)
    failures.push("both capped route queries must compute exact totals before LIMIT");
  if (!/return \{ invoices, total: Number\(invoices\[0\]\?\._total_count \?\? 0\) \}/.test(route))
    failures.push("recourse response must expose its exact filtered total");
  if (!/history_total: Number\(historyRes\.rows\[0\]\?\._total_count \?\? 0\)/.test(route))
    failures.push("chargeback response must expose its exact filtered total");
  if (!/invoices: FactoringRecourseInvoice\[\]; total: number/.test(api))
    failures.push("recourse API contract must carry total");
  if (!/history_total: number/.test(api)) failures.push("chargeback API contract must carry history_total");
  if ((page.match(/<CappedListNotice/g) ?? []).length < 2)
    failures.push("both capped factoring tables must render CappedListNotice");
  if (!/shown=\{invoices\.length\}[\s\S]*?limit=\{200\}[\s\S]*?total=\{recourseQuery\.data\?\.total\}/.test(page))
    failures.push("recourse notice must bind shown, cap, and server total");
  if (!/shown=\{feesQuery\.data\?\.history\.length \?\? 0\}[\s\S]*?limit=\{500\}[\s\S]*?total=\{feesQuery\.data\?\.history_total\}/.test(page))
    failures.push("chargeback notice must bind shown, cap, and server total");
  return failures;
}

const files = {
  route: read("apps/backend/src/factoring/factoring.routes.ts"),
  api: read("apps/frontend/src/api/factoring.ts"),
  page: read("apps/frontend/src/pages/factoring/FactoringHome.tsx"),
};

if (process.argv.includes("--selftest")) {
  const mutations = [
    { name: "drops recourse total", key: "route", mutate: (s) => s.replace("COUNT(*) OVER()::int AS _total_count", "0::int AS _total_count") },
    { name: "drops chargeback disclosure", key: "page", mutate: (s) => s.replace(/<CappedListNotice\n\s+shown=\{feesQuery[\s\S]*?\n\s+\/>/, "") },
  ];
  for (const mutation of mutations) {
    const changed = { ...files, [mutation.key]: mutation.mutate(files[mutation.key]) };
    if (verify(changed).length === 0) throw new Error(`selftest failed: ${mutation.name} escaped`);
  }
  console.log(`verify-factoring-list-cap-disclosure: selftest PASS (${mutations.length}/${mutations.length})`);
  process.exit(0);
}

const failures = verify(files);
if (failures.length) {
  console.error(`verify-factoring-list-cap-disclosure: FAIL\n- ${failures.join("\n- ")}`);
  process.exit(1);
}
console.log("verify-factoring-list-cap-disclosure: PASS — exact scoped totals drive both factoring cap disclosures");
