export default {
  name: "verify:coa-account-detail-type-cascade",
  run(ctx) {
    ctx.run("node", ["scripts/verify-coa-account-detail-type-cascade.mjs"]);
    // LST-F430 orphan-guard wiring (Devin-A batch-23)
    ctx.run("node", ["scripts/verify-account-detail-type-trigger-matches-route.mjs", "--selftest"]);
    ctx.run("node", ["scripts/verify-account-detail-type-trigger-matches-route.mjs"]);
  },
};
