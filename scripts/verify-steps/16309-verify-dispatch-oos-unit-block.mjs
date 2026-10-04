export default {
  name: "verify:dispatch-oos-unit-block",
  run(ctx) {
    ctx.run("node", ["scripts/verify-dispatch-oos-unit-block.mjs"]);
  },
};
