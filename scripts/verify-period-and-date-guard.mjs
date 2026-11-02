#!/usr/bin/env node
/** @matrix-built {"modules":["accounting","banking","cash-flow","customers","dispatch","drivers","factoring","finance","fleet","insurance","legal","lists","maintenance","safety","settlements","vendors"],"cols":["period_guard"],"leaves":["economics.invariants"],"task":"ECON-C29-INV-8-9-WRAPPER"} */
export const REQUIRES_LIVE_DB = "INV-8/9 period close and future-dated entries require a live Neon INV run via --live; static file read cannot certify period-date invariants";
import { runInvWrapper } from "./lib/econ-inv-auto-check.mjs";
await runInvWrapper({
  label: "verify-period-and-date-guard",
  needles: ["=== INV-8  PERIOD CLOSE", "=== INV-9  FUTURE-DATED ENTRIES"],
  columnId: "period_guard",
});
