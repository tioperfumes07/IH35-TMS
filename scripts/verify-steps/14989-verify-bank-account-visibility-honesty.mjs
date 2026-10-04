export default {
  name: "verify:bank-account-visibility-honesty",
  run(ctx) {
    ctx.run("node", ["scripts/verify-bank-account-visibility-honesty.mjs"]);
  },
};
