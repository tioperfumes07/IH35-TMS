export default {
  name: "verify:lists-maintenance-bespoke-catalog-connectivity-exact",
  run(ctx) {
    ctx.run("node", ["scripts/verify-lists-maintenance-bespoke-catalog-connectivity-exact.mjs", "--selftest"]);
    ctx.run("node", ["scripts/verify-lists-maintenance-bespoke-catalog-connectivity-exact.mjs"]);
  },
};
