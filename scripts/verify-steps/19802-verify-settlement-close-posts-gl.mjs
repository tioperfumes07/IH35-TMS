export default {
  name: "verify:settlement-close-posts-gl",
  run(ctx) {
    ctx.run("node", ["scripts/verify-settlement-close-posts-gl.mjs", "--selftest"]);
    ctx.run("node", ["scripts/verify-settlement-close-posts-gl.mjs"]);
  },
};
