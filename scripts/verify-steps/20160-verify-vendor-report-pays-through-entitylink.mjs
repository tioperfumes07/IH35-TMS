#!/usr/bin/env node
/** verify-step 20160 — Vendor report Pays-through EntityLink */
export default {
  name: "verify-vendor-report-pays-through-entitylink",
  run(ctx) {
    ctx.run("node", ["scripts/verify-vendor-report-pays-through-entitylink.mjs", "--selftest"]);
    ctx.run("node", ["scripts/verify-vendor-report-pays-through-entitylink.mjs"]);
  },
};
