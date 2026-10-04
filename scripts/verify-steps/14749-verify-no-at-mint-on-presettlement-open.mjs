export default {
  name: "verify:no-at-mint-on-presettlement-open",
  run(ctx) {
    ctx.run("node", ["scripts/verify-no-at-mint-on-presettlement-open.mjs"]);
  },
};
