export default {
  name: "verify:design-token-parity",
  run(ctx) {
    ctx.run("node", ["scripts/verify-design-token-parity.mjs"]);
  },
};
