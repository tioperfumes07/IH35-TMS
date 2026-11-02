#!/usr/bin/env node
/** @matrix-built {"modules":["accounting","banking","cash-flow","customers","dispatch","drivers","factoring","finance","fleet","insurance","legal","lists","maintenance","safety","settlements","vendors"],"cols":["entity_isolation"],"leaves":["economics.invariants"],"task":"ECON-C30-INV-10-WRAPPER"} */
export const REQUIRES_LIVE_DB = "INV-10 entity role parity requires a live Neon INV run via --live; static file read cannot certify GL entity isolation";
import { runInvWrapper } from "./lib/econ-inv-auto-check.mjs";
await runInvWrapper({
  label: "verify-posting-flag-has-roles",
  needles: ["=== INV-10 ENTITY ROLE PARITY", "--- 10b:", "--- 10c:", "--- 10d:"],
  columnId: "entity_isolation",
});
