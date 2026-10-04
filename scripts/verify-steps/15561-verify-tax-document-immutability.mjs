export default {
  name: "verify:tax-document-immutability",
  run(ctx) {
    ctx.run("node", ["scripts/verify-tax-document-immutability.mjs"]);
  },
};
