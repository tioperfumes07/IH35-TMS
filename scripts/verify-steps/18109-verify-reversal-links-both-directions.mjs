export default {
  name: "verify:reversal-links-both-directions",
  run(ctx) {
    ctx.run("node", ["scripts/verify-reversal-links-both-directions.mjs"]);
  },
};
