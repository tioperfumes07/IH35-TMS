export default {
  name: "verify:lists-safety-generic-catalog-connectivity-exact",
  run(ctx) {
    ctx.run("node", ["scripts/verify-lists-safety-generic-catalog-connectivity-exact.mjs", "--selftest"]);
    ctx.run("node", ["scripts/verify-lists-safety-generic-catalog-connectivity-exact.mjs"]);
  },
};
