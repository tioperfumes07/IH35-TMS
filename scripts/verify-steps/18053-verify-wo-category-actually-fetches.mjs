export default {
  name: "verify:wo-category-actually-fetches",
  run(ctx) {
    ctx.run("node", ["scripts/verify-wo-category-actually-fetches.mjs"]);
  },
};
