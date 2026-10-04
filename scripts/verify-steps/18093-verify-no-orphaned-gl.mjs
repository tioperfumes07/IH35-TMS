export default {
  name: "verify:no-orphaned-gl",
  run(ctx) {
    ctx.run("node", ["scripts/verify-no-orphaned-gl.mjs"]);
  },
};
