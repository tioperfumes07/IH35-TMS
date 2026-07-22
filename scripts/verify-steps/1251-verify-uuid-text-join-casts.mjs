export default {
  name: "verify-uuid-text-join-casts",
  run(ctx) {
    if (ctx.run("node", ["scripts/verify-uuid-text-join-casts.mjs"]) !== 0) {
      return 1;
    }
    return ctx.run("node", ["scripts/verify-uuid-text-join-casts.mjs", "--selftest"]);
  },
};
