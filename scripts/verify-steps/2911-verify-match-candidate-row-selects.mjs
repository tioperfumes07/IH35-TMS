export default {
  name: "verify:match-candidate-row-selects",
  run(ctx) {
    ctx.run("node", ["scripts/verify-match-candidate-row-selects.mjs", "--selftest"]);
    ctx.run("node", ["scripts/verify-match-candidate-row-selects.mjs"]);
  },
};
