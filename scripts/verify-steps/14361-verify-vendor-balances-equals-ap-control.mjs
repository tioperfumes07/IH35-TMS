export default {
  name: "verify:vendor-balances-equals-ap-control",
  run(ctx) {
    ctx.run("node", ["scripts/verify-vendor-balances-equals-ap-control.mjs"]);
  },
};
