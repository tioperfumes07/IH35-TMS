export default {
  name: "verify:is-posting-flag-void",
  run(ctx) {
    ctx.run("node", ["scripts/verify-is-posting-flag-void.mjs"]);
  },
};
