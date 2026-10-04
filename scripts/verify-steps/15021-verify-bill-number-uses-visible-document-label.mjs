export default {
  name: "verify:bill-number-uses-visible-document-label",
  run(ctx) {
    ctx.run("node", ["scripts/verify-bill-number-uses-visible-document-label.mjs"]);
  },
};
