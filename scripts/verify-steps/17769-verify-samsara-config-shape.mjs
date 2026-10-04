export default {
  name: "verify:samsara-config-shape",
  run(ctx) {
    ctx.run("node", ["scripts/verify-samsara-config-shape.mjs"]);
  },
};
