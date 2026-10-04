export default {
  name: "verify:money-fields-use-moneyinput",
  run(ctx) {
    ctx.run("node", ["scripts/verify-money-fields-use-moneyinput.mjs"]);
  },
};
