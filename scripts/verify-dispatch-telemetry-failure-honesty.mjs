#!/usr/bin/env node
/** @matrix-built dispatch:home.list connectivity */
import fs from "node:fs";

let board = fs.readFileSync("apps/frontend/src/pages/dispatch/DispatchBoard.tsx", "utf8");
let cell = fs.readFileSync("apps/frontend/src/components/dispatch/LoadLivePositionCell.tsx", "utf8");

function failures() {
  const out = [];
  if (!/unavailable=\{loadPositionsQuery\.isError\}/.test(board)) out.push("Live GPS rows must receive exact failure state");
  if (!/if \(unavailable\)[\s\S]{0,160}>Unavailable</.test(cell)) out.push("Live GPS cell must distinguish unavailable from No GPS");
  if (!/if \(fleetLocationQuery\.isError\)[\s\S]{0,180}>Unavailable</.test(board)) out.push("Location column must distinguish unavailable from dash");
  if (!/title="Couldn't load live GPS"[\s\S]{0,360}loadPositionsQuery\.refetch\(\)/.test(board)) out.push("Live GPS failure needs exact Retry");
  if (!/title="Couldn't load fleet locations"[\s\S]{0,380}fleetLocationQuery\.refetch\(\)/.test(board)) out.push("fleet-location failure needs exact Retry");
  return out;
}

if (process.argv.includes("--selftest")) {
  const originalBoard = board;
  const originalCell = cell;
  const mutations = [
    () => { board = originalBoard.replace("unavailable={loadPositionsQuery.isError}", "unavailable={false}"); cell = originalCell; },
    () => { board = originalBoard; cell = originalCell.replace("if (unavailable)", "if (false)"); },
    () => { board = originalBoard.replace("if (fleetLocationQuery.isError)", "if (false)"); cell = originalCell; },
    () => { board = originalBoard.replace("loadPositionsQuery.refetch()", "Promise.resolve()"); cell = originalCell; },
    () => { board = originalBoard.replace("fleetLocationQuery.refetch()", "Promise.resolve()"); cell = originalCell; },
  ];
  for (const mutate of mutations) {
    mutate();
    if (failures().length === 0) throw new Error("selftest mutation escaped");
  }
  console.log(`verify-dispatch-telemetry-failure-honesty selftest PASS (${mutations.length} mutations)`);
  process.exit(0);
}

const found = failures();
if (found.length) {
  console.error(found.join("\n"));
  process.exit(1);
}
console.log("verify-dispatch-telemetry-failure-honesty PASS");
