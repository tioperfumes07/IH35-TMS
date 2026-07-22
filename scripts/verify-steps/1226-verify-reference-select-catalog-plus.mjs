export default {
  name: "verify:reference-select-catalog-plus",
  async run(ctx) {
    ctx.run("node", ["scripts/verify-reference-select-catalog-plus.mjs"]);
  },
};
