export default {
  name: "verify:bank-register-sign",
  run(ctx) {
    ctx.run("node", ["scripts/verify-bank-register-sign.mjs"]);
  },
};
