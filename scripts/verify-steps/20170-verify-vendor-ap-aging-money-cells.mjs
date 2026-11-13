#!/usr/bin/env node
/** verify-step 20170 — Vendor AP aging open amounts are MoneyCell drills */
export default {
  name: "verify-vendor-ap-aging-money-cells",
  run(ctx) {
    ctx.run("node", ["scripts/verify-vendor-ap-aging-money-cells.mjs", "--selftest"]);
    ctx.run("node", ["scripts/verify-vendor-ap-aging-money-cells.mjs"]);
  },
};
