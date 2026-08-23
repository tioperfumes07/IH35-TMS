export default {
  name: "verify:lists-drivers-reference-catalog-connectivity-exact",
  run(ctx) {
    ctx.run("node", ["scripts/verify-lists-drivers-reference-catalog-connectivity-exact.mjs", "--selftest"]);
    ctx.run("node", ["scripts/verify-lists-drivers-reference-catalog-connectivity-exact.mjs"]);
  },
};
