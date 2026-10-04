export default {
  name: "verify:every-account-type-has-a-pl-or-bs-home",
  run(ctx) {
    ctx.run("node", ["scripts/verify-every-account-type-has-a-pl-or-bs-home.mjs"]);
  },
};
