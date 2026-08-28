#!/usr/bin/env node
/** @matrix-built dispatch:home.list connectivity */
import fs from "node:fs";

const boardPath = "apps/frontend/src/pages/dispatch/DispatchBoard.tsx";
const pillPath = "apps/frontend/src/components/dispatch/TriSignalPill.tsx";
let board = fs.readFileSync(boardPath, "utf8");
let pill = fs.readFileSync(pillPath, "utf8");

function verify() {
  const failures = [];
  if (!/unavailable=\{triSignalsQuery\.isError\}/.test(board)) failures.push("rows must distinguish failed tri-signal reads");
  if (!/title="Couldn't load status signals"/.test(board)) failures.push("board must disclose tri-signal failure");
  if (!/onRetry=\{\(\) => void triSignalsQuery\.refetch\(\)\}/.test(board)) failures.push("board must retry exact query");
  if (!/if \(unavailable\)[\s\S]{0,180}>Unavailable</.test(pill)) failures.push("pill must not render failure as empty dash");
  return failures;
}

if (process.argv.includes("--selftest")) {
  const originalBoard = board;
  const originalPill = pill;
  const mutations = [
    () => { board = originalBoard.replace("unavailable={triSignalsQuery.isError}", "unavailable={false}"); pill = originalPill; },
    () => { board = originalBoard.replace("Couldn't load status signals", "Status signals"); pill = originalPill; },
    () => { board = originalBoard.replace("triSignalsQuery.refetch()", "Promise.resolve()"); pill = originalPill; },
    () => { board = originalBoard; pill = originalPill.replace(">Unavailable<", ">—<"); },
  ];
  for (const mutate of mutations) {
    mutate();
    if (verify().length === 0) throw new Error("selftest mutation escaped");
  }
  console.log(`verify-dispatch-tri-signal-failure-honesty selftest PASS (${mutations.length} mutations)`);
  process.exit(0);
}

const failures = verify();
if (failures.length) {
  console.error(failures.join("\n"));
  process.exit(1);
}
console.log("verify-dispatch-tri-signal-failure-honesty PASS");
