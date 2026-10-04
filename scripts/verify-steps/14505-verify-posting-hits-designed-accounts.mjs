export default {
  name: "verify:posting-hits-designed-accounts",
  run(ctx) {
    ctx.run("node", ["scripts/verify-posting-hits-designed-accounts.mjs"]);
  },
};
