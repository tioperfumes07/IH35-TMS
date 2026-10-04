export default {
  name: "verify:maintenance-wo-parts-links-exact-range",
  run(ctx) {
    ctx.run("node", ["scripts/verify-maintenance-wo-parts-links-exact-range.mjs"]);
  },
};
