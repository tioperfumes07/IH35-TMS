export default {
  name: "verify:no-posting-to-inactive-account",
  run(ctx) {
    ctx.run("node", ["scripts/verify-no-posting-to-inactive-account.mjs"]);
  },
};
