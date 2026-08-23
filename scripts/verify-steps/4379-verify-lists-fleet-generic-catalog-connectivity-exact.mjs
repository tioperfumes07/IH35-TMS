export default {
  name: "verify:lists-fleet-generic-catalog-connectivity-exact",
  run(ctx) {
    ctx.run("node", ["scripts/verify-lists-fleet-generic-catalog-connectivity-exact.mjs", "--selftest"]);
    ctx.run("node", ["scripts/verify-lists-fleet-generic-catalog-connectivity-exact.mjs"]);
  },
};
