#!/usr/bin/env node
/** verify-step 20168 — Fuel card overage Back ret + status/has_je URL SoT */
export default {
  name: "verify-fuel-card-overage-status-url-ret",
  run(ctx) {
    ctx.run("node", ["scripts/verify-fuel-card-overage-status-url-ret.mjs", "--selftest"]);
    ctx.run("node", ["scripts/verify-fuel-card-overage-status-url-ret.mjs"]);
  },
};
