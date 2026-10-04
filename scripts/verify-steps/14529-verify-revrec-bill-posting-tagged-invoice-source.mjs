export default {
  name: "verify:revrec-bill-posting-tagged-invoice-source",
  run(ctx) {
    ctx.run("node", ["scripts/verify-revrec-bill-posting-tagged-invoice-source.mjs"]);
  },
};
