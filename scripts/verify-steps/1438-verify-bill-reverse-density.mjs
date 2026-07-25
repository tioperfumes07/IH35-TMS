export default {
  name: "verify:bill-reverse-density",
  async run(ctx) {
    ctx.run("node", ["scripts/verify-bill-reverse-density.mjs"]);
  },
};
