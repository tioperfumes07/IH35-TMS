export default {
  name: "verify:bank-register-account-picker",
  run(ctx) {
    ctx.run("node", ["scripts/verify-bank-register-account-picker.mjs"]);
  },
};
