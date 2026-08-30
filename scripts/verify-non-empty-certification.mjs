#!/usr/bin/env node
/** @matrix-built {"modules":["accounting","banking","cash-flow","customers","dispatch","drivers","factoring","finance","fleet","insurance","legal","lists","maintenance","safety","settlements","vendors"],"cols":["non_empty_proof"],"leaves":["economics.invariants"],"task":"ECON-C31-INV-7-WRAPPER"} */
import { runInvWrapper } from "./lib/econ-inv-auto-check.mjs";
await runInvWrapper({
  label: "verify-non-empty-certification",
  needles: ["=== INV-7  TEST / SAMPLE DATA INSIDE THE TRIAL BALANCE", "j.is_sample_data"],
  columnId: "non_empty_proof",
});
