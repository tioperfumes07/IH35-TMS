export default {
  name: "verify:reversal-je-linkage",
  run(ctx) {
    ctx.run("node", ["scripts/verify-reversal-je-linkage.mjs"]);
  },
};
