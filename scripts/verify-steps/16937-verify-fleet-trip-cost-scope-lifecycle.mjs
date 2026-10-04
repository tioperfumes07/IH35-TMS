export default {
  name: "verify:fleet-trip-cost-scope-lifecycle",
  run(ctx) {
    ctx.run("node", ["scripts/verify-fleet-trip-cost-scope-lifecycle.mjs"]);
  },
};
