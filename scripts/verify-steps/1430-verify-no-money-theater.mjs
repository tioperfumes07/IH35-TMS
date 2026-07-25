export default {
  name: "verify-no-money-theater",
  run(ctx) {
    ctx.run("node", ["scripts/verify-no-money-theater.mjs", "--selftest"]);
    ctx.run("node", ["scripts/verify-no-money-theater.mjs"]);
  },
};
