export default {
  name: "verify:acct-utc-today-defaults",
  run(ctx) {
    ctx.run("node", ["scripts/verify-acct-utc-today-defaults.mjs"]);
  },
};
