export default {
  name: "verify:lists-safety-catalog-connectivity-exact",
  run(ctx) {
    ctx.run("node", ["scripts/verify-lists-safety-catalog-connectivity-exact.mjs", "--selftest"]);
    ctx.run("node", ["scripts/verify-lists-safety-catalog-connectivity-exact.mjs"]);
  },
};
