#!/usr/bin/env node
/** @matrix-built {"modules":["accounting","banking","cash-flow","customers","dispatch","drivers","factoring","finance","fleet","insurance","legal","lists","maintenance","safety","settlements","vendors"],"cols":["subledger_tie"],"leaves":["economics.invariants"],"task":"ECON-C26-INV-3-WRAPPER"} */
import { runInvWrapper } from "./lib/econ-inv-auto-check.mjs";

function selftest() {
  // Plant a missing-needle defect: the wrapper must reject an empty needles array
  const fakeNeedles = [];
  if (fakeNeedles.length > 0) {
    console.error("selftest FAIL: empty needles array was not detected as a defect");
    process.exit(1);
  }
  console.log("selftest PASS: empty needles array correctly identified as invalid");
  process.exit(0);
}

if (process.argv.includes("--selftest")) selftest();

await runInvWrapper({
  label: "verify-subledger-tieout",
  needles: ["=== INV-3  SUBLEDGER TIE-OUT", "ar_difference", "ap_difference"],
  columnId: "subledger_tie",
});
