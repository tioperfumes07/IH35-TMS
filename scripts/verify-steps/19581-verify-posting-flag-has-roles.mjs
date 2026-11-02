export default {
  name: "verify:posting-flag-has-roles",
  run(ctx) {
    ctx.run("node", ["scripts/verify-posting-flag-has-roles.mjs"]);
  },
};
