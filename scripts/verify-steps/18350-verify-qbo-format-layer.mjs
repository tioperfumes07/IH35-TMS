export default {
  name: "verify:qbo-format-layer",
  run(ctx) {
    ctx.run("node", ["scripts/verify-qbo-format-layer.mjs", "--selftest"]);
    ctx.run("node", ["scripts/verify-qbo-format-layer.mjs"]);
  },
};
