#!/usr/bin/env node
/** verify-step 20172 — Customers list AR open amounts are MoneyCell drills */
export default {
  name: "verify-customers-ar-open-money-cells",
  run(ctx) {
    ctx.run("node", ["scripts/verify-customers-ar-open-money-cells.mjs", "--selftest"]);
    ctx.run("node", ["scripts/verify-customers-ar-open-money-cells.mjs"]);
  },
};
