export default {
  name: "verify:je-source-links-bill-uses-bill-number",
  run(ctx) {
    ctx.run("node", ["scripts/verify-je-source-links-bill-uses-bill-number.mjs", "--selftest"]);
    ctx.run("node", ["scripts/verify-je-source-links-bill-uses-bill-number.mjs"]);
  },
};
