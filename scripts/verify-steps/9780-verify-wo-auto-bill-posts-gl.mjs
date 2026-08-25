export default {
  name: "verify-wo-auto-bill-posts-gl",
  run(ctx) {
    if (ctx.run("node", ["scripts/verify-wo-auto-bill-posts-gl.mjs"]) !== 0) {
      throw new Error("verify-wo-auto-bill-posts-gl failed");
    }
  },
};
