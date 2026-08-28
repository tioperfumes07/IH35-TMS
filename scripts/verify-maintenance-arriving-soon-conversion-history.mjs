#!/usr/bin/env node
import fs from "node:fs";

const backendFile = "apps/backend/src/maintenance/arriving-soon.routes.ts";
const apiFile = "apps/frontend/src/api/maintenance.ts";
const pageFile = "apps/frontend/src/pages/maintenance/ArrivingSoonPage.tsx";

function findings(read = (file) => fs.readFileSync(file, "utf8")) {
  const backend = read(backendFile);
  const api = read(apiFile);
  const page = read(pageFile);
  const out = [];
  for (const token of ["recent_limit", "recent_offset", "recent_conversions_total_count", "LIMIT $2 OFFSET $3", "ORDER BY wo.opened_at DESC, ii.id DESC"]) if (!backend.includes(token)) out.push(`backend missing ${token}`);
  if (/ORDER BY wo\.opened_at DESC\s+LIMIT 12/.test(backend)) out.push("literal 12-row cap remains");
  for (const token of ["recent_limit", "recent_offset", "recent_conversions_total_count"]) if (!api.includes(token)) out.push(`api missing ${token}`);
  for (const token of ["recentPage", "recentPageCount", "maint-arriving-soon-recent-conversions-pager", "recentConversionsTotal"]) if (!page.includes(token)) out.push(`page missing ${token}`);
  return out;
}

if (process.argv.includes("--selftest")) {
  const files = [backendFile, apiFile, pageFile];
  const base = Object.fromEntries(files.map((file) => [file, fs.readFileSync(file, "utf8")]));
  const mutations = [
    (file, source) => file === backendFile ? source.replace("LIMIT $2 OFFSET $3", "LIMIT 12") : source,
    (file, source) => file === backendFile ? source.replace(", ii.id DESC", "") : source,
    (file, source) => file === backendFile ? source.replaceAll("recent_conversions_total_count", "removed_total") : source,
    (file, source) => file === apiFile ? source.replaceAll("recent_offset", "removed_offset") : source,
    (file, source) => file === pageFile ? source.replaceAll("maint-arriving-soon-recent-conversions-pager", "removed-pager") : source,
  ];
  for (const mutate of mutations) if (findings((file) => mutate(file, base[file])).length === 0) throw new Error("planted conversion-history regression escaped guard");
  console.log(`verify-maintenance-arriving-soon-conversion-history selftest: PASS (${mutations.length}/${mutations.length})`);
  process.exit(0);
}
const got = findings();
if (got.length) { console.error(got.join("\n")); process.exit(1); }
console.log("verify-maintenance-arriving-soon-conversion-history: PASS (exact independent seven-day conversion pager)");
