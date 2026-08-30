#!/usr/bin/env node
/** @matrix-built {"modules":["accounting","banking","cash-flow","customers","dispatch","drivers","factoring","finance","fleet","insurance","legal","lists","maintenance","safety","settlements","vendors"],"cols":["subledger_tie"],"leaves":["economics.invariants"],"task":"ECON-C26-INV-3-WRAPPER"} */
import { runInvWrapper } from "./lib/econ-inv-auto-check.mjs";
await runInvWrapper({
  label: "verify-subledger-tieout",
  needles: ["=== INV-3  SUBLEDGER TIE-OUT", "ar_difference", "ap_difference"],
  columnId: "subledger_tie",
});
