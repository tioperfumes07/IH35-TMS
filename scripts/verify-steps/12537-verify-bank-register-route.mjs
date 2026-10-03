export default {
  name: "verify:bank-register-route",
  run(ctx) {
    ctx.run("node", ["scripts/verify-bank-register-route.mjs"]);
  },
};
