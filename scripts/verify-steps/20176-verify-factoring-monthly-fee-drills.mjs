#!/usr/bin/env node
/** verify-step 20176 — Factoring monthly fee / statement totals → chargebacks-fees month drill */
export default {
  name: "verify-factoring-monthly-fee-drills",
  run(ctx) {
    ctx.run("node", ["scripts/verify-factoring-monthly-fee-drills.mjs", "--selftest"]);
    ctx.run("node", ["scripts/verify-factoring-monthly-fee-drills.mjs"]);
  },
};
