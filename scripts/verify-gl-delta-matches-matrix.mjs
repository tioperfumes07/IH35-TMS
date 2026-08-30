#!/usr/bin/env node
/** @matrix-built {"modules":["accounting","banking","cash-flow","customers","dispatch","drivers","factoring","finance","fleet","insurance","legal","lists","maintenance","safety","settlements","vendors"],"cols":["gl_delta"],"leaves":["economics.invariants"],"task":"ECON-C25-INV-4-WRAPPER"} */
import { runInvWrapper } from "./lib/econ-inv-auto-check.mjs";
await runInvWrapper({
  label: "verify-gl-delta-matches-matrix",
  needles: ["=== INV-4  DOCUMENTS WITH NO GL DELTA"],
  columnId: "gl_delta",
});
