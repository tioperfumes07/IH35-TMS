export default {
  name: "verify-home-quickjump-counts",
  run(ctx) {
    if (ctx.run("node", ["scripts/verify-home-quickjump-counts.mjs"]) !== 0) {
      return 1;
    }
    return 0;
  },
};
