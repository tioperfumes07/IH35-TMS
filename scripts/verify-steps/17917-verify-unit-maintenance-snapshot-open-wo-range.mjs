export default {
  name: "verify:unit-maintenance-snapshot-open-wo-range",
  run(ctx) {
    ctx.run("node", ["scripts/verify-unit-maintenance-snapshot-open-wo-range.mjs"]);
  },
};
