#!/usr/bin/env node
/** @matrix-built {"modules":["accounting","banking","cash-flow","customers","dispatch","drivers","factoring","finance","fleet","insurance","legal","lists","maintenance","safety","settlements","vendors"],"cols":["subledger_tie"],"leaves":["economics.invariants"],"task":"ECON-C26-INV-3-WRAPPER"} */
import { readFileSync } from "node:fs";
import { runInvWrapper, extractNeedles, INV_SQL } from "./lib/econ-inv-auto-check.mjs";

const NEEDLES = ["=== INV-3  SUBLEDGER TIE-OUT", "ar_difference", "ap_difference"];

// Plants the removal of EACH needle from the real verify-gl-invariants.sql through the same extractNeedles the live wrapper
// uses; every removal must be caught and the real SQL must carry all three. (The earlier selftest checked an empty array
// against itself and could never fail.)
function selftest() {
  const sql = readFileSync(INV_SQL, "utf8");
  const escaped = NEEDLES.filter((n) => extractNeedles(sql.split(n).join("PLANTED_REMOVED"), NEEDLES).length === 0);
  const cleanMissing = extractNeedles(sql, NEEDLES);
  if (escaped.length || cleanMissing.length) {
    console.error(`verify-subledger-tieout --selftest FAIL — escaped: ${escaped.join(", ") || "none"}; real SQL missing: ${cleanMissing.join(", ") || "none"}`);
    process.exit(1);
  }
  console.log(`verify-subledger-tieout SELFTEST: ${NEEDLES.length}/${NEEDLES.length} planted needle removals caught (real SQL carries all)`);
  process.exit(0);
}

if (process.argv.includes("--selftest")) selftest();

await runInvWrapper({
  label: "verify-subledger-tieout",
  needles: NEEDLES,
  columnId: "subledger_tie",
});
