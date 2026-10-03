export default {
  name: "verify:bank-deposits-make-deposit",
  run(ctx) {
    ctx.run("node", ["scripts/verify-bank-deposits-make-deposit.mjs"]);
  },
};
