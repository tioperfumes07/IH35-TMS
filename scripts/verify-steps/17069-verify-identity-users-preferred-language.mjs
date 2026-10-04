export default {
  name: "verify:identity-users-preferred-language",
  run(ctx) {
    ctx.run("node", ["scripts/verify-identity-users-preferred-language.mjs"]);
  },
};
