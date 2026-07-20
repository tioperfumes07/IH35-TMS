export default {
  name: "verify:block-ready-multiblock-resolution",
  run(ctx) {
    ctx.run("node", ["scripts/verify-block-ready-multiblock-resolution.mjs"]);
  },
};
