export default {
  name: "verify:reserve-docs-liabilities-human-labels",
  run(ctx) {
    ctx.run("node", ["scripts/verify-reserve-docs-liabilities-human-labels.mjs"]);
  },
};
