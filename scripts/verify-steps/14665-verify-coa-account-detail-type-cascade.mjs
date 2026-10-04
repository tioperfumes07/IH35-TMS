export default {
  name: "verify:coa-account-detail-type-cascade",
  run(ctx) {
    ctx.run("node", ["scripts/verify-coa-account-detail-type-cascade.mjs"]);
  },
};
