#!/usr/bin/env node
/** @matrix-built {"modules":["dispatch","drivers"],"cols":["driver","load","connectivity","reverse_link","picker_law"],"leaves":["assign_driver_dropdown","load.drawer.reassign","book_load.wizard"],"task":"DSP-F6931-LOAD-AWARE-DRIVER-SILENT-200-CANDIDATES","vertical":"class-sweep"} */
import fs from "node:fs";
import path from "node:path";
const root = process.cwd();
const fallbackFile = path.join(root, "apps/backend/src/dispatch/dispatch-refinements.service.ts");
const optimizerFile = path.join(root, "apps/backend/src/dispatch/driver-optimizer.service.ts");
const fallback = fs.readFileSync(fallbackFile, "utf8");
const optimizer = fs.readFileSync(optimizerFile, "utf8");
function candidateBlock(source, marker, end) {
  const start = source.indexOf(marker);
  const finish = source.indexOf(end, start);
  return start >= 0 && finish > start ? source.slice(start, finish) : "";
}
function failures(fallbackSource, optimizerSource) {
  const found = [];
  const fallbackBlock = candidateBlock(fallbackSource, "export async function listAvailableDriversForDispatch", "export async function getDispatchLoadEta");
  const optimizerBlock = candidateBlock(optimizerSource, "export async function listOptimalDriversForLoad", "const drivers = rankOptimalDrivers");
  for (const [name, block] of [["available-driver", fallbackBlock], ["optimizer", optimizerBlock]]) {
    if (!block.includes("mdata.drivers d")) found.push(`${name} canonical driver source missing`);
    if (!block.includes("operating_company_id = $1::uuid") || !block.includes("driver_company_authorizations")) found.push(`${name} company scope missing`);
    if (!block.includes("d.status = 'Active'::mdata.driver_status") || !block.includes("d.deactivated_at IS NULL")) found.push(`${name} active scope missing`);
    if (!/stop_type = 'pickup'::mdata\.stop_type_enum[\s\S]{0,100}s\.soft_deleted_at IS NULL/.test(block)) found.push(`${name} pickup context includes retired stops`);
    if (/LIMIT\s+200/i.test(block)) found.push(`${name} still silently caps candidates at 200`);
  }
  if (!optimizerSource.includes("rankOptimalDrivers(scored, 10)")) found.push("optimizer no longer ranks the complete set down to top 10");
  return found;
}
if (process.argv.includes("--selftest")) {
  const mutations = [
    [fallback.replace("ORDER BY d.last_name ASC, d.first_name ASC", "ORDER BY d.last_name ASC, d.first_name ASC\n        LIMIT 200"), optimizer],
    [fallback, optimizer.replace("ORDER BY d.last_name ASC, d.first_name ASC", "ORDER BY d.last_name ASC, d.first_name ASC\n        LIMIT 200")],
    [fallback.replace("d.deactivated_at IS NULL", "true"), optimizer],
    [fallback, optimizer.replace("rankOptimalDrivers(scored, 10)", "scored.slice(0, 10)")],
    [fallback.replace("AND s.soft_deleted_at IS NULL", "AND TRUE"), optimizer],
    [fallback, optimizer.replace("AND s.soft_deleted_at IS NULL", "AND TRUE")],
  ];
  const missed = mutations.filter(([a, b]) => failures(a, b).length === 0);
  if (missed.length) {
    console.error(`FAIL: selftest missed ${missed.length} load-aware driver regressions`);
    process.exit(1);
  }
  console.log(`PASS: selftest caught ${mutations.length} load-aware driver regressions`);
  process.exit(0);
}
const found = failures(fallback, optimizer);
if (found.length) {
  console.error(`FAIL: ${found.join("; ")}`);
  process.exit(1);
}
console.log("PASS: load-aware assignment ranks the complete scoped active-driver range");
