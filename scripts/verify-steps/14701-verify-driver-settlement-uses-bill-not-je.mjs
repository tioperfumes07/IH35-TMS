export default {
  name: "verify:driver-settlement-uses-bill-not-je",
  run(ctx) {
    ctx.run("node", ["scripts/verify-driver-settlement-uses-bill-not-je.mjs"]);
  },
};
