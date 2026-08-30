#!/usr/bin/env node
/** @matrix-built {"modules":["accounting","banking","cash-flow","customers","dispatch","drivers","factoring","finance","fleet","insurance","legal","lists","maintenance","safety","settlements","vendors"],"cols":["lifecycle_complete"],"leaves":["economics.invariants"],"task":"ECON-C27-INV-6-WRAPPER"} */
import { runInvWrapper } from "./lib/econ-inv-auto-check.mjs";
await runInvWrapper({
  label: "verify-no-stranded-intermediate",
  needles: ["=== INV-6  STRANDED INTERMEDIATE ACCOUNTS", "unbilled_revenue"],
  columnId: "lifecycle_complete",
});
