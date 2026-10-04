export default {
  name: "verify:bank-match-candidate-sources",
  run(ctx) {
    ctx.run("node", ["scripts/verify-bank-match-candidate-sources.mjs"]);
  },
};
