export default {
  name: "verify:migration-void-reverses-gl",
  run(ctx) {
    ctx.run("node", ["scripts/verify-migration-void-reverses-gl.mjs"]);
  },
};
