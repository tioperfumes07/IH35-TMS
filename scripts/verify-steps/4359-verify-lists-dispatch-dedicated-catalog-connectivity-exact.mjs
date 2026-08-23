export default {
  name: "verify:lists-dispatch-dedicated-catalog-connectivity-exact",
  run(ctx) {
    ctx.run("node", ["scripts/verify-lists-dispatch-dedicated-catalog-connectivity-exact.mjs", "--selftest"]);
    ctx.run("node", ["scripts/verify-lists-dispatch-dedicated-catalog-connectivity-exact.mjs"]);
  },
};
