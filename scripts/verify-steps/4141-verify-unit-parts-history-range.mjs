export default {
  name: "verify:unit-parts-history-range",
  run(ctx) {
    ctx.run("node", ["scripts/verify-unit-parts-history-range.mjs", "--selftest"]);
    ctx.run("node", ["scripts/verify-unit-parts-history-range.mjs"]);
  },
};
