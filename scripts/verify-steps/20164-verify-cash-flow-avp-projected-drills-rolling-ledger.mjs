#!/usr/bin/env node
/** verify-step 20164 — AVP projected Income/Exp → Rolling Ledger drills with ret */
export default {
  name: "verify-cash-flow-avp-projected-drills-rolling-ledger",
  run(ctx) {
    ctx.run("node", ["scripts/verify-cash-flow-avp-projected-drills-rolling-ledger.mjs", "--selftest"]);
    ctx.run("node", ["scripts/verify-cash-flow-avp-projected-drills-rolling-ledger.mjs"]);
  },
};
