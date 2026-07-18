export default {
  name: "verify-expenses-list-route",
  run(ctx) {
    if (ctx.run("node", ["scripts/verify-expenses-list-route.mjs"]) !== 0) {
      return 1;
    }
    return ctx.run("node", ["scripts/verify-expenses-list-route.mjs", "--selftest"]);
  },
};
