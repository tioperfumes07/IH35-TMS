export default {
  name: "verify:block-ready-manifest-multiblock",
  run(ctx) {
    ctx.run("node", ["scripts/verify-block-ready-manifest-multiblock.mjs"]);
  },
};
