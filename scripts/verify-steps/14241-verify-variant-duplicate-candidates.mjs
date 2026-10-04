export default {
  name: "verify:variant-duplicate-candidates",
  run(ctx) {
    ctx.run("node", ["scripts/verify-variant-duplicate-candidates.mjs"]);
  },
};
