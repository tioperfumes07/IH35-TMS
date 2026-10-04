export default {
  name: "verify:vendor-balances-view-excludes-draft-bills",
  run(ctx) {
    ctx.run("node", ["scripts/verify-vendor-balances-view-excludes-draft-bills.mjs"]);
  },
};
