export default {
  name: "verify:customer-profile-catalog-failure-exclusion",
  run(ctx) {
    ctx.run("node", ["scripts/verify-customer-profile-catalog-failure-exclusion.mjs"]);
  },
};
