export default {
  name: "verify:factor-reserve-roles-match-faro-bank-accounts",
  run(ctx) {
    ctx.run("node", ["scripts/verify-factor-reserve-roles-match-faro-bank-accounts.mjs"]);
  },
};
