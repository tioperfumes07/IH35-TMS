export default {
  name: "verify:chain07-settlements-redirect",
  run(ctx) {
    ctx.run("node", ["scripts/verify-chain07-settlements-redirect.mjs"]);
  },
};
