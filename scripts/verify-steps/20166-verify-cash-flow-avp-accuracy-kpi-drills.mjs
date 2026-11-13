#!/usr/bin/env node
/** verify-step 20166 — AVP Income/Expense accuracy KPIs → Banking range drills with ret */
export default {
  name: "verify-cash-flow-avp-accuracy-kpi-drills",
  run(ctx) {
    ctx.run("node", ["scripts/verify-cash-flow-avp-accuracy-kpi-drills.mjs", "--selftest"]);
    ctx.run("node", ["scripts/verify-cash-flow-avp-accuracy-kpi-drills.mjs"]);
  },
};
