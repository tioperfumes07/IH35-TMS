export default {
  name: "verify:design-parity",
  run(ctx) {
    ctx.run("node", ["scripts/verify-design-parity.mjs"]);
  },
};
