export default {
  name: "verify-csa-hazmat-source-integrity",
  run(ctx) {
    if (ctx.run("node", ["scripts/verify-csa-hazmat-source-integrity.mjs"]) !== 0) {
      return 1;
    }
    return 0;
  },
};
