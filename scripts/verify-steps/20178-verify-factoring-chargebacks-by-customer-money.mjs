#!/usr/bin/env node
/** verify-step 20178 — Factoring chargebacks/aging by-customer MoneyCell drills */
export default {
  name: "verify-factoring-chargebacks-by-customer-money",
  run(ctx) {
    ctx.run("node", ["scripts/verify-factoring-chargebacks-by-customer-money.mjs", "--selftest"]);
    ctx.run("node", ["scripts/verify-factoring-chargebacks-by-customer-money.mjs"]);
  },
};
