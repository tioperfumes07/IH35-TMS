export default {
  name: "verify-factoring-surface",
  run(ctx) {
    if (ctx.run("node", ["scripts/verify-factoring-surface.mjs"]) !== 0) {
      throw new Error("verify-factoring-surface failed");
    }
  },
};
