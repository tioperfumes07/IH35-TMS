export default {
  name: "verify:bank-dom-03-adjusted-balance-rec",
  run(ctx) {
    return ctx.run("node", ["scripts/verify-bank-dom-03-adjusted-balance-rec.mjs"]);
  },
};
