export default {
  name: "verify:no-bank-line-is-matched-to-nothing",
  run(ctx) {
    ctx.run("node", ["scripts/verify-no-bank-line-is-matched-to-nothing.mjs"]);
  },
};
