export default {
  name: "verify:je-type-fk",
  async run(ctx) {
    ctx.run("node", ["scripts/verify-je-type-fk.mjs"]);
  },
};
