#!/usr/bin/env node
import fs from "node:fs";

const backendFile = "apps/backend/src/compliance/drug-alcohol.routes.ts";
const pageFile = "apps/frontend/src/pages/safety/RandomTestingPool.tsx";
const backend = fs.readFileSync(backendFile, "utf8");
const page = fs.readFileSync(pageFile, "utf8");

function failures(b, p) {
  const out = [];
  if (!b.includes("draw_total_count") || !b.includes("selection_total_count")) out.push("both histories need exact totals");
  if (!b.includes("ORDER BY year DESC, quarter DESC, id DESC") || !b.includes("ORDER BY s.created_at DESC, s.id DESC")) out.push("both histories need stable ordering");
  if (!b.includes("draw_limit") || !b.includes("selection_offset")) out.push("both histories need bounded ranges");
  if (!p.includes('data-testid="random-draws-server-pager"') || !p.includes('data-testid="random-selections-server-pager"')) out.push("both pagers must be mounted");
  if (/draws\.slice\(0,\s*5\)|selections\.slice\(0,\s*12\)/.test(p)) out.push("client slices must stay removed");
  if (!p.includes("companyId, drawPage, selectionPage") || !p.includes("drawPage > drawPageCount") || !p.includes("selectionPage > selectionPageCount")) out.push("query ownership and empty-page recovery required");
  return out;
}

if (process.argv.includes("--selftest")) {
  const mutations = [
    { b: backend.replace("draw_total_count", "draw_count_disabled"), p: page },
    { b: backend.replace("ORDER BY s.created_at DESC, s.id DESC", "ORDER BY s.created_at DESC"), p: page },
    { b: backend, p: page.replace('data-testid="random-draws-server-pager"', 'data-testid="disabled"') },
    { b: backend, p: `${page}\nconst regression = draws.slice(0, 5);` },
    { b: backend, p: page.replace("companyId, drawPage, selectionPage", "companyId") },
  ];
  const missed = mutations.filter(({ b, p }) => failures(b, p).length === 0).length;
  if (missed) {
    console.error(`FAIL: selftest missed ${missed}/${mutations.length} planted regressions`);
    process.exit(1);
  }
  console.log(`PASS: selftest caught ${mutations.length}/${mutations.length} random-testing regressions`);
  process.exit(0);
}

const found = failures(backend, page);
if (found.length) {
  console.error(`FAIL: ${found.join("; ")}`);
  process.exit(1);
}
console.log("PASS: Random Testing Pool pages exact draw and selection histories independently");
