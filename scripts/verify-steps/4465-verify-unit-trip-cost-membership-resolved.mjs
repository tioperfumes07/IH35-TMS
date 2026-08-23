export default {
  name: "verify:unit-trip-cost-membership-resolved",
  run(ctx) {
    ctx.run("node", ["scripts/verify-unit-trip-cost-membership-resolved.mjs", "--selftest"]);
    ctx.run("node", ["scripts/verify-unit-trip-cost-membership-resolved.mjs"]);
  },
};
